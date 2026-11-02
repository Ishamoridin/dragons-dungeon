import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import { switchRole } from './MockAuth'
import { api } from './Api'
import type { User, UserRole } from './User'
import type { PageSkin } from './PageSkin'
import PageSkinSelector from './PageSkinSelector'
import RoleToggle from './RoleToggle'
import GoogleSignInButton from './GoogleSignInButton'

type RefreshSummary = { checked: number; changed: number; pushed: number; skipped: number; failed: number; errors: string[] }

export default function SettingsMenu({ user, pageSkin, onSkinChange, onLogout, onUserChange }: {
  user: User
  pageSkin: PageSkin
  onSkinChange: (skin: PageSkin) => void
  onLogout: () => void
  onUserChange: (user: User) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refreshNote, setRefreshNote] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  const changeRole = async (role: UserRole) => {
    if (role === user.Role) return
    setBusy(true); setError('')
    try { await onUserChange(await switchRole(role)); setOpen(false) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change account mode.') }
    finally { setBusy(false) }
  }
  // Re-checks every linked Google Sheet the user can see; the daily poll does the same on the server.
  const refreshSheets = async () => {
    setBusy(true); setError(''); setRefreshNote('')
    try {
      const summary = await api<RefreshSummary>('/sheet-sync/refresh', 'POST')
      if (summary.checked === 0) setRefreshNote('No characters are linked to a Google Sheet.')
      else setRefreshNote(`Checked ${summary.checked}: ${summary.changed} updated from the sheet, ${summary.pushed} cells pushed${summary.failed ? `, ${summary.failed} failed (${summary.errors[0]})` : ''}.`)
      if (summary.changed > 0) window.dispatchEvent(new Event('data-restored'))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to refresh from Google Sheets.') }
    finally { setBusy(false) }
  }
  return (
    <div className="settings-menu" ref={menuRef}>
      <button type="button" className="settings-menu-trigger" aria-label="Settings" title="Settings" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}><Settings size={20} /></button>
      {open && <div className="settings-menu-panel" role="dialog" aria-label="Settings">
        <RoleToggle value={user.Role} disabled={busy} onChange={(role) => void changeRole(role)} />
        <PageSkinSelector value={pageSkin} onChange={onSkinChange} />
        {user.GoogleLinked ? <p className="settings-google-status">Google account connected</p> : <GoogleSignInButton link disabled={busy} />}
        <button type="button" className="settings-refresh-button" disabled={busy} onClick={() => void refreshSheets()}><RefreshCw size={14} aria-hidden="true" />{busy ? 'Refreshing...' : 'Refresh from Google Sheets'}</button>
        {refreshNote && <p className="settings-google-status" role="status">{refreshNote}</p>}
        {error && <p role="alert">{error}</p>}
        <button type="button" className="sign-out-button" disabled={busy} onClick={onLogout}>Sign out</button>
      </div>}
    </div>
  )
}