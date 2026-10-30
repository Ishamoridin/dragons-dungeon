import type { EssenceCharacterData, EssenceRace, EssenceResero, EssenceZodiac } from './EssenceTypes'

export const ESSENCE_SYSTEM_ID = 'essence'

export function spiritWeaponLabel(data: EssenceCharacterData): string {
  const categories = [...new Set(data.SpiritWeapons.map((weapon) => weapon.Category).filter(Boolean))]
  return categories.length ? categories.join(' · ') : data.SpiritWeaponCategory
}

export type AttributeGroupId = 'mental' | 'physical' | 'spiritual'

// Spiritual and Social are synonyms in this system, so either name resolves to the same group.
export const ATTRIBUTE_GROUPS: { Id: AttributeGroupId; Name: string; Aliases: string[]; Label: string }[] = [
  { Id: 'mental', Name: 'Mental', Aliases: [], Label: 'Mental' },
  { Id: 'physical', Name: 'Physical', Aliases: [], Label: 'Physical' },
  { Id: 'spiritual', Name: 'Spiritual', Aliases: ['Social'], Label: 'Spiritual' },
]

export function resolveAttributeGroup(name: string): AttributeGroupId | null {
  const wanted = name.trim().toLowerCase()
  const match = ATTRIBUTE_GROUPS.find(
    (group) => group.Name.toLowerCase() === wanted || group.Aliases.some((alias) => alias.toLowerCase() === wanted),
  )
  return match?.Id ?? null
}

export type AttributeTag = 'int' | 'wis' | 'res' | 'reir' | 'str' | 'con' | 'agi' | 'reia' | 'pre' | 'man' | 'com' | 'reis'

export type EssenceAttributeDefinition = {
  Id: string
  Name: string
  Tag: AttributeTag
  Group: AttributeGroupId
  Description: string
}

export const ESSENCE_ATTRIBUTES: EssenceAttributeDefinition[] = [
  { Id: 'intelligence', Name: 'Intelligence', Tag: 'int', Group: 'mental', Description: 'How well the mind can formulate, calculate, or extrapolate advanced information and apply it to advanced projects.' },
  { Id: 'wisdom', Name: 'Wisdom', Tag: 'wis', Group: 'mental', Description: 'Experience and intuition based on pattern recognition; the ability to understand root causes and catalysts.' },
  { Id: 'resolve', Name: 'Resolve', Tag: 'res', Group: 'mental', Description: 'Drive and raw ambition, used to stay focused, firm, and unwavering in the face of adversity.' },
  { Id: 'reiryokuControl', Name: 'Reiryoku Control', Tag: 'reir', Group: 'mental', Description: 'Capacity to generate spirit pressure from the Reishi the soul is made of, and the capacity of pressure it can hold.' },
  { Id: 'strength', Name: 'Strength', Tag: 'str', Group: 'physical', Description: 'How much physical force the muscles can apply and endure; core to physical combat and stamina.' },
  { Id: 'constitution', Name: 'Constitution', Tag: 'con', Group: 'physical', Description: 'How much physical punishment can be endured from environmental, physical, or metaphysical sources.' },
  { Id: 'agility', Name: 'Agility', Tag: 'agi', Group: 'physical', Description: 'Grace and precision of movement, including stealth, athletics, and ranged combat.' },
  { Id: 'reiatsuRelease', Name: 'Reiatsu Release', Tag: 'reia', Group: 'physical', Description: 'Ability to manipulate and release Reiryoku as active effects, and the potency and complexity achievable.' },
  { Id: 'presence', Name: 'Presence', Tag: 'pre', Group: 'spiritual', Description: 'Recognising and regulating presence among others: how noticeable, or how sincere, you seem.' },
  { Id: 'manipulation', Name: 'Manipulation', Tag: 'man', Group: 'spiritual', Description: 'Navigating, resolving, or directly manipulating the flow of social interactions.' },
  { Id: 'composure', Name: 'Composure', Tag: 'com', Group: 'spiritual', Description: 'Controlling the mind under stress, panic, or excessive strain.' },
  { Id: 'reishiManipulation', Name: 'Reishi Manipulation', Tag: 'reis', Group: 'spiritual', Description: 'Using Reiryoku to reach out to and shape spiritual matter (Reishi); helps durability and drain of Reishi techniques.' },
]

export type EssenceSkillDefinition = {
  Id: string
  Name: string
  Group: AttributeGroupId
  Governors: [AttributeTag, AttributeTag]
}

// The sheet's "Rei" tag on Mental skills is read as Reiryoku Control.
export const ESSENCE_SKILLS: EssenceSkillDefinition[] = [
  { Id: 'academics', Name: 'Academics', Group: 'mental', Governors: ['int', 'wis'] },
  { Id: 'politicsMental', Name: 'Politics', Group: 'mental', Governors: ['wis', 'res'] },
  { Id: 'occult', Name: 'Occult', Group: 'mental', Governors: ['wis', 'reir'] },
  { Id: 'crafting', Name: 'Crafting', Group: 'mental', Governors: ['int', 'reir'] },
  { Id: 'alchemy', Name: 'Alchemy', Group: 'mental', Governors: ['wis', 'reir'] },
  { Id: 'medicine', Name: 'Medicine', Group: 'mental', Governors: ['int', 'wis'] },
  { Id: 'herbology', Name: 'Herbology', Group: 'mental', Governors: ['int', 'wis'] },
  { Id: 'investigation', Name: 'Investigation', Group: 'mental', Governors: ['wis', 'res'] },
  { Id: 'analysis', Name: 'Analysis', Group: 'mental', Governors: ['int', 'res'] },
  { Id: 'metalworking', Name: 'Metalworking', Group: 'mental', Governors: ['res', 'reir'] },
  { Id: 'riding', Name: 'Riding', Group: 'physical', Governors: ['str', 'agi'] },
  { Id: 'exotic', Name: 'Exotic', Group: 'physical', Governors: ['str', 'agi'] },
  { Id: 'adaptation', Name: 'Adaptation', Group: 'physical', Governors: ['con', 'agi'] },
  { Id: 'survival', Name: 'Survival', Group: 'physical', Governors: ['con', 'reia'] },
  { Id: 'stealth', Name: 'Stealth', Group: 'physical', Governors: ['str', 'reia'] },
  { Id: 'brawl', Name: 'Brawl', Group: 'physical', Governors: ['str', 'con'] },
  { Id: 'ranged', Name: 'Ranged', Group: 'physical', Governors: ['agi', 'reia'] },
  { Id: 'weaponry', Name: 'Weaponry', Group: 'physical', Governors: ['str', 'agi'] },
  { Id: 'athletics', Name: 'Athletics', Group: 'physical', Governors: ['str', 'agi'] },
  { Id: 'larceny', Name: 'Larceny', Group: 'physical', Governors: ['agi', 'reia'] },
  { Id: 'empathy', Name: 'Empathy', Group: 'spiritual', Governors: ['pre', 'com'] },
  { Id: 'expression', Name: 'Expression', Group: 'spiritual', Governors: ['pre', 'man'] },
  { Id: 'intimidation', Name: 'Intimidation', Group: 'spiritual', Governors: ['pre', 'reis'] },
  { Id: 'persuasion', Name: 'Persuasion', Group: 'spiritual', Governors: ['man', 'com'] },
  { Id: 'streetwise', Name: 'Streetwise', Group: 'spiritual', Governors: ['pre', 'man'] },
  { Id: 'subterfuge', Name: 'Subterfuge', Group: 'spiritual', Governors: ['pre', 'com'] },
  { Id: 'faith', Name: 'Faith', Group: 'spiritual', Governors: ['reis', 'com'] },
  { Id: 'piety', Name: 'Piety', Group: 'spiritual', Governors: ['man', 'reis'] },
  { Id: 'zeal', Name: 'Zeal', Group: 'spiritual', Governors: ['pre', 'reis'] },
  { Id: 'politicsSpiritual', Name: 'Politics', Group: 'spiritual', Governors: ['pre', 'man'] },
]

export const RACES: EssenceRace[] = ['Human', 'Soul', 'Hollow', 'Native', 'Half-Construct']
export const SPIRIT_WEAPON_CATEGORIES = [
  'Spirit Blade', 'Reishi Weapon', 'Spirit Body', 'Reishi Companion', 'Spirit Aura', 'Reiatsu Casting', 'Reishi Armour', 'Spirit Curse',
] as const

export type RaceBonus = {
  hp: number
  reiryoku: number
  willpower: number
  armour: number
  dodge: number
  defense: number
  initiative: number
  brawl: number
}

export const RACE_BONUSES: Record<EssenceRace, RaceBonus> = {
  Human: { hp: 0, reiryoku: 25, willpower: 50, armour: 0, dodge: 2, defense: 2, initiative: 1, brawl: 0 },
  Hollow: { hp: 50, reiryoku: 0, willpower: 25, armour: 25, dodge: 0, defense: 2, initiative: 3, brawl: 2 },
  Soul: { hp: 0, reiryoku: 50, willpower: 0, armour: 0, dodge: 2, defense: 0, initiative: 1, brawl: 0 },
  Native: { hp: 25, reiryoku: 50, willpower: 25, armour: 10, dodge: 1, defense: 1, initiative: 2, brawl: 1 },
  'Half-Construct': { hp: 100, reiryoku: 100, willpower: -100, armour: 100, dodge: -3, defense: 3, initiative: -1, brawl: 3 },
}

export const STARTING_POINTS = { attributes: 30, skills: 50 }

export const ESSENCE_ZODIACS: EssenceZodiac[] = [
  { Name: 'Rat', Essence: 'Gloom', Passive: 'Can auto-pass one Stealth roll per session.', Active: 'Become invisible for 15 minutes or 1d3+1 combat turns.' },
  { Name: 'Ox', Essence: 'Determination', Passive: 'Can trigger regen on experiencing any cost, twice per session.', Active: 'Become incapable of hitting 0 HP for 1d2 combat turns.' },
  { Name: 'Tiger', Essence: 'Courage', Passive: 'Auto-pass one social and one resolve roll per session.', Active: 'Regain 100 to all 3 bars.' },
  { Name: 'Rabbit', Essence: 'Hope', Passive: 'Grant all allies +2 for one turn, twice per session.', Active: 'Grant one free action to 1d5 party members this turn.' },
  { Name: 'Dragon', Essence: 'Fire', Passive: 'Add first damage taken to armour; lose half value from max Will for one session.', Active: 'Learn a technique (up to T3 Essence) survived via defending.' },
  { Name: 'Snake', Essence: 'Surprise', Passive: 'Double cast any one Rei-based action for free per session.', Active: 'Mimic one technique observed this session (note timestamp).' },
  { Name: 'Horse', Essence: 'Drive', Passive: '+50% move distance and +50% max Willpower.', Active: 'Gain a free move, grant ally free major action, they can follow.' },
  { Name: 'Goat', Essence: 'Nature', Passive: 'Heals everyone within 10 ft by 20+ to all three bars when resting; x2 if nature surrounded.', Active: 'Generate a 10ft x 10ft nature essence region around yourself.' },
  { Name: 'Monkey', Essence: 'Insight', Passive: 'Can exchange 50% of their pool via Reishi to construct a random tool based on spent Rei.', Active: 'Convert any tool from passive into T1 Construct for one session.' },
  { Name: 'Rooster', Essence: 'Order', Passive: 'Can force a chosen Zodiac member to go first on initiative during a turn, twice per session.', Active: 'Can change 2 turns on initiative board / grant 2 allies a major.' },
  { Name: 'Dog', Essence: 'Beast', Passive: 'Act with a +1 to all rolls if any member of the Zodiac spends a minor action cheering.', Active: 'Howl to share the buff with the whole party for the next turn.' },
  { Name: 'Koi', Essence: 'Water', Passive: 'Healing others has halved costs and applies 50% as self-heal.', Active: 'Swim up to 15 tiles, even through (inert) Reishi.' },
  {
    Name: 'Weasel',
    Essence: 'Ambition',
    Passive: [
      'Allows the wielder of this character, or anyone within 25 foot of them, to roll with a +1 if this Zodiac pays 100 willpower; this can stack infinitely.',
      'This character can grant a permanent +1 to all rolls to any target by hitting them for 300+ damage during a session or day of the week.',
      'This character can grant a +3 to all rolls by costing one target -300 to all 3 bars for one week.',
      'This character can sacrifice any one skill slot, stat slot, or devleopment slot (potency based on amount sacrificed) for 1d2+1 weeks for a +5 to all rolls in another chosen slot/field on anyone within touch range upon declaring this.',
      'Character can gain up to x5 to their max of a chosen bar, by sacrificing 20% from the max permanently afterwards.',
      'Character can handle any stable or unstable essence without fatal consequences by suffering fate consequences any time the unstable would fail or collapse.',
    ].join('\n\n'),
    Active: 'Character can undo any roll, by anyone, within 5 foot of them, at a cost of 200 willpower each time this is done. Max uses: 5/session.',
  },
]

// Splits sheet text into paragraphs on blank lines; single line breaks inside a paragraph are just wrapping.
export const toParagraphs = (text: string): string[] =>
  text.split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

export const ZODIAC_ACTIVE_COST = { willpower: 50, action: 'Major Action', usesPerSession: 1 }

// Sheets say "Not Applicable" (or leave it blank) for techniques that deal no damage.
export const damageLabel = (damage: string): string =>
  !damage.trim() || /^(n\/a|not applicable)$/i.test(damage.trim()) ? 'No Damage' : damage

type EssenceTierRates = { amount: number; durationOrArea: number; range: number }

// Divisors applied to the essence amount spent; Tier 5 (Harmony) combines two other essences instead.
export const ESSENCE_TIER_DIVISORS: Record<1 | 2 | 3 | 4, EssenceTierRates> = {
  1: { amount: 6, durationOrArea: 10, range: 10 },
  2: { amount: 4, durationOrArea: 8, range: 5 },
  3: { amount: 3, durationOrArea: 6, range: 4 },
  4: { amount: 2, durationOrArea: 5, range: 3 },
}

export function castEssence(tier: 1 | 2 | 3 | 4, amount: number) {
  const rates = ESSENCE_TIER_DIVISORS[tier]
  return {
    effect: amount / rates.amount,
    durationOrArea: amount / rates.durationOrArea,
    range: tier === 1 ? null : amount / rates.range,
    reiryokuCost: (amount / 4) * tier,
  }
}

export type ReseroStage = EssenceResero['Stage']

export const RESERO_ORDER: ReseroStage[] = ['Partial', 'First', 'True']

export type EssenceDerived = {
  trueHP: number
  maxHP: number
  trueReiryoku: number
  maxReiryoku: number
  trueWillpower: number
  maxWillpower: number
  armour: number
  dodge: number
  defense: number
  initiative: number
  ranged: number
  weaponry: number
  brawl: number
  reiatsuModifier: number
  reishiModifier: number
  maxBurden: number
  points: {
    attributesInvested: number
    skillsInvested: number
    totalInvested: number
    allocated: number
    issued: number
    available: number
  }
  resero: { maxPotential: number; damageBonus: number; armourBonus: number; rollBonus: number }
  // Bonuses already included in maxHP, maxReiryoku and armour while a Resero stage is active.
  reseroActive: {
    stage: ReseroStage
    // Every stage up to and including the current one; their effects all apply.
    stages: ReseroStage[]
    hp: number
    reiryoku: number
    armour: number
    // Only the current form's aligned essence applies, never a lower stage's.
    alignedEssence: { name: string; amount: number } | null
  } | null
}

const tagToAttributeId = Object.fromEntries(ESSENCE_ATTRIBUTES.map((attribute) => [attribute.Tag, attribute.Id])) as Record<AttributeTag, string>

export function skillCap(data: EssenceCharacterData, skill: EssenceSkillDefinition): number {
  return Math.max(...skill.Governors.map((tag) => data.Attributes[tagToAttributeId[tag]] ?? 0))
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export function computeEssenceStats(data: EssenceCharacterData, reseroStage: ReseroStage | null = null): EssenceDerived {
  const a = (id: string) => data.Attributes[id] ?? 0
  const s = (id: string) => data.Skills[id] ?? 0
  const race = RACE_BONUSES[data.Race]
  const bonus = data.SheetBonuses
  const wear = data.Wearables
  const armourSum = (field: 'ArmourValue' | 'DodgeMod' | 'DefenseMod' | 'MaxReiMod' | 'ArmourMod') =>
    sum(data.Armour.map((piece) => piece[field]))

  const allBarBonus = wear.charm
  const barAttributes = 5 * (a('resolve') + a('constitution') + a('reiatsuRelease') + a('composure'))

  const trueHP = 100 + 5 * (a('strength') + a('constitution') + a('agility')) + race.hp + allBarBonus
  const trueReiryoku = 100 + barAttributes + race.reiryoku + armourSum('MaxReiMod') + wear.badge + wear.talisman + allBarBonus
  const trueWillpower = 100 + barAttributes + race.willpower + allBarBonus

  const attributesInvested = sum(Object.values(data.Attributes)) - STARTING_POINTS.attributes
  const skillsInvested = sum(Object.values(data.Skills)) - STARTING_POINTS.skills
  const totalInvested = attributesInvested + skillsInvested

  const potentialTier = Math.floor(data.PotentialStored / 500)
  const activeResero = reseroStage ? data.Resero.find((stage) => stage.Stage === reseroStage) : undefined
  // Lower stages keep applying; HP and Reiryoku add up while armour takes only the highest bonus.
  const appliedResero = reseroStage
    ? data.Resero.filter((stage) => RESERO_ORDER.indexOf(stage.Stage) <= RESERO_ORDER.indexOf(reseroStage))
    : []
  const reseroHP = sum(appliedResero.map((stage) => stage.BonusHP))
  const reseroReiryoku = sum(appliedResero.map((stage) => stage.BonusReiryoku))
  const reseroArmour = Math.max(0, ...appliedResero.map((stage) => stage.BonusArmour))

  return {
    trueHP,
    maxHP: trueHP + bonus.hp + reseroHP,
    trueReiryoku,
    maxReiryoku: trueReiryoku + bonus.reiryoku + reseroReiryoku,
    trueWillpower,
    maxWillpower: trueWillpower + bonus.willpower,
    armour: race.armour + armourSum('ArmourValue') + armourSum('ArmourMod') + wear.mask + bonus.armour + potentialTier * 25 + reseroArmour,
    // The sheet's dodge formula reads Weaponry where this sits, not Athletics.
    dodge: (a('wisdom') + a('agility') + s('weaponry') + a('composure')) / 4 + race.dodge + armourSum('DodgeMod'),
    defense: (a('strength') + a('constitution') + a('reiatsuRelease') + a('agility')) / 4 + race.defense + armourSum('DefenseMod'),
    initiative: (a('resolve') + a('composure') + a('agility') + a('wisdom')) / 3 + race.initiative + bonus.initiative,
    ranged: (s('ranged') + a('agility') + a('reiatsuRelease')) / 2,
    weaponry: (s('weaponry') + a('strength') + a('agility')) / 2,
    brawl: (s('brawl') + a('strength') + a('reiatsuRelease')) / 2 + race.brawl,
    reiatsuModifier: a('presence') / 2 + a('reishiManipulation') / 2 + a('reiatsuRelease') / 4 + a('reiryokuControl') / 4,
    reishiModifier: a('presence') / 4 + a('resolve') / 4 + a('reishiManipulation') / 2 + a('reiryokuControl') / 2,
    maxBurden: a('strength') + a('agility') + a('reiatsuRelease') + a('resolve') + wear.pouch,
    points: {
      attributesInvested,
      skillsInvested,
      totalInvested,
      allocated: sum(Object.values(data.Attributes)) + sum(Object.values(data.Skills)),
      issued: data.DMIssuedPoints,
      available: data.DMIssuedPoints - totalInvested,
    },
    resero: {
      maxPotential: 5000 + Math.floor(data.Mastery / 10) * 100,
      damageBonus: (25 + Math.floor(data.Mastery / 25) * 10) * potentialTier,
      armourBonus: potentialTier * 25,
      rollBonus: Math.min(potentialTier, 4 + Math.floor(data.Mastery / 50)),
    },
    reseroActive: activeResero
      ? {
          stage: activeResero.Stage,
          stages: appliedResero.map((stage) => stage.Stage),
          hp: reseroHP,
          reiryoku: reseroReiryoku,
          armour: reseroArmour,
          alignedEssence: /^none$/i.test(activeResero.AlignedEssence) || !activeResero.AlignedEssence
            ? null
            : { name: activeResero.AlignedEssence, amount: activeResero.EssenceInvested },
        }
      : null,
  }
}

export function isReseroUnlocked(data: EssenceCharacterData, stage: EssenceResero): boolean {
  const uses = data.Development.Metaphysical.spiritWeapon ?? 0
  return uses >= stage.RequiredSpiritWeaponUses && computeEssenceStats(data).points.allocated >= stage.RequiredSkillPoints
}

export const ESSENCE_RULES: { Title: string; Body: string }[] = [
  { Title: 'Turn structure', Body: 'Open floor until a situation needs turn order. Each turn: Movement (5 squares standard), then a Major action (any action with intention, execution, or a roll), then a Minor action (repeat a major, move, or a few moments with no roll).' },
  { Title: 'Resting', Body: 'Each 15 minutes of declared rest restores 25 Reiryoku. A deep rest of an hour or more restores 30 Reiryoku and 15 Willpower per 15 minutes.' },
  { Title: 'HP, Reiryoku, Willpower', Body: 'At 0 HP a character is comatose and dies if not rescued within 3 turns. At 0 Reiryoku all rolls take -5 until 20% of maximum is available. Willpower: 10 adds +1 to a roll (max +1), 25 buys 5 extra movement tiles, 2 Willpower can stand in for 1 Reiryoku on casts. At 0 Willpower the character is knocked out for 30 minutes or 3 turns.' },
  { Title: 'Skill caps', Body: 'A skill cannot exceed its governing attribute; where two govern, the higher of the two sets the cap. Zero in a skill or attribute rolls with -1.' },
  { Title: 'Criticals', Body: 'Critical fail only on a natural 1; critical success only on a natural 20, unless a Resero or similar power says otherwise.' },
  { Title: 'Defender loses', Body: 'Defense, Dodge, and Panic Cast rolls must beat the attack roll by +1; matching it does not defend.' },
  { Title: 'Reactions', Body: 'Defend (15 Willpower) forces minimum damage; Dodge (10) must beat the to-hit by 1; Panic cast raises DC and costs 50% more; Counter (25) must beat the to-hit by 2. Reacting for an ally costs 50 Willpower.' },
  { Title: 'Armour and defense', Body: 'Armour is a flat value; Defense forces minimum damage but ignores armour. Reiryoku, Willpower, and true damage bypass armour.' },
  { Title: 'Cooperative actions', Body: 'Each extra participant in a cooperative Kido, Hado, or Resero cast adds a 10% boost to the overall effect.' },
  { Title: 'Development', Body: 'Every 25 uses of a skill can create a minor active or passive technique, or raise the skill by 1 if its governing attribute allows. 100 uses creates a major technique. Kido and Hado are mastered by filling the required uses of all five core techniques; then 25 uses designs a new one.' },
  { Title: 'Resero', Body: 'Partial, First, and True Resero unlock as Spirit Weapon uses and total attribute plus skill points reach each stage threshold. Each stage can align one essence (up to 50,000) to add damage and a trait.' },
  { Title: 'Zodiac', Body: 'A Zodiac mark generates 1 unit of its essence every 10 minutes (1,008 per week). Once per session the Active blessing can be invoked for 50 Willpower and a Major Action.' },
]
