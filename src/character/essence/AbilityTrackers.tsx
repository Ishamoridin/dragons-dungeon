import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { EssenceCharacterData } from './EssenceTypes'

// Names suggested from ability text so common long-term counters are one click to start tracking.
const SUGGESTION_PATTERNS: [RegExp, string][] = [
  [/\bcharges?\b/i, 'Charges'],
  [/\bstack(?:s|ing)?\b/i, 'Stacks'],
  [/\brank(?:s|ed)?\b/i, 'Ranks'],
  [/\b(?:uses?|per session|\/session)\b/i, 'Uses this session'],
  [/\bper (?:day|week)\b/i, 'Uses this period'],
  [/\bpotential damage\b/i, 'Potential stored'],
  [/\bcorruption\b/i, 'Corruption'],
]

export function suggestedTrackerNames(text: string): string[] {
  return SUGGESTION_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, name]) => name)
}

export function setAbilityTracker(
  draft: EssenceCharacterData,
  abilityKey: string,
  name: string,
  value: number | null,
): void {
  const all = { ...(draft.AbilityTrackers ?? {}) }
  const bucket = { ...(all[abilityKey] ?? {}) }
  if (value === null) delete bucket[name]
  else bucket[name] = value
  if (Object.keys(bucket).length > 0) all[abilityKey] = bucket
  else delete all[abilityKey]
  draft.AbilityTrackers = all
}

export default function AbilityTrackers({ abilityKey, sourceText, trackers, onEdit }: {
  abilityKey: string
  sourceText: string
  trackers?: Record<string, number>
  onEdit?: (mutate: (draft: EssenceCharacterData) => void) => void
}) {
  const [newName, setNewName] = useState('')
  const entries = Object.entries(trackers ?? {}).sort(([left], [right]) => left.localeCompare(right))
  const suggestions = onEdit
    ? suggestedTrackerNames(sourceText).filter((name) => !entries.some(([existing]) => existing.toLowerCase() === name.toLowerCase()))
    : []

  if (!onEdit && entries.length === 0) return null
  const save = (name: string, value: number | null) => onEdit?.((draft) => setAbilityTracker(draft, abilityKey, name, value))
  const add = (name: string) => {
    const trimmed = name.trim().slice(0, 60)
    if (!trimmed || entries.some(([existing]) => existing.toLowerCase() === trimmed.toLowerCase())) return
    save(trimmed, 0)
    setNewName('')
  }

  return (
    <div className="ability-trackers">
      <strong className="ability-trackers-title">Long-term tracking</strong>
      {entries.length === 0 && !onEdit ? null : (
        <div className="ability-trackers-grid">
          {entries.map(([name, value]) => (
            <label className="ability-tracker" key={name}>
              <span>{name}</span>
              <span className="ability-tracker-controls">
                {onEdit ? (
                  <input
                    type="number"
                    step={1}
                    value={value}
                    aria-label={`${name} value`}
                    onChange={(event) => {
                      const next = event.currentTarget.valueAsNumber
                      if (Number.isFinite(next)) save(name, next)
                    }}
                  />
                ) : (
                  <strong>{value}</strong>
                )}
                {onEdit && (
                  <button type="button" title={`Stop tracking ${name}`} aria-label={`Stop tracking ${name}`} onClick={() => save(name, null)}>
                    <X size={13} />
                  </button>
                )}
              </span>
            </label>
          ))}
          {onEdit && (
            <div className="ability-tracker ability-tracker-add">
              <span className="ability-tracker-controls">
                <input
                  value={newName}
                  placeholder="Track a variable"
                  aria-label={`New tracked variable for ${abilityKey.split(':').pop()}`}
                  maxLength={60}
                  onChange={(event) => setNewName(event.currentTarget.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(newName) } }}
                />
                <button type="button" title="Add tracked variable" aria-label="Add tracked variable" disabled={!newName.trim()} onClick={() => add(newName)}>
                  <Plus size={13} />
                </button>
              </span>
            </div>
          )}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="ability-tracker-suggestions">
          {suggestions.map((name) => (
            <button type="button" key={name} onClick={() => add(name)}>+ {name}</button>
          ))}
        </div>
      )}
    </div>
  )
}
