import type { ReactNode } from 'react'
import { eventSkinStyle } from './EventSkinStyle'
import type { EventSkin } from './EventEffects'
import type { EventLogTarget } from './EventLogApi'

// The event as players see it: a card in the event's own skin, with the banner, the story, and what happened to
// each character listed. Used for the DM's live preview, the pop-up notification, and the log.
export default function EventCard({ title, description, skin, campaignName, meta, targets = [], ownUserId, children }: {
  title: string
  description: string
  skin: EventSkin
  campaignName: string
  meta?: string
  targets?: EventLogTarget[]
  // When set, this user's characters are listed first under "What happened to you".
  ownUserId?: string
  children?: ReactNode
}) {
  const own = ownUserId ? targets.filter((target) => target.OwnerId === ownUserId) : []
  const others = ownUserId ? targets.filter((target) => target.OwnerId !== ownUserId) : targets
  const paragraphs = description.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  return (
    <article className={`event-card${skin.banner ? ' portrait-themed' : ''}`} data-skin={skin.skin} style={eventSkinStyle(skin)}>
      {skin.banner && <div className="event-card-banner" role="img" aria-label={`Banner for ${title}`} />}
      <header className="event-card-header">
        <p className="eyebrow">{campaignName}{meta ? ` · ${meta}` : ''}</p>
        <h2>{title || 'Untitled event'}</h2>
      </header>
      <div className="event-card-body">
        {paragraphs.length > 0
          ? paragraphs.map((paragraph, index) => <p key={index} className="event-description">{paragraph}</p>)
          : <p className="event-description event-description-empty">No description.</p>}
      </div>
      {own.length > 0 && <TargetList heading="What happened to you" targets={own} />}
      {others.length > 0 && <TargetList heading={own.length > 0 ? 'Also affected' : 'Affected characters'} targets={others} />}
      {children && <footer className="event-card-actions">{children}</footer>}
    </article>
  )
}

function TargetList({ heading, targets }: { heading: string; targets: EventLogTarget[] }) {
  return (
    <section className="event-card-targets">
      <h3>{heading}</h3>
      <ul>
        {targets.map((target) => (
          <li key={target.CharacterId}>
            <strong>{target.CharacterName}</strong>
            {target.Effects.length > 0
              ? <span className="event-effect-list">{target.Effects.map((effect, index) => <span className="skill-chip" key={index}>{effect.Summary}</span>)}</span>
              : <span className="event-effect-none">No sheet changes</span>}
            {target.Error && <small className="event-target-error" role="alert">{target.Error}</small>}
          </li>
        ))}
      </ul>
    </section>
  )
}
