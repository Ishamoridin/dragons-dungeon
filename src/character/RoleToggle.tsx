import { useId } from 'react'
import type { UserRole } from './User'

export default function RoleToggle({ value, onChange, disabled = false }: { value: UserRole; onChange: (role: UserRole) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <fieldset className="account-mode" disabled={disabled}>
      <legend>Account mode</legend>
      <div className="account-mode-options">
        {(['dm', 'player'] as const).map((role) => <label key={role}>
          <input type="radio" name={id} value={role} checked={value === role} onChange={() => onChange(role)} />
          <span>{role === 'dm' ? 'DM' : 'Player'}</span>
        </label>)}
      </div>
    </fieldset>
  )
}