import { EyeOff } from 'lucide-react'
import type { RollLogEntry } from '../RollApi'
import { naturalD20 } from './RollCommand'
import { REACTION_META } from './RollReactions'
import { rollIntensity, themeForLabel } from './RollThemes'

const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, ''))

// One rolled result: the total, its label, who rolled it, and the dice behind it. Keywords in the label pick a
// theme, and `animate` plays the dramatic entrance (scaled by how close the roll came to its maximum).
export default function RollCard({ roll, animate = false }: { roll: RollLogEntry; animate?: boolean }) {
  const { theme, dramatic } = themeForLabel(roll.Label)
  const intensity = rollIntensity(roll.Total, roll.MaxTotal)
  const natural = naturalD20(roll.Rolls)
  const who = roll.CharacterName ?? roll.RollerName
  const diceText = roll.Rolls.map((group) => `${group.results.length}d${group.sides} [${group.results.join(', ')}]`).join(' · ')
  const tokenText = roll.Tokens.map((token) => `${token.Name} ${fmt(token.Value)}`).join(' · ')
  return (
    <article
      className={`roll-card${animate ? ' roll-card-enter' : ''}${animate && dramatic ? ' roll-card-dramatic' : ''}${natural === 20 ? ' roll-card-crit' : natural === 1 ? ' roll-card-fumble' : ''}`}
      data-roll-theme={theme ?? undefined}
      style={{ ['--roll-intensity' as string]: intensity }}
    >
      <div className="roll-card-total" aria-label={`Result ${fmt(roll.Total)}`}>{fmt(roll.Total)}</div>
      <div className="roll-card-body">
        <strong className="roll-card-label">
          {roll.Label || 'Roll'}
          {natural === 20 && <span className="roll-card-flag">Natural 20!</span>}
          {natural === 1 && <span className="roll-card-flag">Natural 1…</span>}
        </strong>
        <span className="roll-card-meta">
          {who}{roll.CharacterName && roll.CharacterName !== roll.RollerName ? ` (${roll.RollerName})` : ''}
          {roll.Secret && <span className="roll-card-secret"><EyeOff size={12} aria-hidden="true" /> Secret</span>}
        </span>
        <small className="roll-card-detail">{roll.Formula}{diceText ? ` · ${diceText}` : ''}{tokenText ? ` · ${tokenText}` : ''}</small>
        {(roll.Reactions?.length ?? 0) > 0 && (
          <span className="roll-card-reactions">
            {roll.Reactions!.map((reaction) => (
              <span className="roll-reaction-chip" key={reaction.UserId} title={REACTION_META[reaction.Reaction].label}>
                {REACTION_META[reaction.Reaction].emoji} {reaction.Username}
              </span>
            ))}
          </span>
        )}
      </div>
    </article>
  )
}
