import { useState } from 'react'
import { ARMOUR_SLOTS, type ArmourCatalogEntry } from './EssenceItemCatalog'

const BLANK_TYPE = ''

export default function ArmourCatalogModal({
  entry,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  entry: ArmourCatalogEntry
  isNew: boolean
  onSave: (entry: ArmourCatalogEntry) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [slot, setSlot] = useState(entry.Slot)
  const [name, setName] = useState(entry.Name)
  const [type, setType] = useState(entry.Type || BLANK_TYPE)
  const [armourValue, setArmourValue] = useState(String(entry.ArmourValue))
  const [dodgeMod, setDodgeMod] = useState(String(entry.DodgeMod))
  const [defenseMod, setDefenseMod] = useState(String(entry.DefenseMod))
  const [athleticsMod, setAthleticsMod] = useState(String(entry.AthleticsMod))
  const [maxReiMod, setMaxReiMod] = useState(String(entry.MaxReiMod))
  const [burden, setBurden] = useState(String(entry.Burden))
  const [armourMod, setArmourMod] = useState(String(entry.ArmourMod))
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const num = (text: string): number => {
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('An item needs a name.')
      return
    }
    onSave({
      Id: entry.Id,
      Slot: slot,
      Name: name.trim(),
      Type: type.trim(),
      ArmourValue: num(armourValue),
      DodgeMod: num(dodgeMod),
      DefenseMod: num(defenseMod),
      AthleticsMod: num(athleticsMod),
      MaxReiMod: num(maxReiMod),
      Burden: num(burden),
      ArmourMod: num(armourMod),
    })
  }

  const number = (label: string, value: string, set: (value: string) => void) => (
    <label className="dm-field-label">{label}
      <input
        type="number"
        value={value}
        onChange={(event) => { set(event.currentTarget.value); setError('') }}
      />
    </label>
  )

  return (
    <div className="dm-modal-backdrop" onClick={onClose}>
      <form className="dm-character-modal technique-modal" role="dialog" aria-modal="true" aria-labelledby="item-catalog-modal-title" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{isNew ? 'New catalog item' : 'Edit catalog item'}</p>
            <h2 id="item-catalog-modal-title">{name.trim() || 'Untitled item'}</h2>
          </div>
          <button type="button" className="modal-toggle" onClick={onClose}>Close</button>
        </header>

        <div className="technique-fields">
          <label className="dm-field-label">Slot
            <select value={slot} onChange={(event) => { setSlot(event.currentTarget.value); setError('') }}>
              {ARMOUR_SLOTS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="dm-field-label">Name
            <input autoFocus={isNew} value={name} onChange={(event) => { setName(event.currentTarget.value); setError('') }} />
          </label>
          <label className="dm-field-label">Type
            <input value={type} onChange={(event) => { setType(event.currentTarget.value); setError('') }} />
          </label>
          {number('Armour value', armourValue, setArmourValue)}
          {number('Armour mod', armourMod, setArmourMod)}
          {number('Dodge mod', dodgeMod, setDodgeMod)}
          {number('Defense mod', defenseMod, setDefenseMod)}
          {number('Athletics mod', athleticsMod, setAthleticsMod)}
          {number('Max Reiryoku mod', maxReiMod, setMaxReiMod)}
          {number('Burden (size)', burden, setBurden)}
        </div>

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
          <button type="submit" className="dm-primary-action">{isNew ? 'Add item' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  )
}
