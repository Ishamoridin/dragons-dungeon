import { useEffect, useState } from 'react'
import { Link2, LogIn } from 'lucide-react'
import { api } from './Api'
import type { UserRole } from './User'

export default function GoogleSignInButton({ role, link = false, disabled = false }: { role?: UserRole; link?: boolean; disabled?: boolean }) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let active = true
    void api<{ google: boolean }>('/auth/providers').then((providers) => { if (active) setEnabled(providers.google) }).catch(() => {})
    return () => { active = false }
  }, [])
  const label = link ? 'Connect Google account' : 'Continue with Google'
  return <button type="button" className="google-sign-in" disabled={disabled || !enabled} title={enabled ? label : 'Google sign-in is not configured'} onClick={() => {
    const query = new URLSearchParams()
    if (role) query.set('role', role)
    if (link) query.set('link', '1')
    window.location.assign(`/api/auth/google/start?${query}`)
  }}>{link ? <Link2 size={17} /> : <LogIn size={17} />}{label}</button>
}