import { useEffect, useState, type FormEvent } from 'react'
import RegisterModal from './RegisterModal'
import GoogleSignInButton from './GoogleSignInButton'
import { staticHosting } from './Api'
import '../App.css'

type LoginScreenProps = {
  onLogin: (username: string, password: string) => Promise<boolean>
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(() => {
    const errors: Record<string, string> = {
      google_not_configured: 'Google sign-in is not configured yet.',
      google_state: 'Google sign-in expired or could not be verified. Please try again.',
      google_cancelled: 'Google sign-in was cancelled.',
      google_account_exists: 'Sign in with your account login, then connect Google in Settings.',
      google_already_linked: 'This Google account is already connected to another account.',
      signin_required: 'Sign in before connecting a Google account.',
      google_failed: 'Google sign-in failed. Please try again.',
    }
    return errors[new URLSearchParams(window.location.search).get('authError') ?? ''] ?? ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('authError')) { url.searchParams.delete('authError'); window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`) }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const authenticated = await onLogin(username, password)
      if (!authenticated) {
        setError('Invalid username or password.')
      }
    } catch {
      setError('Unable to sign in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Dragon's Dungeon</p>
        <h1>Sign in</h1>
        {staticHosting && <p className="login-error" role="alert">Account service unavailable on this static deployment.</p>}
        {notice && <p className="registration-status" role="status">{notice}</p>}
        <form className="login-form" onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" disabled={isSubmitting || staticHosting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <GoogleSignInButton disabled={isSubmitting || staticHosting} />
        <button type="button" className="register-trigger" disabled={isSubmitting || staticHosting} onClick={() => { setError(''); setNotice(''); setRegisterOpen(true) }}>Register</button>
      </section>
      {registerOpen && <RegisterModal onClose={() => setRegisterOpen(false)} onRegistered={(login) => {
        setUsername(login)
        setPassword('')
        setRegisterOpen(false)
        setNotice('Account created. Sign in to continue.')
      }} />}
    </main>
  )
}
