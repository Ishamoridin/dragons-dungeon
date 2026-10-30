import { useEffect, useRef, useState } from 'react'
import { Undo2, GitCompareArrows, X } from 'lucide-react'
import { api, loadResources } from './Api'
import type { User } from './User'
import { mergeCopies } from './RevisionMerge.mjs'

type Snapshot = Record<string, unknown> & { Version?: number; Name?: string; Data?: Record<string, unknown> }
type Conflict = { Id: string; Kind: string; TargetId: string; Base: Snapshot | null; Local: Snapshot; Server: Snapshot; SubmittedBy: string; SubmittedRole: string }
type Latest = { available: boolean; name?: string }
const payload = (conflict: Conflict, copy: Snapshot | null) => conflict.Kind === 'characters' ? copy : copy?.Data ?? null
const showValue = (value: unknown, exists: boolean) => exists ? JSON.stringify(value, null, 2) ?? 'null' : '(removed)'

function ConflictDialog({ conflict, onClose, onResolve }: { conflict: Conflict; onClose: () => void; onResolve: () => Promise<void> }) {
  const { differences } = mergeCopies(payload(conflict, conflict.Base), payload(conflict, conflict.Local)!, payload(conflict, conflict.Server)!)
  const [choices, setChoices] = useState<Record<number, 'local' | 'server'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await api(`/conflicts/${conflict.Id}/resolve`, 'POST', { expectedVersion: conflict.Server.Version ?? 0, choices: differences.map((_, index) => choices[index]) })
      await onResolve()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to resolve conflict.') }
    finally { setBusy(false) }
  }
  return (
    <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal revision-dialog" role="dialog" aria-modal="true" aria-labelledby="revision-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
          if (event.key === 'Tab') {
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
            const first = controls[0], last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header className="dm-modal-header">
          <div><p className="eyebrow">{conflict.Server.Name ?? conflict.Server.Data?.Name as string ?? conflict.TargetId}</p><h2 id="revision-title">Resolve Conflicting Copies</h2></div>
          <button ref={closeRef} type="button" title="Close comparison" aria-label="Close comparison" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="revision-copy-summary">
          <span>{conflict.SubmittedRole === 'player' ? 'Player' : 'DM'} copy: {conflict.SubmittedBy} · Version {conflict.Local.Version ?? 0}</span>
          <span>Latest saved copy · Version {conflict.Server.Version ?? 0}</span>
        </div>
        {differences.map((difference, index) => (
          <fieldset className="revision-field" key={JSON.stringify(difference.Path)} disabled={busy}>
            <legend>{difference.Path.join(' / ')}</legend>
            <div className="revision-choices">
              {(['local', 'server'] as const).map((side) => (
                <label key={side}>
                  <span><input type="radio" name={`revision-${index}`} checked={choices[index] === side} onChange={() => setChoices((current) => ({ ...current, [index]: side }))} />Keep {side === 'local' ? `${conflict.SubmittedRole === 'player' ? 'player' : 'DM'} copy` : 'saved copy'}</span>
                  <pre>{showValue(side === 'local' ? difference.Local : difference.Server, side === 'local' ? difference.LocalExists : difference.ServerExists)}</pre>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {differences.length === 0 && <p>No overlapping field changes.</p>}
        {error && <p role="alert">{error}</p>}
        <footer className="revision-footer"><button type="button" disabled={busy || differences.some((_, index) => !choices[index])} onClick={() => void submit()}>{busy ? 'Saving...' : 'Save Resolved Copy'}</button></footer>
      </section>
    </div>
  )
}

export default function HistoryControls() {
  const [user, setUser] = useState<User | null>(null)
  const [latest, setLatest] = useState<Latest>({ available: false })
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const refresh = async (account: User) => {
    const [history, pending] = await Promise.all([api<Latest>('/history/latest'), account.Role === 'dm' ? api<Conflict[]>('/conflicts') : Promise.resolve([])])
    setLatest(history); setConflicts(pending)
  }
  useEffect(() => {
    let mounted = true
    const session = async () => {
      try { const account = await api<User>('/auth/me'); if (mounted) { setUser(account); await refresh(account) } }
      catch { if (mounted) { setUser(null); setActive(null); setConflicts([]) } }
    }
    void session()
    window.addEventListener('session-changed', session)
    return () => { mounted = false; window.removeEventListener('session-changed', session) }
  }, [])
  useEffect(() => {
    if (!user) return
    const refreshSafely = () => { void refresh(user).catch(() => {}) }
    const apiError = (event: Event) => setError((event as CustomEvent<string>).detail)
    const conflict = () => { void refresh(user).then(() => { if (user.Role === 'dm') setActive('first') }).catch(() => {}) }
    window.addEventListener('data-saved', refreshSafely)
    window.addEventListener('api-error', apiError)
    window.addEventListener('api-conflict', conflict)
    const interval = window.setInterval(refreshSafely, 15000)
    return () => {
      window.removeEventListener('data-saved', refreshSafely); window.removeEventListener('api-error', apiError); window.removeEventListener('api-conflict', conflict); window.clearInterval(interval)
    }
  }, [user])
  const reloadData = async () => {
    if (!user) return
    await loadResources(user.Role)
    window.dispatchEvent(new Event('data-restored'))
    await refresh(user)
  }
  const undo = async () => {
    setBusy(true); setError(''); setMessage('')
    try { await api('/history/undo', 'POST', {}); await reloadData(); setMessage('Last saved change undone.') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Undo failed.') }
    finally { setBusy(false) }
  }
  if (!user) return null
  const selected = active === 'first' ? conflicts[0] : conflicts.find((entry) => entry.Id === active)
  return (
    <>
      <div className="revision-toolbar" aria-label="Change history">
        <button type="button" disabled={busy || !latest.available} title={latest.available ? `Undo last change: ${latest.name ?? ''}` : 'No saved change to undo'} onClick={() => void undo()}><Undo2 size={16} /><span>Undo</span></button>
        {user.Role === 'dm' && <button type="button" disabled={!conflicts.length || busy} onClick={() => { setError(''); setActive('first') }}><GitCompareArrows size={16} /><span>Conflicts ({conflicts.length})</span></button>}
        {message && <span role="status">{message}</span>}
        {error && <span role="alert">{error}</span>}
      </div>
      {selected && <ConflictDialog key={`${selected.Id}:${selected.Server.Version}`} conflict={selected} onClose={() => setActive(null)} onResolve={async () => { setActive(null); setError(''); await reloadData(); setMessage('Resolved copy saved.') }} />}
    </>
  )
}