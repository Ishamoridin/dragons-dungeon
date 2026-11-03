import { apiOrigin } from './Api'

// Live updates. The API announces every committed write over a WebSocket at /api/events; this module keeps one
// connection open while a user is signed in and re-broadcasts each message as a `data-changed` window event
// carrying { kind, id, action, version, actorId }. Views listen for that and re-fetch through the usual routes.

export type DataChange = { type: 'change'; kind: string; id: string; action: 'create' | 'update' | 'delete'; version: number; actorId: string | null }
// A fired event addressed to this user; the entry itself is fetched from /api/event-log.
export type EventNotification = { type: 'event-notification'; id: string; campaignName: string; title: string }
// A dice roll this user may see; the entry itself is fetched from /api/rolls.
export type RollNotification = { type: 'roll'; id: string; campaignName: string }
// Someone reacted to a natural 20 or 1; the updated entry is fetched from /api/rolls.
export type RollReactionNotification = { type: 'roll-reaction'; id: string; campaignName: string }

const MAX_BACKOFF_MS = 30_000

let socket: WebSocket | null = null
let wanted = false
let attempts = 0
let retry: number | null = null

export const realtimeUrl = (): string => {
  const base = apiOrigin || window.location.origin
  return `${base.replace(/^http/, 'ws')}/api/events`
}

function open() {
  if (socket || !wanted || typeof WebSocket === 'undefined') return
  const ws = new WebSocket(realtimeUrl())
  socket = ws
  ws.onopen = () => { attempts = 0; window.dispatchEvent(new Event('realtime-connected')) }
  ws.onmessage = (event) => {
    let message: { type?: string; kind?: string; id?: string } | null = null
    try { message = JSON.parse(String(event.data)) } catch { return }
    if (message?.type === 'change' && message.kind && message.id) {
      window.dispatchEvent(new CustomEvent<DataChange>('data-changed', { detail: message as DataChange }))
    } else if (message?.type === 'event-notification' && message.id) {
      window.dispatchEvent(new CustomEvent<EventNotification>('event-notification', { detail: message as EventNotification }))
    } else if (message?.type === 'roll' && message.id) {
      window.dispatchEvent(new CustomEvent<RollNotification>('roll-notification', { detail: message as RollNotification }))
    } else if (message?.type === 'roll-reaction' && message.id) {
      window.dispatchEvent(new CustomEvent<RollReactionNotification>('roll-reaction-notification', { detail: message as RollReactionNotification }))
    }
  }
  ws.onerror = () => ws.close()
  ws.onclose = () => {
    if (socket === ws) socket = null
    window.dispatchEvent(new Event('realtime-disconnected'))
    if (!wanted) return
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 5))
    attempts += 1
    retry = window.setTimeout(() => { retry = null; open() }, delay)
  }
}

export function connectRealtime(): void {
  wanted = true
  open()
}

export function disconnectRealtime(): void {
  wanted = false
  if (retry !== null) { window.clearTimeout(retry); retry = null }
  socket?.close()
  socket = null
}

// Coalesces a burst of change events into one callback.
export function onDataChanged(handler: (changes: DataChange[]) => void, delayMs = 200): () => void {
  let pending: DataChange[] = []
  let timer: number | null = null
  const listener = (event: Event) => {
    pending.push((event as CustomEvent<DataChange>).detail)
    if (timer !== null) return
    timer = window.setTimeout(() => { timer = null; const batch = pending; pending = []; handler(batch) }, delayMs)
  }
  window.addEventListener('data-changed', listener)
  return () => { window.removeEventListener('data-changed', listener); if (timer !== null) window.clearTimeout(timer) }
}

export function onEventNotification(handler: (notification: EventNotification) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<EventNotification>).detail)
  window.addEventListener('event-notification', listener)
  return () => window.removeEventListener('event-notification', listener)
}

export function onRollNotification(handler: (notification: RollNotification) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<RollNotification>).detail)
  window.addEventListener('roll-notification', listener)
  return () => window.removeEventListener('roll-notification', listener)
}

export function onRollReactionNotification(handler: (notification: RollReactionNotification) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<RollReactionNotification>).detail)
  window.addEventListener('roll-reaction-notification', listener)
  return () => window.removeEventListener('roll-reaction-notification', listener)
}
