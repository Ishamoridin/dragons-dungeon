import type { AttributeType } from './Attribute'
import type { AttributeGrowth, PrimaryAttributeName } from './PlayerClass'
import type { SkillAttribute } from './Skills'
import type { User } from './User'
import { DEMO_DM, DEMO_PLAYER } from './MockAuth'
import type { EssenceCharacterData } from './essence/EssenceTypes'
import { ESSENCE_SYSTEM_ID } from './essence/EssenceSystem'
import { GILES_YAVIN_MEGATRON, GILES_YAVIN_MEGATRON_NAME } from './essence/EssenceCharacters'
import { api, resourceList, saveResource } from './Api'

export type CharacterAttributeData = {
  value: number
  type: AttributeType
  flags?: string[]
  subAttributes?: CharacterAttributeData[]
}

export type CharacterSkillData = {
  Name: string
  Value: number
  Progress: number
  description: string
  flags: string[]
  attributes: SkillAttribute[]
  tier: number
  subtypes: CharacterSkillData[]
}

export type CharacterSheetData = {
  Version?: number
  SystemId: string
  // Essence characters keep their rules in this block; the shared fields below are placeholders for them.
  Essence?: EssenceCharacterData
  Name: string
  Level: number
  XP: number
  CampaignName: string
  Tags: string[]
  DMId: string
  DMName: string
  PlayerClass: {
    Name: string
    AttributeGrowth: AttributeGrowth
  }
  Attributes: Record<PrimaryAttributeName, CharacterAttributeData>
  Skills: CharacterSkillData[]
}

export type CharacterSheetRecord = CharacterSheetData & {
  Version: number
  Id: string
  OwnerId: string
  OwnerName: string
  CreatedAt: string
  UpdatedAt: string
}

const records = new Map<string, CharacterSheetRecord>()

// Kinds of development players can request, shared by everyone in a campaign.
const DEFAULT_DEVELOPMENT_TYPES = ['Technique', 'Spell', 'Skill', 'Attribute', 'Resero', 'Essence']
const developmentTypes = new Map<string, string[]>()

export function getDevelopmentTypes(campaignName: string): string[] {
  const saved = resourceList<{ Name: string; Types: string[] }>('development').filter((entry) => entry.Name === campaignName).flatMap((entry) => entry.Types)
  return [...new Set([...DEFAULT_DEVELOPMENT_TYPES, ...saved, ...(developmentTypes.get(campaignName) ?? [])])]
}

// Returns the stored spelling, reusing an existing type that matches ignoring case.
export function addDevelopmentType(campaignName: string, type: string): string {
  const name = type.trim().slice(0, 40)
  const types = getDevelopmentTypes(campaignName)
  const existing = types.find((item) => item.toLowerCase() === name.toLowerCase())
  if (existing) {
    return existing
  }
  developmentTypes.set(campaignName, [...types, name])
  void saveResource('development', campaignName, { Name: campaignName, Types: [...types, name] }).catch(() => {})
  return name
}

// Prefers the character's alias (if set) over their full record name.
export const displayName = (record: Pick<CharacterSheetRecord, 'Name' | 'Essence'>): string =>
  record.Essence?.Alias ?? record.Name
const clone = <T>(value: T): T => structuredClone(value)
const savedRecords = new Map<string, CharacterSheetRecord>()
const knownCopies = new Map<string, CharacterSheetRecord>()
const saveQueue = new Map<string, Promise<unknown>>()

function remember(record: CharacterSheetRecord) {
  record.Version ??= 0
  savedRecords.set(record.Id, record)
  knownCopies.set(`${record.Id}:${record.Version}`, clone(record))
  return record
}

export async function createCharacterSheet(
  data: CharacterSheetData,
  owner: User,
): Promise<CharacterSheetRecord> {
  const record = await api<CharacterSheetRecord>('/characters', 'POST', { data, ownerId: owner.Id })
  remember(record)
  return record
}

export async function readCharacterSheet(id: string, _user: User): Promise<CharacterSheetRecord | null> {
  const record = await api<CharacterSheetRecord>(`/characters/${encodeURIComponent(id)}`)
  remember(record)
  return isDeleted(record) ? null : record
}

export async function updateCharacterSheet(
  id: string,
  data: CharacterSheetData,
  _user: User,
): Promise<CharacterSheetRecord | null> {
  const submittedVersion = data.Version ?? savedRecords.get(id)?.Version
  const base = submittedVersion === undefined ? undefined : knownCopies.get(`${id}:${submittedVersion}`)
  const operation = (saveQueue.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const current = savedRecords.get(id) ?? await api<CharacterSheetRecord>(`/characters/${encodeURIComponent(id)}`)
    const saved = await api<CharacterSheetRecord>(`/characters/${encodeURIComponent(id)}`, 'PUT', { data, expectedVersion: submittedVersion ?? current.Version ?? 0, base: base ?? current })
    remember(saved)
    return saved
  })
  saveQueue.set(id, operation)
  return operation
}

export async function listCharacterSheets(_user: User): Promise<CharacterSheetRecord[]> {
  const rows = await api<CharacterSheetRecord[]>('/characters')
  rows.forEach(remember)
  return rows
}

export async function refreshCharacterSheets(user: User): Promise<CharacterSheetRecord[]> {
  return listCharacterSheets(user)
}

export async function deleteCharacterSheet(id: string, _user: User): Promise<boolean> {
  await api(`/characters/${encodeURIComponent(id)}`, 'DELETE', {})
  savedRecords.delete(id)
  return true
}

// A deleted character keeps its record but is tagged and never listed or read again.
export const DELETED_TAG = ' (Deleted)'

export const isDeleted = (record: Pick<CharacterSheetRecord, 'Name'>): boolean => record.Name.endsWith(DELETED_TAG)

export async function softDeleteCharacterSheet(id: string, _user: User): Promise<boolean> {
  await api(`/characters/${encodeURIComponent(id)}/trash`, 'POST', {})
  savedRecords.delete(id)
  return true
}

export async function listDeletedCharacterSheets(_user: User): Promise<CharacterSheetRecord[]> {
  return api<CharacterSheetRecord[]>('/characters?deleted=true')
}

export async function restoreCharacterSheet(id: string, _user: User): Promise<boolean> {
  await api(`/characters/${encodeURIComponent(id)}/restore`, 'POST', {})
  savedRecords.delete(id)
  return true
}

const basicLeaf = (value: number): CharacterAttributeData => ({ value, type: 'basic' })

const derivedAttribute = (values: number[]): CharacterAttributeData => ({
  value: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
  type: 'derived',
  subAttributes: values.map(basicLeaf),
})

const demoAttributes = (base: number): Record<PrimaryAttributeName, CharacterAttributeData> => ({
  Strength: derivedAttribute([base + 2, base + 1, base]),
  Dexterity: derivedAttribute([base + 1, base + 2, base]),
  Constitution: derivedAttribute([base + 2, base, base + 1]),
  Mental: derivedAttribute([base, base + 2, base + 1]),
  Social: derivedAttribute([base + 1, base, base + 2]),
  Mana: derivedAttribute([base, base + 1, base + 2]),
})

const demoSkill = (
  Name: string,
  Value: number,
  Progress: number,
  description: string,
  attributes: SkillAttribute[],
  flags: string[],
): CharacterSkillData => ({
  Name,
  Value,
  Progress,
  description,
  flags,
  attributes,
  tier: Math.floor(Value / 20),
  subtypes: [],
})

function seedDemoCharacterSheets(): void {
  if (records.size > 0) {
    return
  }

  const commonGrowth: AttributeGrowth = {
    Strength: 1,
    Dexterity: 1,
    Constitution: 1,
    Mental: 1,
    Social: 1,
    Mana: 1,
  }
  const now = new Date().toISOString()
  const demoSheets: CharacterSheetData[] = [
    {
      SystemId: 'default',
      Name: 'Aria Venn',
      Level: 4,
      XP: 860,
      CampaignName: 'Ashen Vale',
      Tags: ['Scout', 'Northreach'],
      DMId: DEMO_DM.Id,
      DMName: DEMO_DM.Username,
      PlayerClass: { Name: 'Ranger', AttributeGrowth: commonGrowth },
      Attributes: demoAttributes(3),
      Skills: [
        demoSkill('Track', 24, 35, 'Follow a trail through difficult terrain.', ['Mental', 'Constitution'], ['survival']),
        demoSkill('Sneak', 18, 70, 'Move quietly while avoiding attention.', ['Dexterity', 'Mental'], ['stealth']),
        demoSkill('Strike', 21, 10, 'Make a precise melee attack.', ['Strength', 'Dexterity'], ['combat']),
      ],
    },
    {
      SystemId: 'default',
      Name: 'Brann Ashford',
      Level: 5,
      XP: 1240,
      CampaignName: 'Ashen Vale',
      Tags: ['Vanguard', 'Stonewatch'],
      DMId: DEMO_DM.Id,
      DMName: DEMO_DM.Username,
      PlayerClass: { Name: 'Warden', AttributeGrowth: commonGrowth },
      Attributes: demoAttributes(4),
      Skills: [
        demoSkill('Block', 28, 20, 'Absorb or redirect an incoming attack.', ['Strength', 'Constitution'], ['combat', 'defense']),
        demoSkill('Grab', 19, 55, 'Seize or restrain a target.', ['Strength', 'Dexterity'], ['combat']),
        demoSkill('Heal', 12, 80, 'Treat injuries and stabilize an ally.', ['Mental', 'Dexterity'], ['medicine']),
      ],
    },
    {
      SystemId: 'default',
      Name: 'Mira Sol',
      Level: 3,
      XP: 510,
      CampaignName: 'The Shattered Coast',
      Tags: ['Arcanist', 'Tidebound'],
      DMId: DEMO_DM.Id,
      DMName: DEMO_DM.Username,
      PlayerClass: { Name: 'Arcanist', AttributeGrowth: commonGrowth },
      Attributes: demoAttributes(2),
      Skills: [
        demoSkill('Magic', 30, 25, 'Perform general magical techniques.', ['Mana', 'Mental'], ['magic']),
        demoSkill('Manipulation', 22, 60, 'Shape and direct a chosen force.', ['Mana', 'Mental'], ['magic']),
        demoSkill('Focus', 17, 5, 'Sustain attention on a task or source of power.', ['Mental', 'Mana'], ['discipline']),
      ],
    },
    {
      SystemId: 'frontier',
      Name: 'Jessa Crowe',
      Level: 2,
      XP: 280,
      CampaignName: 'Dustwater Run',
      Tags: ['Gunhand', 'Dustwater'],
      DMId: DEMO_DM.Id,
      DMName: DEMO_DM.Username,
      PlayerClass: { Name: 'Drifter', AttributeGrowth: commonGrowth },
      Attributes: demoAttributes(2),
      Skills: [
        demoSkill('Strike', 20, 45, 'Make a precise melee attack.', ['Strength', 'Dexterity'], ['combat']),
        demoSkill('Track', 15, 30, 'Follow a trail through difficult terrain.', ['Mental', 'Constitution'], ['survival']),
        demoSkill('Sneak', 14, 15, 'Move quietly while avoiding attention.', ['Dexterity', 'Mental'], ['stealth']),
      ],
    },
    {
      SystemId: ESSENCE_SYSTEM_ID,
      Essence: { ...structuredClone(GILES_YAVIN_MEGATRON), Alias: 'Gym', DisabledSpellPaths: ['Kido', 'Hado'] },
      Name: GILES_YAVIN_MEGATRON_NAME,
      Level: 0,
      XP: 0,
      CampaignName: 'Welcome to the Sprawl',
      Tags: ['Half-Construct', 'Zodiac of Ambition'],
      DMId: DEMO_DM.Id,
      DMName: DEMO_DM.Username,
      PlayerClass: { Name: GILES_YAVIN_MEGATRON.SpiritWeaponCategory, AttributeGrowth: commonGrowth },
      Attributes: demoAttributes(0),
      Skills: [],
    },
  ]

  demoSheets.forEach((sheet, index) => {
    const id = `demo-character-${index + 1}`
    records.set(id, {
      ...clone(sheet),
      Version: 1,
      Id: id,
      OwnerId: DEMO_PLAYER.Id,
      OwnerName: DEMO_PLAYER.Username,
      CreatedAt: now,
      UpdatedAt: now,
    })
  })
}

export function seedCharacterRecords(): CharacterSheetRecord[] {
  seedDemoCharacterSheets()
  return [...records.values()].map(clone)
}
