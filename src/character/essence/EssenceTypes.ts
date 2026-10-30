export type EssenceRace = 'Human' | 'Soul' | 'Hollow' | 'Native' | 'Half-Construct'

export type EssenceTechnique = {
  Name: string
  MinReiryoku: number | string
  MaxReiryoku: number | string
  MinSkill: string
  DC: string
  Action: string
  Range: string
  Damage: string
  Details: string
  Flavour?: string
  PassiveEffect?: string
  ActiveEffect?: string
}

export type EssenceSpell = {
  Path: 'Kido' | 'Hado'
  Order: number
  Name: string
  Pronunciation: string
  MinReiryoku: number | string
  MaxReiryoku: number | string
  ReiatsuRequired: number | string
  ReiatsuDC: string
  Range: string
  Essence: string
  Effect: string
  Uses: number
  RequiredUses: number
}

export type EssenceSpiritWeapon = {
  Name: string
  Category: string
  CostToSummon: string
  CostToMaintain: string
  ToHit: string
  ActionType: string
  Range: string
  Damage: string
  Details: string
  Pact: { Name: string; Description: string; Effect: string }
  Curse: { Name: string; Description: string; Effect: string }
}

export type EssenceResero = {
  Stage: 'Partial' | 'First' | 'True'
  Name: string
  Action: string
  DC: string
  CostToTrigger: number
  CostToMaintain: number
  BonusHP: number
  BonusReiryoku: number
  BonusArmour: number
  RequiredSpiritWeaponUses: number
  RequiredSkillPoints: number
  AlignedEssence: string
  EssenceInvested: number
  Details: string
}

export type EssenceNote = { Title: string; Body: string }

// Long-term injuries are recorded per body location, as on the workbook's injury table.
export type EssenceInjury = { Location: string; Name: string; Duration: string; Result: string }
export type EssenceStatus = { Name: string; Duration: string; Rules: string }
export type EssenceInventoryItem = { Name: string; Quantity: number; Size: number; Burden: number }

// Append-only record of what a player developed or spent; only the DM reads it.
export type DevelopmentLogEntry = {
  Id: string
  Timestamp: string
  Actor: string
  Role: 'player' | 'dm'
  Kind: 'uses' | 'points' | 'development' | 'essence'
  Category: 'attribute' | 'skill' | 'other' | 'essence'
  Target: string
  Amount: number
  // True when the player asked for as much development as needed (X) instead of a number.
  AsNeeded?: boolean
  Before: number
  After: number
  Purpose: string
}

export type EssenceArmourPiece = {
  Slot: string
  Name: string
  Type: string
  ArmourValue: number
  DodgeMod: number
  DefenseMod: number
  AthleticsMod: number
  MaxReiMod: number
  Burden: number
  ArmourMod: number
}

export type EssenceHolding = {
  Name: string
  Tier: 1 | 2 | 3 | 4 | 5
  Amount: number
  Tempered: boolean
}

export type EssenceZodiac = {
  Name: string
  Essence: string
  Passive: string
  Active: string
}

export type EssenceCharacterData = {
  PlayerName: string
  // Everyday name used outside the sheet itself.
  Alias?: string
  Concept: string
  Age: number
  Race: EssenceRace
  SpiritWeaponCategory: string
  Attributes: Record<string, number>
  Skills: Record<string, number>
  Development: {
    Metaphysical: Record<string, number>
    AttributeUses: Record<string, number>
    SkillUses: Record<string, number>
    Stats: Record<string, number>
  }
  DMIssuedPoints: number
  Zodiac: EssenceZodiac
  Armour: EssenceArmourPiece[]
  Wearables: { mask: number; badge: number; talisman: number; pouch: number; charm: number }
  SheetBonuses: { hp: number; reiryoku: number; willpower: number; armour: number; initiative: number }
  TemporaryResources?: Partial<Record<'hp' | 'reiryoku' | 'willpower', { Current?: number; Max?: number }>>
  Essences: EssenceHolding[]
  Mastery: number
  PotentialStored: number
  SpiritWeapons: EssenceSpiritWeapon[]
  Resero: EssenceResero[]
  Techniques: EssenceTechnique[]
  Spells: EssenceSpell[]
  // Spell paths this character cannot cast; they stay listed but cannot be used.
  DisabledSpellPaths?: EssenceSpell['Path'][]
  Injuries?: EssenceInjury[]
  Statuses?: EssenceStatus[]
  Inventory?: EssenceInventoryItem[]
  DevelopmentLog?: DevelopmentLogEntry[]
  // When the DM last opened the log; later player entries show as new.
  DevelopmentLogSeenAt?: string
  Notes: EssenceNote[]
}
