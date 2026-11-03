import { useEffect, useState } from 'react'
import { Lock, Users } from 'lucide-react'
import EventCard from './EventCard'
import { acknowledgeEvent, fetchSharing, lockDateLabel, setSharing, type EventLogEntry, type SharingState } from './EventLogApi'
import { ApiError } from './Api'

// A player's event log: every event that touched one of their characters, with the campaign sharing pool controls.
export default function EventLogModal({ entries, userId, campaigns, onClose, onAcknowledged }: {
  entries: EventLogEntry[]
  userId: string
  campaigns: string[]
  onClose: () => void
  onAcknowledged: (id: string) => void
}) {
  const [campaign, setCampaign] = useState(campaigns[0] ?? '')
  const [open, setOpen] = useState<EventLogEntry | null>(null)
  useEffect(() => { if (!campaigns.includes(campaign)) setCampaign(campaigns[0] ?? '') }, [campaigns.join('\n')])
  const shown = entries.filter((entry) => !campaign || entry.CampaignName === campaign)
  const view = async (entry: EventLogEntry) => {
    setOpen(entry)
    if (entry.Unread) { try { await acknowledgeEvent(entry.Id); onAcknowledged(entry.Id) } catch { /* stays unread */ } }
  }
  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal event-log-modal" role="dialog" aria-modal="true" aria-labelledby="event-log-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{shown.filter((entry) => entry.Unread).length} unread</p>
            <h2 id="event-log-title">Events</h2>
          </div>
          {campaigns.length > 1 && (
            <label className="page-skin-control"><span>Campaign</span>
              <select value={campaign} onChange={(event) => setCampaign(event.currentTarget.value)}>{campaigns.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            </label>
          )}
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>
        {campaign && <SharingControls campaign={campaign} />}
        <div className="event-log-list">
          {shown.length === 0 && <p className="campaign-empty-message">No events have reached you{campaign ? ` in ${campaign}` : ''} yet.</p>}
          {shown.map((entry) => (
            <button type="button" className={`event-log-item${entry.Unread ? ' unread' : ''}`} key={entry.Id} onClick={() => void view(entry)}>
              <span className="event-log-item-heading">
                <strong>{entry.Title}</strong>
                {entry.Unread && <span className="unread-badge">New</span>}
              </span>
              <span className="event-log-item-meta">{entry.CampaignName} · {new Date(entry.CreatedAt).toLocaleString()}{entry.Source === 'scheduled' ? ' · scheduled' : ''}</span>
              <span className="event-effect-list">
                {entry.Targets.filter((target) => target.OwnerId === userId).flatMap((target) => target.Effects.map((effect, index) => <span className="skill-chip" key={`${target.CharacterId}-${index}`}>{target.CharacterName}: {effect.Summary}</span>))}
              </span>
            </button>
          ))}
        </div>
        {open && (
          <div className="dm-modal-backdrop event-notification-backdrop" onClick={() => setOpen(null)}>
            <section className="dm-character-modal event-notification" role="dialog" aria-modal="true" aria-label={open.Title} onClick={(event) => event.stopPropagation()}>
              <EventCard title={open.Title} description={open.Description} skin={open.Skin} campaignName={open.CampaignName} meta={new Date(open.CreatedAt).toLocaleString()} targets={open.Targets} ownUserId={userId}>
                <button type="button" className="dm-secondary-action" onClick={() => setOpen(null)}>Close</button>
              </EventCard>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

// Joining the pool shows other sharers' outcomes and locks sharing on for a week.
function SharingControls({ campaign }: { campaign: string }) {
  const [state, setState] = useState<SharingState | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setState(null); setError(''); setConfirming(false)
    fetchSharing(campaign).then((result) => { if (active) setState(result) }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load sharing.') })
    return () => { active = false }
  }, [campaign])
  const toggle = async (sharing: boolean) => {
    setBusy(true); setError(''); setConfirming(false)
    try {
      const result = await setSharing(campaign, sharing)
      setState(await fetchSharing(campaign).catch(() => ({ sharing: result.sharing, lockedUntil: result.lockedUntil, sharers: [] })))
    } catch (failure) {
      setError(failure instanceof ApiError || failure instanceof Error ? failure.message : 'Unable to change sharing.')
    } finally { setBusy(false) }
  }
  const lockedUntil = lockDateLabel(state?.lockedUntil)
  return (
    <section className="sharing-controls" aria-label="Event sharing">
      <div>
        <strong><Users size={14} aria-hidden="true" /> Sharing pool · {campaign}</strong>
        <p>{state?.sharing
          ? `You see what happens to other sharers, and they see your outcomes.${lockedUntil ? ` Sharing stays on until ${lockedUntil}.` : ''}`
          : 'Join to see what events did to other players who share. Joining locks sharing on for a week.'}</p>
        {state?.sharing && state.sharers.length > 0 && <small>Sharing: {state.sharers.map((row) => row.Username).join(', ')}</small>}
        {error && <small role="alert">{error}</small>}
      </div>
      {state && !state.sharing && !confirming && <button type="button" className="dm-secondary-action" disabled={busy} onClick={() => setConfirming(true)}>Join sharing</button>}
      {confirming && (
        <span className="dm-inline-control">
          <button type="button" className="dm-primary-action" disabled={busy} onClick={() => void toggle(true)}><Lock size={14} aria-hidden="true" />Join for a week</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      )}
      {state?.sharing && <button type="button" className="dm-secondary-action" disabled={busy || Boolean(lockedUntil)} title={lockedUntil ? `Locked until ${lockedUntil}` : undefined} onClick={() => void toggle(false)}>{lockedUntil ? <><Lock size={14} aria-hidden="true" />Locked</> : 'Leave sharing'}</button>}
    </section>
  )
}
