import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api } from './Api'
import type { User } from './User'
import type { StatSystem } from './StatSystems'
import { importCharacterSheetFromGoogleSheets, type SheetImportResult } from './CharacterSheetDatabase'

type Account = Pick<User, 'Id' | 'Username' | 'Role'>

// Paste a Google Sheets link; the API downloads the workbook, detects (or creates) the stat system, reads the
// campaign from the sheet's "Campaign:" cell, builds the character, and keeps it linked for ongoing sync.
export default function ImportSheetModal({ user, systems, onImported, onClose }: {
  user: User
  systems: StatSystem[]
  onImported: (result: SheetImportResult) => Promise<void> | void
  onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [ownerId, setOwnerId] = useState(user.Id)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)
  const isDm = user.Role === 'dm'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    urlRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Only DMs can import on behalf of other accounts; players always import for themselves.
  useEffect(() => {
    if (!isDm) return
    let cancelled = false
    api<Account[]>('/accounts').then((rows) => { if (!cancelled) setAccounts(rows) }).catch(() => { /* owner picker falls back to the DM */ })
    return () => { cancelled = true }
  }, [isDm])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const link = url.trim()
    if (!/docs\.google\.com\/spreadsheets\/d\//.test(link)) { setError('Paste a Google Sheets link (docs.google.com/spreadsheets/d/...).'); return }
    setBusy(true); setError('')
    try {
      const result = await importCharacterSheetFromGoogleSheets({ url: link, ownerId: ownerId === user.Id ? undefined : ownerId })
      await onImported(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to import the character.')
    } finally {
      setBusy(false)
    }
  }

  const knownSystems = systems.filter((system) => !system.Hidden).map((system) => system.Name).join(', ')

  return (
    <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal new-system-modal" role="dialog" aria-modal="true" aria-labelledby="import-sheet-title" onClick={(event) => event.stopPropagation()}
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
          <h2 id="import-sheet-title">Import from Google Sheets</h2>
          <button type="button" className="modal-toggle" title="Close" aria-label="Close import" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <form className="new-system-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <label>Google Sheets link
              <input ref={urlRef} required type="url" inputMode="url" placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
            </label>
            {isDm && <label>Owner account
              <select value={ownerId} onChange={(event) => setOwnerId(event.currentTarget.value)}>
                <option value={user.Id}>{user.Username} (you)</option>
                {accounts.filter((account) => account.Id !== user.Id).map((account) => <option key={account.Id} value={account.Id}>{account.Username} · {account.Role}</option>)}
              </select>
            </label>}
          </fieldset>
          <p className="essence-note">
            The sheet must be shared as "Anyone with the link can view" (or with the API's service account). The campaign is read from a cell labelled "Campaign:" in the workbook. {isDm
              ? <>The workbook's rules are matched against your systems{knownSystems ? ` (${knownSystems})` : ''}; an unknown ruleset becomes a new system.</>
              : <>The character is added to your account under your DM's systems.</>} The character stays linked, so later edits in the sheet flow into the app.
          </p>
          {error && <p className="dm-console-error" role="alert">{error}</p>}
          <footer className="new-system-footer">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? 'Importing...' : 'Import character'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
