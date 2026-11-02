import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api } from './Api'
import type { User } from './User'
import type { StatSystem } from './StatSystems'
import { displayName, transferCharacterSheet, type CharacterSheetRecord } from './CharacterSheetDatabase'

type Account = Pick<User, 'Id' | 'Username' | 'Role'>

// Moves a character to another owner the DM manages and/or another campaign. Campaign choices stay inside the
// character's system family: every campaign of every system that shares the character's ruleset.
export default function TransferModal({ record, systems, user, onTransferred, onClose }: {
  record: CharacterSheetRecord
  systems: StatSystem[]
  user: User
  onTransferred: (record: CharacterSheetRecord) => Promise<void> | void
  onClose: () => void
}) {
  const ruleset = systems.find((system) => system.Id === record.SystemId)?.Ruleset
    ?? systems.find((system) => system.CampaignNames.includes(record.CampaignName))?.Ruleset
    ?? (record.Essence ? 'essence' : 'private')
  const campaignOptions = systems
    .filter((system) => !system.Hidden && system.Ruleset === ruleset)
    .flatMap((system) => system.CampaignNames.map((name) => ({ name, system: system.Name })))
  if (!campaignOptions.some((option) => option.name === record.CampaignName)) campaignOptions.unshift({ name: record.CampaignName, system: 'current' })

  const [ownerId, setOwnerId] = useState(record.OwnerId)
  const [campaignName, setCampaignName] = useState(record.CampaignName)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    let cancelled = false
    api<Account[]>('/accounts').then((rows) => { if (!cancelled) setAccounts(rows) }).catch(() => { /* owner list stays minimal */ })
    return () => { cancelled = true }
  }, [])

  const ownerOptions = [...new Map([
    [record.OwnerId, { Id: record.OwnerId, Username: record.OwnerName, Role: 'player' as const }],
    [user.Id, { Id: user.Id, Username: `${user.Username} (you)`, Role: user.Role }],
    ...accounts.map((account) => [account.Id, account] as const),
  ]).values()]

  const changed = ownerId !== record.OwnerId || campaignName !== record.CampaignName
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!changed) { setError('Choose a different owner or campaign.'); return }
    setBusy(true); setError('')
    try {
      const updated = await transferCharacterSheet(record.Id, {
        ...(ownerId !== record.OwnerId ? { ownerId } : {}),
        ...(campaignName !== record.CampaignName ? { campaignName } : {}),
      })
      await onTransferred(updated)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to transfer the character.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-modal-backdrop dm-modal-backdrop-secondary" onClick={() => { if (!busy) onClose() }}>
      <section className="dm-character-modal new-system-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-title" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}>
        <header className="dm-modal-header">
          <div>
            <p className="eyebrow">{record.CampaignName} · owned by {record.OwnerName}</p>
            <h2 id="transfer-title">Transfer {displayName(record)}</h2>
          </div>
          <button type="button" className="modal-toggle" title="Close" aria-label="Close transfer" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <form className="new-system-form" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <label>Owner account
              <select ref={firstRef} value={ownerId} onChange={(event) => setOwnerId(event.currentTarget.value)}>
                {ownerOptions.map((account) => <option key={account.Id} value={account.Id}>{account.Username}{account.Id !== user.Id ? ` · ${account.Role}` : ''}</option>)}
              </select>
            </label>
            <label>Campaign
              <select value={campaignName} onChange={(event) => setCampaignName(event.currentTarget.value)}>
                {campaignOptions.map((option) => <option key={option.name} value={option.name}>{option.name}{option.system !== 'current' ? ` · ${option.system}` : ''}</option>)}
              </select>
            </label>
          </fieldset>
          <p className="essence-note">Only campaigns that use the same rules ({ruleset === 'essence' ? 'Essence' : 'Private'}) are offered, so the sheet keeps working after the move.</p>
          {error && <p className="dm-console-error" role="alert">{error}</p>}
          <footer className="new-system-footer">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy || !changed}>{busy ? 'Transferring...' : 'Transfer'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
