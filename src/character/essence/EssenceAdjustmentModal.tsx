import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { EssenceCharacterData } from './EssenceTypes'
import { validateEssenceChange, type EssenceChange } from './EssenceChanges'

export default function EssenceAdjustmentModal({ data, onSave, onClose }: {
  data: EssenceCharacterData
  onSave: (change: EssenceChange) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(data.Essences[0]?.Name ?? '')
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [amount, setAmount] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)
  const held = data.Essences.find((entry) => entry.Name === name)?.Amount ?? 0
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    selectRef.current?.focus()
    return () => previous?.focus()
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const quantity = Number(amount)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { setError('Enter a positive whole number.'); return }
    const change = { name, delta: mode === 'add' ? quantity : -quantity, note: note.trim() }
    const invalid = validateEssenceChange(data, change)
    if (invalid) { setError(invalid); return }
    setBusy(true); setError('')
    try { await onSave(change); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change essence.') }
    finally { setBusy(false) }
  }
  return (
    <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal essence-adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="essence-adjust-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
          if (event.key === 'Tab') {
            const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
            const first = fields[0], last = fields.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header className="dm-modal-header"><h2 id="essence-adjust-title">Add or Remove Essence</h2><button type="button" className="modal-toggle" disabled={busy} title="Close" aria-label="Close essence adjustment" onClick={onClose}><X size={18} /></button></header>
        <form className="essence-adjustment-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <label>Essence<select ref={selectRef} required value={name} onChange={(event) => { setName(event.currentTarget.value); setError('') }}>
              {[...data.Essences].sort((left, right) => left.Name.localeCompare(right.Name)).map((entry) => <option key={entry.Name} value={entry.Name}>{entry.Name}</option>)}
            </select></label>
            <p className="essence-note">Available: {held}</p>
            <div className="essence-adjustment-mode" role="radiogroup" aria-label="Essence adjustment">
              <label><input type="radio" name="essence-adjust-mode" checked={mode === 'add'} onChange={() => { setMode('add'); setError('') }} />Add</label>
              <label><input type="radio" name="essence-adjust-mode" checked={mode === 'remove'} onChange={() => { setMode('remove'); setError('') }} />Remove</label>
            </div>
            <label>Quantity<input type="number" required min={1} step={1} value={amount} onChange={(event) => setAmount(event.currentTarget.value)} /></label>
            <label>Note<textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.currentTarget.value)} /></label>
          </fieldset>
          {error && <p className="dm-console-error" role="alert">{error}</p>}
          <footer className="essence-adjustment-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !name}>{busy ? 'Saving...' : mode === 'add' ? 'Add Essence' : 'Remove Essence'}</button></footer>
        </form>
      </section>
    </div>
  )
}