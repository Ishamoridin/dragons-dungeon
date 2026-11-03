import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { onRollNotification, onRollReactionNotification } from '../Realtime'
import { fetchRolls, postRollReaction, type RollLogEntry, type RollReactionKind } from '../RollApi'
import RollCard from './RollCard'
import { naturalD20 } from './RollCommand'
import { REACTION_META, reactionsForNatural } from './RollReactions'

const TOAST_MS = 9000
const REACTION_TOAST_MS = 7000

type ReactionToast = { key: string; emoji: string; text: string }

// Live roll pop-ups: when the socket announces a roll by someone else, fetch the entry and float it in the corner
// with its themed entrance. A natural 20 or 1 adds reaction buttons (celebrate, envy, dismiss as luck; laugh,
// mock, commiserate), and incoming reactions float back as their own small toasts.
export default function RollToasts({ ownUserId }: { ownUserId: string }) {
  const [toasts, setToasts] = useState<RollLogEntry[]>([])
  const [reactionToasts, setReactionToasts] = useState<ReactionToast[]>([])
  const seen = useRef(new Set<string>())

  const dismiss = (id: string) => setToasts((current) => current.filter((entry) => entry.Id !== id))

  useEffect(() => onRollNotification((notification) => {
    if (seen.current.has(notification.id)) return
    seen.current.add(notification.id)
    void fetchRolls(notification.campaignName, 10).then(({ rolls }) => {
      const roll = rolls.find((entry) => entry.Id === notification.id)
      if (!roll || roll.RollerId === ownUserId) return
      setToasts((current) => [roll, ...current].slice(0, 4))
      // A natural roll stays up longer so there is time to react.
      window.setTimeout(() => dismiss(roll.Id), naturalD20(roll.Rolls) === 20 || naturalD20(roll.Rolls) === 1 ? TOAST_MS * 2 : TOAST_MS)
    }).catch(() => {})
  }), [ownUserId])

  useEffect(() => onRollReactionNotification((notification) => {
    void fetchRolls(notification.campaignName, 30).then(({ rolls }) => {
      const roll = rolls.find((entry) => entry.Id === notification.id)
      const reaction = roll?.Reactions?.[roll.Reactions.length - 1]
      if (!roll || !reaction || reaction.UserId === ownUserId) return
      const owner = roll.RollerId === ownUserId ? 'your' : `${roll.CharacterName ?? roll.RollerName}'s`
      const meta = REACTION_META[reaction.Reaction]
      const key = `${roll.Id}:${reaction.UserId}:${reaction.CreatedAt}`
      setReactionToasts((current) => [{ key, emoji: meta.emoji, text: `${reaction.Username} ${meta.phrase(owner)}` }, ...current.filter((toast) => toast.key !== key)].slice(0, 4))
      window.setTimeout(() => setReactionToasts((current) => current.filter((toast) => toast.key !== key)), REACTION_TOAST_MS)
    }).catch(() => {})
  }), [ownUserId])

  const react = async (roll: RollLogEntry, reaction: RollReactionKind) => {
    dismiss(roll.Id)
    try { await postRollReaction(roll.Id, reaction) } catch { /* the roll may have aged out; nothing to recover */ }
  }

  if (toasts.length === 0 && reactionToasts.length === 0) return null
  return (
    <div className="roll-toasts" role="log" aria-label="Incoming rolls" aria-live="polite">
      {reactionToasts.map((toast) => (
        <p className="roll-reaction-toast roll-card-enter" key={toast.key}>
          <span className="roll-reaction-toast-emoji" aria-hidden="true">{toast.emoji}</span>
          {toast.text}
        </p>
      ))}
      {toasts.map((roll) => {
        const reactions = reactionsForNatural(naturalD20(roll.Rolls))
        return (
          <div className="roll-toast" key={roll.Id}>
            <RollCard roll={roll} animate />
            <div className="roll-toast-actions">
              {reactions.map((reaction) => (
                <button type="button" className="roll-reaction-button" key={reaction} onClick={() => void react(roll, reaction)}>
                  <span aria-hidden="true">{REACTION_META[reaction].emoji}</span> {REACTION_META[reaction].label}
                </button>
              ))}
              <button type="button" className="roll-toast-dismiss" onClick={() => dismiss(roll.Id)} aria-label="Dismiss roll">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
