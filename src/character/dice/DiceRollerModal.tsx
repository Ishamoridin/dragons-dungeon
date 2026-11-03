import { useEffect, useMemo, useState } from 'react'
import { Dices, EyeOff, X } from 'lucide-react'
import { ApiError } from '../Api'
import { onRollNotification, onRollReactionNotification } from '../Realtime'
import { fetchRolls, postRoll, type RollLogEntry } from '../RollApi'
import { computeEssenceStats, RESERO_ORDER, type ReseroStage } from '../essence/EssenceSystem'
import type { EssenceCharacterData } from '../essence/EssenceTypes'
import { buildRollTokens, parseRollCommand, type RollToken, type RollTokenGroup } from './RollCommand'
import RollCard from './RollCard'

export type RollerCharacter = { id: string; name: string; essence: EssenceCharacterData | null }

const DICE_CHIPS = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100']
const GROUPS: RollTokenGroup[] = ['Attributes', 'Skills', 'Combat mods', 'Resero', 'Resources']

// The dice roller: type a Roll20-style command ("/r Brawl Melee Attack", "(1d200+500)*4 Fire Damage"), or build it
// from the stat chips. Tokens resolve against the chosen character's sheet; the server rolls and logs the result.
export default function DiceRollerModal({ campaignName, characters, initialCharacterId, initialReseroStage = null, onClose }: {
  campaignName: string
  characters: RollerCharacter[]
  initialCharacterId?: string
  initialReseroStage?: ReseroStage | null
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [characterId, setCharacterId] = useState(initialCharacterId ?? characters[0]?.id ?? '')
  const [reseroStage, setReseroStage] = useState<ReseroStage | null>(initialReseroStage)
  const [secret, setSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastRoll, setLastRoll] = useState<RollLogEntry | null>(null)
  const [history, setHistory] = useState<RollLogEntry[]>([])

  const character = characters.find((option) => option.id === characterId) ?? null
  const tokens = useMemo<RollToken[]>(() => {
    if (!character?.essence) return []
    return buildRollTokens(character.essence, computeEssenceStats(character.essence, reseroStage))
  }, [character, reseroStage])

  const refreshHistory = () => fetchRolls(campaignName, 30).then((result) => setHistory(result.rolls)).catch(() => {})
  useEffect(() => {
    void refreshHistory()
    const offRolls = onRollNotification((notification) => { if (notification.campaignName === campaignName) void refreshHistory() })
    const offReactions = onRollReactionNotification((notification) => { if (notification.campaignName === campaignName) void refreshHistory() })
    return () => { offRolls(); offReactions() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignName])

  const preview = input.trim() ? parseRollCommand(input, tokens) : null

  const insert = (text: string) => {
    setInput((current) => {
      const trimmed = current.trimEnd()
      if (!trimmed) return `${text} `
      return /[+\-*/(]$/.test(trimmed) ? `${trimmed}${text} ` : `${trimmed}+${text} `
    })
  }

  const submit = async () => {
    const parsed = parseRollCommand(input, tokens)
    if ('error' in parsed) { setError(parsed.error); return }
    setBusy(true)
    setError('')
    try {
      const roll = await postRoll({
        CampaignName: campaignName,
        Command: input.trim(),
        Formula: parsed.formula,
        Label: parsed.label.slice(0, 120),
        Tokens: parsed.tokens,
        ...(character?.essence ? { CharacterId: character.id } : {}),
        Secret: secret,
      })
      setLastRoll(roll)
      setHistory((rolls) => [roll, ...rolls.filter((entry) => entry.Id !== roll.Id)])
      setInput('')
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Unable to roll right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <section className="dm-character-modal dice-roller-modal" role="dialog" aria-modal="true" aria-labelledby="dice-roller-title" onClick={(event) => event.stopPropagation()}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{campaignName}</p>
            <h2 id="dice-roller-title"><Dices size={20} aria-hidden="true" /> Dice roller</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}><X size={14} aria-hidden="true" /> Close</button>
        </header>

        <form className="dice-roller-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <label className="dice-roller-input-label" htmlFor="dice-roller-input">
            Roll command <small>e.g. /r Brawl Melee Attack · /r BrawlMod Gettem! · /r (1d200+500)*4 Fire Damage</small>
          </label>
          <div className="dice-roller-input-row">
            <input
              id="dice-roller-input"
              type="text"
              value={input}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="/r 1d20+Brawl Attack"
              onChange={(event) => { setInput(event.currentTarget.value); setError('') }}
            />
            <button type="submit" className="dice-roller-submit" disabled={busy || !input.trim()}>Roll</button>
          </div>
          {preview && ('error' in preview
            ? <p className="dice-roller-preview dice-roller-error" role="status">{preview.error}</p>
            : <p className="dice-roller-preview" role="status">
                <code>{preview.formula}</code>
                {preview.tokens.length > 0 && <span> · {preview.tokens.map((token) => `${token.Name} = ${token.Value}`).join(', ')}</span>}
                {preview.label && <span> · “{preview.label}”</span>}
              </p>)}
          {error && <p className="dice-roller-preview dice-roller-error" role="alert">{error}</p>}

          <div className="dice-roller-options">
            {characters.length > 0 && (
              <label>
                <span>Character</span>
                <select value={characterId} onChange={(event) => setCharacterId(event.currentTarget.value)}>
                  <option value="">No character (plain dice)</option>
                  {characters.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            )}
            {character?.essence && (
              <label>
                <span>Resero state</span>
                <select value={reseroStage ?? ''} onChange={(event) => setReseroStage((event.currentTarget.value || null) as ReseroStage | null)}>
                  <option value="">Sealed (none)</option>
                  {RESERO_ORDER.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </label>
            )}
            <label className="dice-roller-secret">
              <input type="checkbox" checked={secret} onChange={(event) => setSecret(event.currentTarget.checked)} />
              <span><EyeOff size={13} aria-hidden="true" /> Secret roll <small>only you and the DM see it</small></span>
            </label>
          </div>

          <div className="dice-roller-chips">
            <div className="dice-roller-chip-group">
              <h4>Dice</h4>
              <div>{DICE_CHIPS.map((chip) => <button type="button" className="skill-chip dice-chip" key={chip} onClick={() => insert(chip)}>{chip}</button>)}</div>
            </div>
            {GROUPS.map((group) => {
              const members = tokens.filter((token) => token.Group === group)
              if (members.length === 0) return null
              return (
                <div className="dice-roller-chip-group" key={group}>
                  <h4>{group}</h4>
                  <div>
                    {members.map((token) => (
                      <button type="button" className="skill-chip dice-chip" key={`${group}:${token.Name}`} title={`Insert ${token.Name} (${token.Value})`} onClick={() => insert(token.Name)}>
                        {token.Name} <small>{token.Value}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </form>

        {lastRoll && <div className="dice-roller-result"><RollCard key={lastRoll.Id} roll={lastRoll} animate /></div>}

        <section className="dice-roller-history" aria-label="Recent rolls">
          <h3>Recent rolls</h3>
          {history.length === 0
            ? <p className="campaign-empty-message">Nothing rolled yet.</p>
            : history.map((entry) => <RollCard key={entry.Id} roll={entry} />)}
        </section>
      </section>
    </div>
  )
}
