import { useState, type FormEvent } from 'react'
import RegisterModal from './RegisterModal'
import '../App.css'

type LoginScreenProps = {
  onLogin: (username: string, password: string) => Promise<boolean>
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [notice, setNotice] = useState('')

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
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <button type="button" className="register-trigger" disabled={isSubmitting} onClick={() => { setError(''); setNotice(''); setRegisterOpen(true) }}>Register</button>
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
