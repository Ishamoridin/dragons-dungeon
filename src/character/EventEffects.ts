// Event effects: everything a DM can do to a character, expressed as data so an event can carry it, a scheduled
// event can store it, and the event log can record what was applied. Application reuses the sheet helpers the
// DM console already uses by hand, so an event changes a sheet exactly as the DM clicking would.
// Kept free of asset imports so server-side tests can load it through tsx; card styling lives in EventSkinStyle.ts.
import type { CampaignAction } from './Campaign'
import type { CharacterAttributeData, CharacterSheetData, CharacterSkillData } from './CharacterSheetDatabase'
import { DEFAULT_PAGE_SKIN, type PageSkin } from './PageSkin'
import type { Portrait } from './Portrait'
import { applyEssenceChange, applySheetChange, type StepKind } from './essence/EssenceChanges'
import { computeEssenceStats, currentEssenceResources } from './essence/EssenceSystem'
import type { EssenceInjury, EssenceInventoryItem, EssenceNote, EssenceStatus } from './essence/EssenceTypes'

export type ResourcePool = 'hp' | 'reiryoku' | 'willpower'

export type EventEffect =
  // Essence sheets
  | { type: 'sheet-change'; kind: StepKind; id: string; name: string; amount: number }
  | { type: 'essence-adjust'; name: string; delta: number; note?: string }
  | { type: 'dm-points'; amount: number }
  | { type: 'add-status'; status: EssenceStatus }
  | { type: 'add-injury'; injury: EssenceInjury }
  | { type: 'add-item'; item: EssenceInventoryItem }
  | { type: 'resource-delta'; pool: ResourcePool; delta: number }
  | { type: 'add-note'; note: EssenceNote }
  // Classic rulesets
  | { type: 'add-xp'; amount: number }
  | { type: 'add-skill-progress'; skillNames: string[]; amount: number }
  | { type: 'level-up' }
  | { type: 'level-up-skill'; skillName: string }

export type EventEffectType = EventEffect['type']

export type AppliedEffect = EventEffect & { Summary: string }
export type EventTargetResult = { CharacterId: string; CharacterName: string; OwnerId: string; Effects: AppliedEffect[]; Error?: string }

// How an event's card looks: one of the page skins, an optional accent colour, and an optional banner image.
export type EventSkin = { skin: PageSkin; accent?: string; banner?: Portrait | null }
export const DEFAULT_EVENT_SKIN: EventSkin = { skin: DEFAULT_PAGE_SKIN }

export const ESSENCE_EFFECT_TYPES: EventEffectType[] = ['sheet-change', 'essence-adjust', 'dm-points', 'add-status', 'add-injury', 'add-item', 'resource-delta', 'add-note']
export const CLASSIC_EFFECT_TYPES: EventEffectType[] = ['add-xp', 'add-skill-progress', 'level-up', 'level-up-skill']
export const effectsForRuleset = (isEssence: boolean): EventEffectType[] => isEssence ? ESSENCE_EFFECT_TYPES : CLASSIC_EFFECT_TYPES

export const EFFECT_TYPE_LABELS: Record<EventEffectType, string> = {
  'sheet-change': 'Change attribute, skill or development',
  'essence-adjust': 'Add or remove essence',
  'dm-points': 'Issue universal points',
  'add-status': 'Inflict a status',
  'add-injury': 'Inflict an injury',
  'add-item': 'Grant an item',
  'resource-delta': 'Change HP, Reiryoku or Willpower',
  'add-note': 'Add a note',
  'add-xp': 'Add XP',
  'add-skill-progress': 'Add skill progress',
  'level-up': 'Level up character',
  'level-up-skill': 'Level up skill',
}

const POOL_LABELS: Record<ResourcePool, string> = { hp: 'HP', reiryoku: 'Reiryoku', willpower: 'Willpower' }
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString()}`

export function describeEffect(effect: EventEffect): string {
  switch (effect.type) {
    case 'sheet-change': return `${effect.name} ${signed(effect.amount)}`
    case 'essence-adjust': return `${signed(effect.delta)} ${effect.name}${effect.note?.trim() ? ` (${effect.note.trim()})` : ''}`
    case 'dm-points': return `${signed(effect.amount)} universal points`
    case 'add-status': return `Status: ${effect.status.Name}${effect.status.Duration ? ` (${effect.status.Duration})` : ''}`
    case 'add-injury': return `Injury: ${effect.injury.Name}${effect.injury.Location ? ` to ${effect.injury.Location}` : ''}`
    case 'add-item': return `Item: ${effect.item.Quantity > 1 ? `${effect.item.Quantity}× ` : ''}${effect.item.Name}`
    case 'resource-delta': return `${POOL_LABELS[effect.pool]} ${signed(effect.delta)}`
    case 'add-note': return `Note: ${effect.note.Title}`
    case 'add-xp': return `${signed(effect.amount)} XP`
    case 'add-skill-progress': return `${signed(effect.amount)}% ${effect.skillNames.join(', ')}`
    case 'level-up': return 'Level up character'
    case 'level-up-skill': return `Level up ${effect.skillName}`
  }
}

export const actionToEffect = (action: CampaignAction): EventEffect => {
  switch (action.type) {
    case 'add-xp': return { type: 'add-xp', amount: action.amount }
    case 'add-skill-progress': return { type: 'add-skill-progress', skillNames: action.skillNames, amount: action.amount }
    case 'level-up': return { type: 'level-up' }
    case 'level-up-skill': return { type: 'level-up-skill', skillName: action.skillName }
  }
}

export const findSkill = (skills: CharacterSkillData[], name: string): CharacterSkillData | undefined => {
  for (const skill of skills) {
    if (skill.Name === name) return skill
    const nested = findSkill(skill.subtypes, name)
    if (nested) return nested
  }
  return undefined
}

export const flattenSkills = (skills: CharacterSkillData[]): CharacterSkillData[] =>
  skills.flatMap((skill) => [skill, ...flattenSkills(skill.subtypes)])

const adjustLeafAttributes = (attribute: CharacterAttributeData, amount: number): void => {
  if (!attribute.subAttributes?.length) {
    attribute.value = Math.max(1, Math.min(1000, attribute.value + amount))
    return
  }
  attribute.subAttributes.forEach((child) => adjustLeafAttributes(child, amount))
  attribute.value = Math.sqrt(attribute.subAttributes.reduce((sum, child) => sum + child.value * child.value, 0) / attribute.subAttributes.length)
}

// Classic-ruleset actions, previously private to the DM console.
export const applyAction = (data: CharacterSheetData, action: CampaignAction): void => {
  switch (action.type) {
    case 'add-xp':
      data.XP = Math.max(0, data.XP + action.amount)
      return
    case 'add-skill-progress': {
      for (const skillName of action.skillNames) {
        const skill = findSkill(data.Skills, skillName)
        if (!skill) throw new Error(`Skill "${skillName}" was not found.`)
        skill.Progress = Math.max(0, Math.min(100, skill.Progress + action.amount))
      }
      return
    }
    case 'level-up':
      data.Level += 1
      for (const [name, attribute] of Object.entries(data.Attributes)) {
        adjustLeafAttributes(attribute, data.PlayerClass.AttributeGrowth[name as keyof typeof data.PlayerClass.AttributeGrowth])
      }
      return
    case 'level-up-skill': {
      const skill = findSkill(data.Skills, action.skillName)
      if (!skill) throw new Error(`Skill "${action.skillName}" was not found.`)
      skill.Value = Math.min(100, skill.Value + 1)
      skill.Progress = 0
      skill.tier = Math.floor(skill.Value / 20)
      return
    }
  }
}

// Applies one effect to a sheet draft, throwing with a readable message when it cannot apply.
export function applyEventEffect(draft: CharacterSheetData, effect: EventEffect, actor: { name: string }, now = new Date()): void {
  const dm = { name: actor.name, role: 'dm' as const }
  switch (effect.type) {
    case 'add-xp': case 'add-skill-progress': case 'level-up': case 'level-up-skill':
      if (draft.Essence) throw new Error(`${EFFECT_TYPE_LABELS[effect.type]} only applies to non-Essence sheets.`)
      applyAction(draft, effect.type === 'add-xp' ? { type: 'add-xp', characterId: '', amount: effect.amount }
        : effect.type === 'add-skill-progress' ? { type: 'add-skill-progress', characterId: '', skillNames: effect.skillNames, amount: effect.amount }
        : effect.type === 'level-up' ? { type: 'level-up', characterId: '' }
        : { type: 'level-up-skill', characterId: '', skillName: effect.skillName })
      return
  }
  const essence = draft.Essence
  if (!essence) throw new Error(`${EFFECT_TYPE_LABELS[effect.type]} needs an Essence sheet.`)
  switch (effect.type) {
    case 'sheet-change':
      applySheetChange(essence, { kind: effect.kind, id: effect.id, name: effect.name, amount: effect.amount }, dm, now)
      return
    case 'essence-adjust':
      if (!essence.Essences.some((holding) => holding.Name === effect.name)) essence.Essences.push({ Name: effect.name, Tier: 1, Amount: 0, Tempered: false })
      applyEssenceChange(essence, { kind: 'adjust', name: effect.name, delta: effect.delta, note: effect.note }, dm, now)
      return
    case 'dm-points':
      essence.DMIssuedPoints = Math.max(0, essence.DMIssuedPoints + effect.amount)
      return
    case 'add-status':
      essence.Statuses = [...(essence.Statuses ?? []), { ...effect.status }]
      return
    case 'add-injury':
      essence.Injuries = [...(essence.Injuries ?? []), { ...effect.injury }]
      return
    case 'add-item':
      essence.Inventory = [...(essence.Inventory ?? []), { ...effect.item }]
      return
    case 'add-note':
      essence.Notes = [...essence.Notes, { ...effect.note }]
      return
    case 'resource-delta': {
      const stats = computeEssenceStats(essence)
      const current = currentEssenceResources(essence, stats)
      const maximum = effect.pool === 'hp' ? stats.maxHP : effect.pool === 'reiryoku' ? stats.maxReiryoku : stats.maxWillpower
      const savedMax = essence.TemporaryResources?.[effect.pool]?.Max
      const cap = savedMax !== undefined && Number.isFinite(savedMax) ? savedMax : maximum
      essence.TemporaryResources = { ...essence.TemporaryResources, [effect.pool]: { Current: Math.max(0, Math.min(cap, current[effect.pool] + effect.delta)), Max: cap } }
      return
    }
  }
}

export const isHexColour = (value: string | undefined): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
