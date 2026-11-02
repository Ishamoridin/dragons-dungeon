import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Campaign, CampaignEvent } from './Campaign'

// An interactive timeline: time runs left to right, locations are lanes top to bottom. Pending events can be dragged
// (or nudged with the arrow keys) to a new time and lane; applied events stay where they happened.
const UNPLACED = 'Unplaced'
const HOUR = 60 * 60 * 1000
const SNAP = 15 * 60 * 1000

type Drag = { id: string; startX: number; startY: number; originAt: number; originLane: number; at: number; lane: number }

export default function TimelineBoard({ campaign, onMove, onOpen }: {
  campaign: Campaign
  onMove: (eventId: string, scheduledAt: Date, location: string) => void
  onOpen?: (event: CampaignEvent) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [error, setError] = useState('')

  const lanes = [UNPLACED, ...campaign.Monsters.map((group) => group.Location)]
  for (const event of campaign.scheduledEvents) if (event.Location && !lanes.includes(event.Location)) lanes.push(event.Location)
  const laneOf = (event: CampaignEvent) => Math.max(0, lanes.indexOf(event.Location || UNPLACED))

  const now = campaign.currentTime.getTime()
  const times = campaign.scheduledEvents.map((event) => event.ScheduledAt.getTime())
  const rawStart = Math.min(now, ...times)
  const rawEnd = Math.max(now + 24 * HOUR, ...times)
  const pad = Math.max(2 * HOUR, (rawEnd - rawStart) * 0.08)
  const start = rawStart - pad
  const end = rawEnd + pad
  const span = end - start
  const xFor = (time: number) => ((time - start) / span) * 100
  const timeAt = (clientX: number) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return now
    return start + ((clientX - rect.left) / rect.width) * span
  }
  const snap = (time: number) => Math.round(time / SNAP) * SNAP

  const tickCount = 6
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => start + (span * index) / tickCount)
  const multiDay = span > 36 * HOUR
  const label = (time: number) => new Date(time).toLocaleString(undefined, multiDay ? { month: 'short', day: 'numeric', hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' })

  const commit = (eventId: string, at: number, lane: number) => {
    setError('')
    try { onMove(eventId, new Date(at), lanes[lane] === UNPLACED ? '' : lanes[lane]) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to move the event.') }
  }

  const startDrag = (event: CampaignEvent) => (pointer: PointerEvent<HTMLButtonElement>) => {
    if (event.Completed) return
    pointer.currentTarget.setPointerCapture(pointer.pointerId)
    const at = event.ScheduledAt.getTime()
    const lane = laneOf(event)
    setDrag({ id: event.Id, startX: pointer.clientX, startY: pointer.clientY, originAt: at, originLane: lane, at, lane })
  }
  const moveDrag = (pointer: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    const laneHeight = rect.height / lanes.length
    const at = Math.max(now + SNAP, snap(drag.originAt + (timeAt(pointer.clientX) - timeAt(drag.startX))))
    const lane = Math.min(lanes.length - 1, Math.max(0, drag.originLane + Math.round((pointer.clientY - drag.startY) / laneHeight)))
    setDrag({ ...drag, at, lane })
  }
  const endDrag = () => {
    if (!drag) return
    const moved = drag.at !== drag.originAt || drag.lane !== drag.originLane
    setDrag(null)
    if (moved) commit(drag.id, drag.at, drag.lane)
  }
  useEffect(() => {
    if (!drag) return
    const cancel = (keyboard: globalThis.KeyboardEvent) => { if (keyboard.key === 'Escape') setDrag(null) }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [drag])

  const nudge = (event: CampaignEvent) => (keyboard: KeyboardEvent<HTMLButtonElement>) => {
    if (event.Completed) return
    const at = event.ScheduledAt.getTime()
    const lane = laneOf(event)
    const step = keyboard.shiftKey ? 24 * HOUR : HOUR
    if (keyboard.key === 'ArrowRight') { keyboard.preventDefault(); commit(event.Id, at + step, lane) }
    else if (keyboard.key === 'ArrowLeft') { keyboard.preventDefault(); commit(event.Id, Math.max(now + SNAP, at - step), lane) }
    else if (keyboard.key === 'ArrowDown') { keyboard.preventDefault(); commit(event.Id, at, Math.min(lanes.length - 1, lane + 1)) }
    else if (keyboard.key === 'ArrowUp') { keyboard.preventDefault(); commit(event.Id, at, Math.max(0, lane - 1)) }
    else if ((keyboard.key === 'Enter' || keyboard.key === ' ') && onOpen) { keyboard.preventDefault(); onOpen(event) }
  }

  return (
    <div className="timeline-board-wrap">
      <p className="essence-note">Drag an event right or left to change when it happens, up or down to change where. Arrow keys nudge by an hour (Shift for a day) or a lane. Applied events are fixed.</p>
      <div className="timeline-board" style={{ gridTemplateRows: `repeat(${lanes.length}, minmax(56px, auto))` }}>
        <div className="timeline-lane-labels">
          {lanes.map((lane) => <div className="timeline-lane-label" key={lane}>{lane}</div>)}
        </div>
        <div className="timeline-lanes" ref={boardRef}>
          {lanes.map((lane) => <div className="timeline-lane" key={lane} />)}
          <div className="timeline-now-line" style={{ left: `${xFor(now)}%` }} title={`Now · ${campaign.currentTime.toLocaleString()}`}><span>Now</span></div>
          {campaign.scheduledEvents.map((event) => {
            const dragging = drag?.id === event.Id
            const at = dragging ? drag.at : event.ScheduledAt.getTime()
            const lane = dragging ? drag.lane : laneOf(event)
            return (
              <button
                type="button"
                key={event.Id}
                className={`timeline-chip timeline-chip-${event.Type}${event.Completed ? ' timeline-chip-completed' : ''}${dragging ? ' timeline-chip-dragging' : ''}`}
                style={{ left: `${xFor(at)}%`, top: `calc(${(lane / lanes.length) * 100}% + 8px)` }}
                title={`${event.Title} · ${new Date(at).toLocaleString()} · ${lanes[lane]}${event.Completed ? ' · applied' : ''}`}
                aria-label={`${event.Title}, ${event.Type}, ${new Date(at).toLocaleString()}, ${lanes[lane]}${event.Completed ? ', applied' : ', drag or use arrow keys to move'}`}
                onPointerDown={startDrag(event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={nudge(event)}
                onDoubleClick={() => onOpen?.(event)}
              >
                <span className="event-type-tag">{event.Type}</span>
                <strong>{event.Title}</strong>
                <small>{new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
              </button>
            )
          })}
        </div>
        <div className="timeline-ticks">
          {ticks.map((tick) => <span key={tick} style={{ left: `${xFor(tick)}%` }}>{label(tick)}</span>)}
        </div>
      </div>
      {error && <p className="dm-console-error" role="alert">{error}</p>}
    </div>
  )
}
