import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { api } from './Api'
import { authenticateUser, restoreSession } from './MockAuth'
import type { User } from './User'

type EmailRequest = { ok: true; email: string; delivered: boolean; previewCode?: string }

// Account settings: change the email address (confirmed by a code sent to the new address) or the password
// (current password, then the new one twice, all masked).
export default function AccountModal({ user, onUserChange, onClose }: {
  user: User
  onUserChange: (user: User) => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [pendingEmail, setPendingEmail] = useState<EmailRequest | null>(null)
  const [code, setCode] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [emailError, setEmailError] = useState('')

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordNote, setPasswordNote] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const requestEmailChange = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setEmailError(''); setEmailNote('')
    try {
      const result = await api<EmailRequest>('/account/email/request', 'POST', { email: newEmail.trim(), currentPassword: emailPassword })
      setPendingEmail(result)
      setEmailPassword('')
      setEmailNote(result.delivered
        ? `We sent a six-digit code to ${result.email}. Enter it below within 15 minutes to switch to that address.`
        : `Email delivery is not configured on this server; the confirmation code is ${result.previewCode}.`)
    } catch (failure) { setEmailError(failure instanceof Error ? failure.message : 'Unable to start the email change.') }
    finally { setBusy(false) }
  }

  const confirmEmailChange = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setEmailError('')
    try {
      await api('/account/email/confirm', 'POST', { code: code.trim() })
      const refreshed = await restoreSession()
      if (refreshed) await onUserChange(refreshed)
      setPendingEmail(null); setCode(''); setNewEmail('')
      setEmailNote('Your email address has been updated.')
    } catch (failure) { setEmailError(failure instanceof Error ? failure.message : 'Unable to confirm the new address.') }
    finally { setBusy(false) }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(''); setPasswordNote('')
    if (nextPassword !== confirmPassword) { setPasswordError('The new passwords do not match.'); return }
    if (nextPassword.length < 12) { setPasswordError('Use at least 12 characters.'); return }
    if (nextPassword === currentPassword) { setPasswordError('Choose a password different from the current one.'); return }
    setBusy(true)
    try {
      await api(`/accounts/${user.Id}`, 'PATCH', { Password: nextPassword, CurrentPassword: currentPassword })
      // Changing the password signs out every session, including this one; sign straight back in with the new one.
      const again = await authenticateUser(user.Username, nextPassword)
      if (again) await onUserChange(again)
      setCurrentPassword(''); setNextPassword(''); setConfirmPassword('')
      setPasswordNote('Your password has been changed. Other devices will need to sign in again.')
    } catch (failure) { setPasswordError(failure instanceof Error ? failure.message : 'Unable to change the password.') }
    finally { setBusy(false) }
  }

  const passwordType = showPasswords ? 'text' : 'password'

  return (
    <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{user.Username} · {user.Role.toUpperCase()}</p>
            <h2 id="account-title">Account</h2>
          </div>
          <button type="button" className="modal-toggle" title="Close" aria-label="Close account settings" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>

        <section className="account-section">
          <h3>Email address</h3>
          <p className="essence-note">Current: <strong>{user.Email || 'none on file'}</strong></p>
          {!pendingEmail ? (
            <form className="new-system-form" onSubmit={(event) => void requestEmailChange(event)}>
              <fieldset disabled={busy}>
                <label>New email address<input ref={firstRef} type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={(event) => setNewEmail(event.currentTarget.value)} /></label>
                <label>Current password<input type="password" autoComplete="current-password" required value={emailPassword} onChange={(event) => setEmailPassword(event.currentTarget.value)} /></label>
              </fieldset>
              {emailNote && <p className="registration-status" role="status">{emailNote}</p>}
              {emailError && <p className="login-error" role="alert">{emailError}</p>}
              <footer className="new-system-footer"><button type="submit" disabled={busy}>{busy ? 'Sending code...' : 'Send confirmation code'}</button></footer>
            </form>
          ) : (
            <form className="new-system-form" onSubmit={(event) => void confirmEmailChange(event)}>
              <fieldset disabled={busy}>
                <label>Confirmation code sent to {pendingEmail.email}<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.currentTarget.value)} /></label>
              </fieldset>
              {emailNote && <p className="registration-status" role="status">{emailNote}</p>}
              {emailError && <p className="login-error" role="alert">{emailError}</p>}
              <footer className="new-system-footer">
                <button type="button" disabled={busy} onClick={() => { setPendingEmail(null); setCode(''); setEmailNote(''); setEmailError('') }}>Use a different address</button>
                <button type="submit" disabled={busy || code.trim().length !== 6}>{busy ? 'Confirming...' : 'Confirm new email'}</button>
              </footer>
            </form>
          )}
        </section>

        <section className="account-section">
          <h3>Password</h3>
          <form className="new-system-form" onSubmit={(event) => void changePassword(event)}>
            <fieldset disabled={busy}>
              <label>Current password<input type={passwordType} autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} /></label>
              <label>New password<input type={passwordType} autoComplete="new-password" required minLength={12} maxLength={256} value={nextPassword} onChange={(event) => setNextPassword(event.currentTarget.value)} /></label>
              <label>New password again<input type={passwordType} autoComplete="new-password" required minLength={12} maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} /></label>
            </fieldset>
            <button type="button" className="essence-inline-button" aria-pressed={showPasswords} onClick={() => setShowPasswords((value) => !value)}>
              {showPasswords ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </button>
            {passwordNote && <p className="registration-status" role="status">{passwordNote}</p>}
            {passwordError && <p className="login-error" role="alert">{passwordError}</p>}
            <footer className="new-system-footer"><button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button></footer>
          </form>
        </section>
      </section>
    </div>
  )
}
