import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { switchRole } from './MockAuth'
import type { User, UserRole } from './User'
import type { PageSkin } from './PageSkin'
import PageSkinSelector from './PageSkinSelector'
import RoleToggle from './RoleToggle'
import GoogleSignInButton from './GoogleSignInButton'

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
  return (
    <div className="settings-menu" ref={menuRef}>
      <button type="button" className="settings-menu-trigger" aria-label="Settings" title="Settings" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}><Settings size={20} /></button>
      {open && <div className="settings-menu-panel" role="dialog" aria-label="Settings">
        <RoleToggle value={user.Role} disabled={busy} onChange={(role) => void changeRole(role)} />
        <PageSkinSelector value={pageSkin} onChange={onSkinChange} />
        {user.GoogleLinked ? <p className="settings-google-status">Google account connected</p> : <GoogleSignInButton link disabled={busy} />}
        {error && <p role="alert">{error}</p>}
        <button type="button" className="sign-out-button" disabled={busy} onClick={onLogout}>Sign out</button>
      </div>}
    </div>
  )
}