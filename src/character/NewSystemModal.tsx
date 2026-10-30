import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { StatSystem } from './StatSystems'

export default function NewSystemModal({ systems, onSave, onClose }: {
  systems: StatSystem[]
  onSave: (system: StatSystem) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ruleset, setRuleset] = useState<StatSystem['Ruleset']>('essence')
  const [campaigns, setCampaigns] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    nameRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const campaignNames = [...new Map(campaigns.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLowerCase(), value])).values()]
    if (!normalizedName) { setError('Enter a system name.'); return }
    if (systems.some((system) => system.Name.toLowerCase() === normalizedName.toLowerCase())) { setError('A system with that name already exists.'); return }
    if (!campaignNames.length || campaignNames.length > 50 || campaignNames.some((value) => value.length > 100)) { setError('Enter between 1 and 50 campaign names, each up to 100 characters.'); return }
    const assigned = new Set(systems.flatMap((system) => system.CampaignNames.map((value) => value.toLowerCase())))
    if (campaignNames.some((value) => assigned.has(value.toLowerCase()))) { setError('A campaign name already belongs to another system.'); return }
    setBusy(true); setError('')
    try { await onSave({ Id: `system-${crypto.randomUUID()}`, Name: normalizedName, description: description.trim(), Ruleset: ruleset, CampaignNames: campaignNames }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save the system.') }
    finally { setBusy(false) }
  }

  return (
    <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal new-system-modal" role="dialog" aria-modal="true" aria-labelledby="new-system-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
          if (event.key === 'Tab') {
            const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
            const first = fields[0], last = fields.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header className="dm-modal-header">
          <h2 id="new-system-title">New System</h2>
          <button type="button" className="modal-toggle" title="Close" aria-label="Close new system" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <form className="new-system-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <label>System name<input ref={nameRef} required maxLength={80} value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
            <label>Description<textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.currentTarget.value)} /></label>
            <label>Rules template<select value={ruleset} onChange={(event) => setRuleset(event.currentTarget.value as StatSystem['Ruleset'])}><option value="essence">Essence</option><option value="private">Private</option></select></label>
            <label>Campaign names (one per line)<textarea required rows={3} maxLength={5050} value={campaigns} onChange={(event) => setCampaigns(event.currentTarget.value)} /></label>
          </fieldset>
          {error && <p className="dm-console-error" role="alert">{error}</p>}
          <footer className="new-system-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create System'}</button></footer>
        </form>
      </section>
    </div>
  )
}