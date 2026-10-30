import { useState } from 'react'
import type { EssenceTechnique } from './EssenceTypes'
import { composeTechniqueDescription, techniqueDescriptionParts } from './TechniqueLibrary'

const ACTION_SUGGESTIONS = ['Major Action', 'Minor', 'Full Turn', 'Reaction', 'Passive', 'Passive Active', 'Not Applicable']

// Costs stay numbers when numeric so the combat list can parse them; anything else is kept as written.
const toCost = (text: string): number | string => {
  const trimmed = text.trim()
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed
}

export default function TechniqueModal({
  technique,
  isNew,
  sourceLabel,
  onSave,
  onDelete,
  onClose,
}: {
  technique: EssenceTechnique
  isNew: boolean
  sourceLabel: string
  onSave: (technique: EssenceTechnique) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(technique.Name)
  const [minReiryoku, setMinReiryoku] = useState(String(technique.MinReiryoku))
  const [maxReiryoku, setMaxReiryoku] = useState(String(technique.MaxReiryoku))
  const [minSkill, setMinSkill] = useState(technique.MinSkill)
  const [dc, setDc] = useState(technique.DC)
  const [action, setAction] = useState(technique.Action)
  const [range, setRange] = useState(technique.Range)
  const [damage, setDamage] = useState(technique.Damage)
  const [flavour, setFlavour] = useState(() => techniqueDescriptionParts(technique).Flavour)
  const [passiveEffect, setPassiveEffect] = useState(() => techniqueDescriptionParts(technique).PassiveEffect)
  const [activeEffect, setActiveEffect] = useState(() => techniqueDescriptionParts(technique).ActiveEffect)
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('A technique needs a name.')
      return
    }
    onSave({
      Name: name.trim(),
      MinReiryoku: toCost(minReiryoku),
      MaxReiryoku: toCost(maxReiryoku),
      MinSkill: minSkill,
      DC: dc,
      Action: action,
      Range: range,
      Damage: damage,
      Flavour: flavour.trim(),
      PassiveEffect: passiveEffect.trim(),
      ActiveEffect: activeEffect.trim(),
      Details: composeTechniqueDescription({ Flavour: flavour, PassiveEffect: passiveEffect, ActiveEffect: activeEffect }),
    })
  }

  const text = (label: string, value: string, set: (value: string) => void, extra?: { list?: string; autoFocus?: boolean }) => (
    <label className="dm-field-label">{label}
      <input
        value={value}
        list={extra?.list}
        autoFocus={extra?.autoFocus}
        onChange={(event) => {
          const next = event.currentTarget.value
          set(next)
          setError('')
        }}
      />
    </label>
  )

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <form className="dm-character-modal technique-modal" role="dialog" aria-modal="true" aria-labelledby="technique-modal-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{isNew ? 'New technique' : `Technique · ${sourceLabel}`}</p>
            <h2 id="technique-modal-title">{name.trim() || 'Untitled technique'}</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>

        <div className="technique-fields">
          {text('Technique Name', name, setName, { autoFocus: isNew })}
          {text('Action Type', action, setAction, { list: 'technique-action-types' })}
          {text('Minimum Reiryoku Cost', minReiryoku, setMinReiryoku)}
          {text('Maximum Reiryoku Cost', maxReiryoku, setMaxReiryoku)}
          {text('Minimum Skill', minSkill, setMinSkill)}
          {text('DC Required', dc, setDc)}
          {text('Technique Range', range, setRange)}
          {text('Damage', damage, setDamage)}
        </div>
        <datalist id="technique-action-types">
          {ACTION_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}
        </datalist>
        <label className="dm-field-label">Flavour
          <textarea aria-label="Flavour" rows={3} value={flavour} onChange={(event) => setFlavour(event.currentTarget.value)} />
        </label>
        <label className="dm-field-label">Passive Effect
          <textarea aria-label="Passive Effect" rows={4} value={passiveEffect} onChange={(event) => setPassiveEffect(event.currentTarget.value)} />
        </label>
        <label className="dm-field-label">Active Effect
          <textarea aria-label="Active Effect" rows={4} value={activeEffect} onChange={(event) => setActiveEffect(event.currentTarget.value)} />
        </label>

        {error && <p className="schedule-error" role="alert">{error}</p>}
        <div className="change-dialog-actions">
          {onDelete && (confirmingDelete ? (
            <>
              <button type="button" className="dev-log-delete" onClick={onDelete}>Confirm delete</button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="dev-log-delete" onClick={() => setConfirmingDelete(true)}>Delete</button>
          ))}
          <button type="submit" className="dm-primary-action">{isNew ? 'Add technique' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  )
}
