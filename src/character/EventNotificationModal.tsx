import { useState } from 'react'
import EventCard from './EventCard'
import { acknowledgeEvent, type EventLogEntry } from './EventLogApi'

// Pops the newest unread event over the sheet. Acknowledging marks it read on the server and moves to the next.
export default function EventNotificationModal({ entries, userId, onAcknowledged, onLater }: {
  entries: EventLogEntry[]
  userId: string
  onAcknowledged: (id: string) => void
  onLater: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const entry = entries[0]
  if (!entry) return null
  const acknowledge = async () => {
    setBusy(true); setError('')
    try { await acknowledgeEvent(entry.Id); onAcknowledged(entry.Id) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to acknowledge the event.') }
    finally { setBusy(false) }
  }
  return (
    <div className="dm-modal-backdrop event-notification-backdrop" onClick={onLater}>
      <section className="dm-character-modal event-notification" role="dialog" aria-modal="true" aria-label={entry.Title} onClick={(event) => event.stopPropagation()}>
        <EventCard title={entry.Title} description={entry.Description} skin={entry.Skin} campaignName={entry.CampaignName} meta={new Date(entry.CreatedAt).toLocaleString()} targets={entry.Targets} ownUserId={userId}>
          {entries.length > 1 && <span className="event-queue-note">{entries.length - 1} more waiting</span>}
          {error && <small role="alert">{error}</small>}
          <button type="button" className="dm-secondary-action" disabled={busy} onClick={onLater}>Later</button>
          <button type="button" className="dm-primary-action" disabled={busy} onClick={() => void acknowledge()}>{busy ? 'Saving...' : 'Acknowledge'}</button>
        </EventCard>
      </section>
    </div>
  )
}
