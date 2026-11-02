import { computeEssenceStats } from './EssenceSystem'
import { recipeFor, treeNode } from './EssenceTreeData'
import type { DevelopmentLogEntry, EssenceCharacterData } from './EssenceTypes'

export type StepKind = 'Attributes' | 'Skills' | 'AttributeUses' | 'SkillUses' | 'MetaphysicalUses' | 'Stats'
export type SheetRole = 'player' | 'dm'

export type SheetChange = {
  kind: StepKind
  id: string
  name: string
  amount: number
  purpose?: string
}

// Development tallies (uses and other statistics) are logged rather than bought with points.
export const isUsesKind = (kind: StepKind) => kind === 'AttributeUses' || kind === 'SkillUses' || kind === 'MetaphysicalUses' || kind === 'Stats'

export function bucketFor(data: EssenceCharacterData, kind: StepKind): Record<string, number> {
  switch (kind) {
    case 'Attributes': return data.Attributes
    case 'Skills': return data.Skills
    case 'AttributeUses': return data.Development.AttributeUses
    case 'SkillUses': return data.Development.SkillUses
    case 'MetaphysicalUses': return data.Development.Metaphysical
    case 'Stats': return data.Development.Stats
  }
}

const categoryFor = (kind: StepKind): DevelopmentLogEntry['Category'] =>
  kind === 'Attributes' || kind === 'AttributeUses' ? 'attribute' : kind === 'Skills' || kind === 'SkillUses' ? 'skill' : 'other'

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
      Category: categoryFor(change.kind),
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

export type EssenceChange =
  // Add or remove a quantity of one essence.
  | { kind?: 'adjust'; name: string; delta: number; note?: string }
  // Refine `batches` lots of the chart recipe: each ingredient pays its cost, the named essence gains the yield.
  | { kind: 'refine'; name: string; batches: number; note?: string }
  // DM only: override the ratio used to refine the named essence on this sheet.
  | { kind: 'recipe'; name: string; cost: number; yield: number }

const holdingFor = (data: EssenceCharacterData, name: string) => data.Essences.find((holding) => holding.Name === name)

// What a refinement would consume and produce for this character.
export function refinementPlan(data: EssenceCharacterData, name: string, batches = 1) {
  const node = treeNode(name)
  if (!node || node.from.length === 0) return null
  const recipe = recipeFor(node, data.EssenceRecipes)
  const inputs = node.from.map((ingredient) => ({ name: ingredient, cost: recipe.Cost * batches, held: holdingFor(data, ingredient)?.Amount ?? 0 }))
  const maxBatches = Math.min(...inputs.map((input) => Math.floor(input.held / recipe.Cost)))
  return { node, recipe, inputs, produced: recipe.Yield * batches, maxBatches }
}

export function validateEssenceChange(data: EssenceCharacterData, change: EssenceChange, role: SheetRole = 'dm'): string | null {
  if (change.kind === 'recipe') {
    if (role !== 'dm') return 'Only the DM can change refinement ratios.'
    if (!treeNode(change.name)?.from.length) return `${change.name} is not refined from other essences.`
    return Number.isInteger(change.cost) && change.cost > 0 && Number.isInteger(change.yield) && change.yield > 0 ? null : 'Cost and yield must be whole numbers above zero.'
  }
  if (change.kind === 'refine') {
    if (!Number.isInteger(change.batches) || change.batches < 1) return 'Enter a whole number of batches above zero.'
    const plan = refinementPlan(data, change.name, change.batches)
    if (!plan) return `${change.name} is not refined from other essences.`
    const short = plan.inputs.find((input) => input.held < input.cost)
    return short ? `Refining needs ${short.cost.toLocaleString()} ${short.name}; only ${short.held.toLocaleString()} is available.` : null
  }
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    return 'Enter a whole number above zero.'
  }
  const held = holdingFor(data, change.name)
  if (!held) {
    return `${change.name} is not tracked on this sheet.`
  }
  return held.Amount + change.delta < 0 ? `Only ${held.Amount} ${change.name} is available.` : null
}

// Both roles can add, remove or refine essence; a player's change is also written to the DM's log.
export function applyEssenceChange(
  draft: EssenceCharacterData,
  change: EssenceChange,
  actor: { name: string; role: SheetRole },
  now = new Date(),
): void {
  const error = validateEssenceChange(draft, change, actor.role)
  if (error) {
    throw new Error(error)
  }

  if (change.kind === 'recipe') {
    draft.EssenceRecipes = { ...draft.EssenceRecipes, [change.name]: { Cost: change.cost, Yield: change.yield } }
    return
  }

  const log: DevelopmentLogEntry[] = draft.DevelopmentLog ?? []
  const record = (target: string, amount: number, before: number, after: number, purpose: string) => {
    if (actor.role !== 'player') return
    log.push({ Id: `log-${now.getTime()}-${log.length}`, Timestamp: now.toISOString(), Actor: actor.name, Role: 'player', Kind: 'essence', Category: 'essence', Target: target, Amount: amount, Before: before, After: after, Purpose: purpose })
    draft.DevelopmentLog = log
  }

  if (change.kind === 'refine') {
    const plan = refinementPlan(draft, change.name, change.batches)!
    const purpose = `Refined ${plan.inputs.map((input) => `${input.cost.toLocaleString()} ${input.name}`).join(' + ')} into ${plan.produced.toLocaleString()} ${change.name}${change.note?.trim() ? ` · ${change.note.trim()}` : ''}`
    for (const input of plan.inputs) {
      const held = holdingFor(draft, input.name)!
      held.Amount -= input.cost
      record(input.name, -input.cost, held.Amount + input.cost, held.Amount, purpose)
    }
    let target = holdingFor(draft, change.name)
    if (!target) {
      target = { Name: change.name, Tier: plan.node.tier, Amount: 0, Tempered: false }
      draft.Essences.push(target)
    }
    const before = target.Amount
    target.Amount = before + plan.produced
    record(change.name, plan.produced, before, target.Amount, purpose)
    return
  }

  const held = holdingFor(draft, change.name)!
  const before = held.Amount
  held.Amount = before + change.delta
  record(change.name, change.delta, before, held.Amount, (change.note ?? '').trim())
}

export const unseenLogCount = (data: EssenceCharacterData): number =>
  (data.DevelopmentLog ?? []).filter((entry) =>
    entry.Role === 'player' && (!data.DevelopmentLogSeenAt || entry.Timestamp > data.DevelopmentLogSeenAt),
  ).length
