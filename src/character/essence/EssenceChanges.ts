import { computeEssenceStats } from './EssenceSystem'
import type { DevelopmentLogEntry, EssenceCharacterData } from './EssenceTypes'

export type StepKind = 'Attributes' | 'Skills' | 'AttributeUses' | 'SkillUses'
export type SheetRole = 'player' | 'dm'

export type SheetChange = {
  kind: StepKind
  id: string
  name: string
  amount: number
  purpose?: string
}

export const isUsesKind = (kind: StepKind) => kind === 'AttributeUses' || kind === 'SkillUses'

export function bucketFor(data: EssenceCharacterData, kind: StepKind): Record<string, number> {
  switch (kind) {
    case 'Attributes': return data.Attributes
    case 'Skills': return data.Skills
    case 'AttributeUses': return data.Development.AttributeUses
    case 'SkillUses': return data.Development.SkillUses
  }
}

// Players may log development uses with a purpose, or spend DM-issued points to raise a value; nothing else.
export function validateSheetChange(data: EssenceCharacterData, change: SheetChange, role: SheetRole): string | null {
  if (!Number.isInteger(change.amount) || change.amount === 0) {
    return 'Enter a whole number other than zero.'
  }
  if (role === 'dm') {
    return null
  }
  if (change.amount < 0) {
    return 'Players cannot reduce values.'
  }
  if (isUsesKind(change.kind)) {
    return change.purpose?.trim() ? null : 'Say what this development was for.'
  }

  const available = computeEssenceStats(data).points.available
  return change.amount > available ? `Only ${available} Universal Skill Points are available.` : null
}

export function applySheetChange(
  draft: EssenceCharacterData,
  change: SheetChange,
  actor: { name: string; role: SheetRole },
  now = new Date(),
): void {
  const error = validateSheetChange(draft, change, actor.role)
  if (error) {
    throw new Error(error)
  }

  const bucket = bucketFor(draft, change.kind)
  const before = bucket[change.id] ?? 0
  const after = Math.max(0, before + change.amount)
  bucket[change.id] = after

  if (actor.role === 'player') {
    const log: DevelopmentLogEntry[] = draft.DevelopmentLog ?? []
    const uses = isUsesKind(change.kind)
    log.push({
      Id: `log-${now.getTime()}-${log.length}`,
      Timestamp: now.toISOString(),
      Actor: actor.name,
      Role: 'player',
      Kind: uses ? 'uses' : 'points',
      Category: change.kind === 'Attributes' || change.kind === 'AttributeUses' ? 'attribute' : 'skill',
      Target: change.name,
      Amount: change.amount,
      Before: before,
      After: after,
      Purpose: uses ? (change.purpose ?? '').trim() : 'Spent Universal Skill Points',
    })
    draft.DevelopmentLog = log
  }
}

export type DevelopmentRequest = { type: string; amountText: string; description: string }

// A whole number above zero, or X for as much as needed.
export function parseDevelopmentAmount(text: string): { amount: number; asNeeded: boolean } | null {
  const trimmed = text.trim()
  if (/^x$/i.test(trimmed)) {
    return { amount: 0, asNeeded: true }
  }
  const value = Number(trimmed)
  return trimmed !== '' && Number.isInteger(value) && value > 0 ? { amount: value, asNeeded: false } : null
}

export function validateDevelopmentRequest(request: DevelopmentRequest): string | null {
  if (!request.type.trim()) {
    return 'Choose a type, or add a new one.'
  }
  return parseDevelopmentAmount(request.amountText) ? null : 'Enter a whole number above zero, or X for as much as needed.'
}

export function logDevelopmentRequest(
  draft: EssenceCharacterData,
  request: DevelopmentRequest,
  actor: { name: string },
  now = new Date(),
): void {
  const error = validateDevelopmentRequest(request)
  if (error) {
    throw new Error(error)
  }

  const parsed = parseDevelopmentAmount(request.amountText)!
  const log: DevelopmentLogEntry[] = draft.DevelopmentLog ?? []
  log.push({
    Id: `log-${now.getTime()}-${log.length}`,
    Timestamp: now.toISOString(),
    Actor: actor.name,
    Role: 'player',
    Kind: 'development',
    Category: 'other',
    Target: request.type.trim(),
    Amount: parsed.amount,
    AsNeeded: parsed.asNeeded || undefined,
    Before: 0,
    After: 0,
    Purpose: request.description.trim(),
  })
  draft.DevelopmentLog = log
}

export type EssenceChange = { name: string; delta: number; note?: string }

export function validateEssenceChange(data: EssenceCharacterData, change: EssenceChange): string | null {
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    return 'Enter a whole number above zero.'
  }
  const held = data.Essences.find((holding) => holding.Name === change.name)
  if (!held) {
    return `${change.name} is not tracked on this sheet.`
  }
  return held.Amount + change.delta < 0 ? `Only ${held.Amount} ${change.name} is available.` : null
}

// Both roles can add or remove essence; a player's change is also written to the DM's log.
export function applyEssenceChange(
  draft: EssenceCharacterData,
  change: EssenceChange,
  actor: { name: string; role: SheetRole },
  now = new Date(),
): void {
  const error = validateEssenceChange(draft, change)
  if (error) {
    throw new Error(error)
  }

  const held = draft.Essences.find((holding) => holding.Name === change.name)!
  const before = held.Amount
  held.Amount = before + change.delta

  if (actor.role === 'player') {
    const log: DevelopmentLogEntry[] = draft.DevelopmentLog ?? []
    log.push({
      Id: `log-${now.getTime()}-${log.length}`,
      Timestamp: now.toISOString(),
      Actor: actor.name,
      Role: 'player',
      Kind: 'essence',
      Category: 'essence',
      Target: change.name,
      Amount: change.delta,
      Before: before,
      After: held.Amount,
      Purpose: (change.note ?? '').trim(),
    })
    draft.DevelopmentLog = log
  }
}

export const unseenLogCount = (data: EssenceCharacterData): number =>
  (data.DevelopmentLog ?? []).filter((entry) =>
    entry.Role === 'player' && (!data.DevelopmentLogSeenAt || entry.Timestamp > data.DevelopmentLogSeenAt),
  ).length
