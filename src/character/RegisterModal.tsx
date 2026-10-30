import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, WandSparkles, X } from 'lucide-react'
import { api } from './Api'
import { suggestStrongPassword } from './Password'
import RoleToggle from './RoleToggle'
import GoogleSignInButton from './GoogleSignInButton'
import type { UserRole } from './User'

export default function RegisterModal({ onRegistered, onClose }: { onRegistered: (username: string) => void; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('player')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    emailRef.current?.focus()
    return () => previous?.focus()
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const account = await api<{ Username: string }>('/auth/register', 'POST', { email: email.trim(), username: username.trim(), password, role })
      onRegistered(account.Username)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to register right now.') }
    finally { setBusy(false) }
  }
  return (
    <div className="dm-modal-backdrop" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal register-modal" role="dialog" aria-modal="true" aria-labelledby="register-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose()
          if (event.key === 'Tab') {
            const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
            const first = fields[0], last = fields.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <header className="dm-modal-header"><h2 id="register-title">Register</h2><button type="button" className="modal-toggle" title="Close" aria-label="Close registration" disabled={busy} onClick={onClose}><X size={18} /></button></header>
        <form className="registration-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <RoleToggle value={role} onChange={setRole} disabled={busy} />
            <label htmlFor="registration-email">Email</label>
            <input ref={emailRef} id="registration-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
            <label htmlFor="registration-username">Account login</label>
            <input id="registration-username" autoComplete="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\-]+" value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
            <label htmlFor="registration-password">Password</label>
            <div className="registration-password">
              <input id="registration-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(event) => { setPassword(event.currentTarget.value); setStatus('') }} />
              <button type="button" title="Suggest a strong password" aria-label="Suggest a strong password" onClick={() => { setPassword(suggestStrongPassword()); setStatus('Strong password suggested.') }}><WandSparkles size={18} /></button>
              <button type="button" title={visible ? 'Hide password' : 'Show password'} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </fieldset>
          <GoogleSignInButton role={role} disabled={busy} />
          {status && <p className="registration-status" role="status">{status}</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          <footer className="registration-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Registering...' : 'Create Account'}</button></footer>
        </form>
      </section>
    </div>
  )
}