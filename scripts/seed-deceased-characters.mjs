// Creates sheet records for the campaign's dead, named with a <Deceased> tag: Vinnie (the Hollow), Hotwire (the
// InduDrake Vinnie became, kept as its own sheet because the body, weapon form and essence access all changed)
// and Crash Vandal. Every number is an estimate reconstructed from the roll modifiers and events in the Roll20
// archive (docs/journal/welcome-to-the-sprawl); the Notes on each sheet say so. Re-running updates in place.
//
//   node scripts/seed-deceased-characters.mjs --dry-run
//   node scripts/seed-deceased-characters.mjs
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export const CAMPAIGN_NAME = 'Welcome to the Sprawl'
export const DECEASED_TAG = ' <Deceased>'

const ATTRIBUTE_IDS = ['intelligence', 'strength', 'presence', 'wisdom', 'constitution', 'manipulation', 'resolve', 'agility', 'composure', 'reiryokuControl', 'reiatsuRelease', 'reishiManipulation']
const SKILL_IDS = ['academics', 'riding', 'empathy', 'politicsMental', 'exotic', 'expression', 'occult', 'adaptation', 'intimidation', 'crafting', 'survival', 'persuasion', 'alchemy', 'stealth', 'streetwise', 'medicine', 'brawl', 'subterfuge', 'herbology', 'ranged', 'faith', 'investigation', 'weaponry', 'piety', 'analysis', 'athletics', 'zeal', 'metalworking', 'larceny', 'politicsSpiritual']
const zeros = (ids) => Object.fromEntries(ids.map((id) => [id, 0]))
const fill = (ids, values) => ({ ...zeros(ids), ...values })

const ESTIMATE_NOTE = {
  Title: 'About this sheet',
  Body: 'Reconstructed after the fact from the Roll20 chat archive. Attributes and skills are the last roll modifiers the character used; bars, armour and essence amounts are estimates from damage taken and costs paid. Treat every number as approximate.',
}

// The legacy top-level block every record carries; the Essence ruleset ignores it.
const legacyAttributes = () => Object.fromEntries(['Strength', 'Dexterity', 'Constitution', 'Mental', 'Social', 'Mana'].map((name) => [name, { value: 0, type: 'derived', subAttributes: [{ value: 0, type: 'basic' }, { value: 0, type: 'basic' }, { value: 0, type: 'basic' }] }]))
const playerClass = (name) => ({ Name: name, AttributeGrowth: { Strength: 1, Dexterity: 1, Constitution: 1, Mental: 1, Social: 1, Mana: 1 } })

const armourSet = (name, type, value, burden) => ['Helmet', 'Chestplate', 'Greaves', 'Boots', 'Gloves'].map((Slot) => ({ Slot, Name: name, Type: type, ArmourValue: value, DodgeMod: 0, DefenseMod: 0, AthleticsMod: 0, MaxReiMod: 0, Burden: burden, ArmourMod: 0 }))

export const VINNIE = {
  Name: `Vinnie${DECEASED_TAG}`,
  Tags: ['Hollow', 'Deceased'],
  PlayerClass: playerClass('Reishi Weapon'),
  Essence: {
    PlayerName: 'Ishamoridin',
    Concept: 'Night-aligned smoker and smoke-shaper. Died in the Township of Water and came back as a Hollow; later left this body behind to become Hotwire (see that sheet).',
    Age: 34, Race: 'Hollow', SpiritWeaponCategory: 'Reishi Weapon',
    Attributes: fill(ATTRIBUTE_IDS, { strength: 5, agility: 4, constitution: 10, intelligence: 4, wisdom: 4, presence: 8, manipulation: 1, composure: 6, resolve: 4, reiryokuControl: 12, reishiManipulation: 12, reiatsuRelease: 13 }),
    Skills: fill(SKILL_IDS, { brawl: 12, adaptation: 12, zeal: 6, occult: 5, intimidation: 4, athletics: 4, survival: 3, faith: 3, investigation: 2, weaponry: 2, empathy: 2, persuasion: 1 }),
    Development: {
      Metaphysical: fill(['reiatsuManipulation', 'spiritWeapon', 'reishiManipulation', 'kido', 'hado', 'essenceHarvesting', 'essenceCasting', 'essenceCultivation'], { spiritWeapon: 380, reishiManipulation: 120, essenceCultivation: 40, essenceHarvesting: 10 }),
      AttributeUses: fill(ATTRIBUTE_IDS, { reishiManipulation: 50, reiatsuRelease: 20, reiryokuControl: 25, constitution: 12, presence: 15, resolve: 20 }),
      SkillUses: fill(SKILL_IDS, { brawl: 15, occult: 15, adaptation: 6 }),
      Stats: { reducedToZeroHP: 2, tookOverTenPercent: 12, tookNoDamage: 2, dodged: 2, defended: 0 },
    },
    DMIssuedPoints: 0,
    Zodiac: { Name: '', Essence: 'Night', Passive: '', Active: '' },
    Armour: armourSet('Ferno Killer Suit (The Butcher\'s Suit)', 'Human-conditional set', 40, 3),
    Wearables: { mask: 0, badge: 0, talisman: 0, pouch: 0, charm: 0 },
    SheetBonuses: { hp: 1200, reiryoku: 900, willpower: 400, armour: 0, initiative: 0 },
    Essences: [
      { Name: 'Fire', Tier: 1, Amount: 50000, Tempered: false },
      { Name: 'Water', Tier: 1, Amount: 30000, Tempered: false },
      { Name: 'Surprise', Tier: 1, Amount: 4600, Tempered: false },
      { Name: 'Night', Tier: 2, Amount: 2000, Tempered: false },
      { Name: 'Dragon', Tier: 3, Amount: 44, Tempered: false },
    ],
    Mastery: 0, PotentialStored: 0,
    SpiritWeapons: [
      {
        Name: 'Smoke Dragon', Category: 'Reishi Weapon', CostToSummon: '50 Reiryoku', CostToMaintain: '10 Reiryoku', ToHit: 'Reishi Manipulation', ActionType: 'Major', Range: '10 Tiles', Damage: '1d50 + 25 per smoke stack (up to 10 stacks)',
        Details: 'Vinnie converts inert Reishi, melted walls and his own cigarette smoke into charges of Smoke, then shapes them into a dragon that strikes in bursts, or compresses them into temporary Reishi ingots worn as bands.',
      },
    ],
    Resero: [
      { Stage: 'Partial', Name: 'Partial Resero: Smoke Dragon', Action: 'Major Action', DC: 'Reishi Manipulation 15+', CostToTrigger: 50, CostToMaintain: 10, BonusHP: 100, BonusReiryoku: 100, BonusArmour: 25, RequiredSpiritWeaponUses: 100, RequiredSkillPoints: 100, AlignedEssence: 'Fire', EssenceInvested: 10000, Details: 'The Smoke Dragon gains detail and hovers above and behind him.' },
    ],
    Techniques: [
      { Name: 'Burning Nimbus', MinReiryoku: 50, MaxReiryoku: 150, MinSkill: 'Brawl (10)', DC: '15+', Action: 'Major', Range: 'Melee', Damage: '1d80+80', Details: 'Grapple and strike with a burning cloud of smoke.' },
      { Name: 'Self-immolating repair', MinReiryoku: 100, MaxReiryoku: 150, MinSkill: 'Reishi Manipulation (10)', DC: '15+', Action: 'Major', Range: 'Personal', Damage: 'Heals', Details: 'Lights his wounds aflame so the edges burn toward each other and close. 100 Reiryoku for the first turn, +50 per extra turn; a chosen injury per use.' },
      { Name: 'Chaotic Reishi (mutative trait)', MinReiryoku: 5, MaxReiryoku: 5, MinSkill: '', DC: '', Action: 'Free', Range: 'Personal', Damage: 'Not Applicable', Details: 'Converts any Tier 1 essence into any other Tier 1 essence at 5 Reiryoku per mote. Gained from Clerk Phiré\'s test.' },
      { Name: 'The Crux of Fire', MinReiryoku: 0, MaxReiryoku: 0, MinSkill: '', DC: '', Action: '', Range: '', Damage: '', Details: 'The flame still burns and must be reignited; Vinnie may become a Fire Hollow or the Heart will remember being broken. Convertible to a Hex or Pact once the method is found.' },
    ],
    Spells: [],
    Notes: [
      ESTIMATE_NOTE,
      { Title: 'Fate', Body: 'Died in the Township of Water on 5 July 3500 and returned as a Hollow the same hour. Fought from the scav camp to the fall of the Doom barrier at Air. Seven weeks later this body was gone and Hotwire stood in its place; Hotwire has his own sheet.' },
      { Title: 'Essence note', Body: 'Gave 10,000 Fire to the Fangs to make their leader a Native. The 44 Dragon is a tertiary essence he wove himself: fire magnified by fire.' },
    ],
    Injuries: [],
    Inventory: [
      { Name: 'Reishooter', Quantity: 1, Size: 2, Burden: 2 },
      { Name: 'Rush Guard Helmet (century-old pattern, freshly forged)', Quantity: 1, Size: 2, Burden: 2 },
      { Name: 'Cigarettes', Quantity: 1, Size: 1, Burden: 0 },
    ],
  },
}

export const HOTWIRE = {
  Name: `Hotwire${DECEASED_TAG}`,
  Tags: ['Hollow', 'Spirit Beast', 'InduDrake', 'Deceased'],
  PlayerClass: playerClass('Spirit Beast'),
  Essence: {
    PlayerName: 'Ishamoridin',
    Concept: 'What Vinnie became: an InduDrake, a Spirit Beast of smoke and iron, still a Hollow underneath. Could draw on nothing but Steel and Industry. Fell at Shimmering Sands.',
    Age: 34, Race: 'Hollow', SpiritWeaponCategory: 'Spirit Beast',
    Attributes: fill(ATTRIBUTE_IDS, { strength: 5, agility: 4, constitution: 15, intelligence: 4, wisdom: 4, presence: 15, manipulation: 1, composure: 6, resolve: 4, reiryokuControl: 15, reishiManipulation: 16, reiatsuRelease: 15 }),
    Skills: fill(SKILL_IDS, { brawl: 15, intimidation: 15, adaptation: 12, athletics: 4, survival: 3, occult: 5, investigation: 2, weaponry: 2, empathy: 2, persuasion: 1 }),
    Development: {
      Metaphysical: fill(['reiatsuManipulation', 'spiritWeapon', 'reishiManipulation', 'kido', 'hado', 'essenceHarvesting', 'essenceCasting', 'essenceCultivation'], { spiritWeapon: 520, reishiManipulation: 160, essenceCultivation: 40, essenceHarvesting: 10 }),
      AttributeUses: fill(ATTRIBUTE_IDS, { reishiManipulation: 60, reiatsuRelease: 25, reiryokuControl: 30, constitution: 15, presence: 20, resolve: 20 }),
      SkillUses: fill(SKILL_IDS, { brawl: 20, occult: 15, adaptation: 8 }),
      Stats: { reducedToZeroHP: 1, tookOverTenPercent: 4, tookNoDamage: 1, dodged: 0, defended: 0 },
    },
    DMIssuedPoints: 0,
    Zodiac: { Name: '', Essence: 'Night', Passive: '', Active: '' },
    Armour: armourSet('Ferno Killer Suit (The Butcher\'s Suit)', 'Human-conditional set', 40, 3),
    Wearables: { mask: 0, badge: 0, talisman: 0, pouch: 0, charm: 0 },
    SheetBonuses: { hp: 1500, reiryoku: 1200, willpower: 600, armour: 0, initiative: 0 },
    Essences: [
      { Name: 'Steel', Tier: 1, Amount: 25000, Tempered: false },
      { Name: 'Industry', Tier: 2, Amount: 5000, Tempered: false },
    ],
    Mastery: 0, PotentialStored: 0,
    SpiritWeapons: [
      {
        Name: 'InduDrake form', Category: 'Spirit Beast', CostToSummon: 'Permanent', CostToMaintain: '0', ToHit: 'Brawl / Reishi Manipulation', ActionType: 'Major', Range: 'Melee / 10 Tiles', Damage: '2d50+250 (smoke) / 1d50+200 (Reishi)',
        Details: 'The Smoke Dragon became his body. Smoke is shaped from Steel and Industry only. Screw, a tiny white helix-moving copy, scavenges useful objects and converts inert Reishi into Smoke for him while in range.',
      },
    ],
    Resero: [
      { Stage: 'Partial', Name: 'Partial Resero: Iron Smoke', Action: 'Major Action', DC: 'Reishi Manipulation 15+', CostToTrigger: 50, CostToMaintain: 10, BonusHP: 100, BonusReiryoku: 100, BonusArmour: 25, RequiredSpiritWeaponUses: 100, RequiredSkillPoints: 100, AlignedEssence: 'Steel', EssenceInvested: 10000, Details: 'Smoke compresses into temporary Reishi ingots worn as bands around chest and arms.' },
    ],
    Techniques: [
      { Name: 'Burning Nimbus', MinReiryoku: 50, MaxReiryoku: 150, MinSkill: 'Brawl (10)', DC: '15+', Action: 'Major', Range: 'Melee', Damage: '1d80+80', Details: 'Grapple and strike with a burning cloud of smoke.' },
      { Name: 'Self-immolating repair', MinReiryoku: 100, MaxReiryoku: 150, MinSkill: 'Reishi Manipulation (10)', DC: '15+', Action: 'Major', Range: 'Personal', Damage: 'Heals', Details: '100 Reiryoku for the first turn, +50 per extra turn; a chosen injury per use.' },
      { Name: 'Screw (construct)', MinReiryoku: 25, MaxReiryoku: 25, MinSkill: 'Reishi Manipulation (15)', DC: '20+', Action: 'Major', Range: '10 Tiles', Damage: 'Not Applicable', Details: 'A tiny white helix-moving copy of Hotwire with the instinct to find useful objects and bring them back, converting inert Reishi into Smoke on the way.' },
    ],
    Spells: [],
    Notes: [
      ESTIMATE_NOTE,
      { Title: 'Fate', Body: 'Appeared seven weeks after the Doom barrier fell, on the road to Shimmering Sands. Fought the Reimalgam and Thorne; did not walk out of the factory barracks. His Mote of Power remained with the party.' },
      { Title: 'Essence access', Body: 'Could cultivate and spend only Steel and Industry.' },
    ],
    Injuries: [],
    Inventory: [
      { Name: 'Rush Guard Helmet (century-old pattern, freshly forged)', Quantity: 1, Size: 2, Burden: 2 },
    ],
  },
}

export const CRASH = {
  Name: `Crash Vandal${DECEASED_TAG}`,
  Tags: ['Human', 'Deceased'],
  PlayerClass: playerClass('Reiatsu Casting'),
  Essence: {
    PlayerName: 'God',
    Concept: 'Former detective with a proper space gun, a panic problem and an infinite deck of cards. Felt more like a person after shedding his shell.',
    Age: 41, Race: 'Human', SpiritWeaponCategory: 'Reiatsu Casting',
    Attributes: fill(ATTRIBUTE_IDS, { strength: 6, agility: 8, constitution: 9, intelligence: 8, wisdom: 2, presence: 13, manipulation: 6, composure: 8, resolve: 13, reiryokuControl: 12, reishiManipulation: 9, reiatsuRelease: 13 }),
    Skills: fill(SKILL_IDS, { ranged: 12, brawl: 10, survival: 6, occult: 6, zeal: 9, investigation: 1, politicsMental: 2, intimidation: 4, persuasion: 4, streetwise: 6, expression: 3 }),
    Development: {
      Metaphysical: fill(['reiatsuManipulation', 'spiritWeapon', 'reishiManipulation', 'kido', 'hado', 'essenceHarvesting', 'essenceCasting', 'essenceCultivation'], { spiritWeapon: 420, hado: 40, reiatsuManipulation: 60, essenceCultivation: 25 }),
      AttributeUses: fill(ATTRIBUTE_IDS, { presence: 40, reiryokuControl: 30, reiatsuRelease: 30, resolve: 15 }),
      SkillUses: fill(SKILL_IDS, { survival: 20, ranged: 15, zeal: 10 }),
      Stats: { reducedToZeroHP: 0, tookOverTenPercent: 9, tookNoDamage: 4, dodged: 3, defended: 1 },
    },
    DMIssuedPoints: 0,
    Zodiac: { Name: '', Essence: 'Night', Passive: '', Active: '' },
    Armour: armourSet('Megacorp set', 'Corporate plate', 25, 2),
    Wearables: { mask: 0, badge: 50, talisman: 0, pouch: 5, charm: 10 },
    SheetBonuses: { hp: 600, reiryoku: 700, willpower: 900, armour: 0, initiative: 0 },
    Essences: [
      { Name: 'Night', Tier: 2, Amount: 400, Tempered: false },
      { Name: 'Water', Tier: 1, Amount: 38000, Tempered: false },
      { Name: 'Evil', Tier: 1, Amount: 25000, Tempered: false },
      { Name: 'Insight', Tier: 1, Amount: 1000, Tempered: false },
    ],
    Mastery: 0, PotentialStored: 0,
    SpiritWeapons: [
      {
        Name: 'The Infinite Deck', Category: 'Reiatsu Casting', CostToSummon: '25 Reiryoku', CostToMaintain: '0', ToHit: 'Reiatsu Release 15+', ActionType: 'Major', Range: '10 Tiles', Damage: 'Per card',
        Details: 'Roll 4d8 on summoning for a hand of four; draw a free card whenever one is used. 1 Ally attacks with their + your damage mod. 2 Ally gains your armour for one hit. 3 Free full movement for an ally. 4 Heal an ally 2d40. 5 Shared spell with both Reiatsu mods. 6 Switch two positions. 7 Free minor action. 8 Flip: refund your major for 50 Rei or grant an ally a major for 50 Rei. The Mirror card copies any technique seen once that day, twice.',
      },
    ],
    Resero: [],
    Techniques: [
      { Name: 'Follow my lead: Dodge', MinReiryoku: 25, MaxReiryoku: 50, MinSkill: 'Zeal (5)', DC: 'Reiryoku Control 15+', Action: 'Major', Range: 'Aura', Damage: 'Not Applicable', Details: 'Pushes the concept of dodging into his aura so allies within it share it.' },
      { Name: 'Inviolable Fuel', MinReiryoku: 0, MaxReiryoku: 0, MinSkill: '', DC: '', Action: 'Passive', Range: 'Personal', Damage: 'Not Applicable', Details: 'Immune to consumptive actions including Magma, Lit and Corruptive instant kills; takes at most 100 to each bar from any consumptive or critical instant kill.' },
      { Name: 'Wraith Resistance', MinReiryoku: 0, MaxReiryoku: 0, MinSkill: '', DC: '', Action: 'Passive', Range: 'Personal', Damage: 'Not Applicable', Details: 'Suffers only 25% damage to Reiryoku and Willpower from Wraith-drain techniques.' },
    ],
    Spells: [
      { Path: 'Hado', Order: 4, Name: 'Byakurai', Pronunciation: 'Byah-koo-rye', MinReiryoku: 20, MaxReiryoku: 60, ReiatsuRequired: 4, ReiatsuDC: '13+', Range: '8 Tiles', Essence: 'None (0)', Effect: 'A concentrated bolt of pale lightning from the fingertips.', Uses: 12, RequiredUses: 10 },
    ],
    Notes: [
      ESTIMATE_NOTE,
      { Title: 'Fate', Body: 'Last seen trading with the Zodiac at the Wandering Tavern after the Fire campaign. The player has left the campaign; the character is recorded as deceased.' },
      { Title: 'Companions', Body: 'A dragon hatched from the Essence Tower seed follows him and fights whoever he fights, but stays chill until there are folks to fight.' },
    ],
    Injuries: [],
    Inventory: [
      { Name: '2250 laser revolver ("a proper SPACE GUN")', Quantity: 1, Size: 2, Burden: 2 },
      { Name: 'Backpack', Quantity: 1, Size: 2, Burden: 1 },
      { Name: 'Detective\'s badge', Quantity: 1, Size: 1, Burden: 0 },
      { Name: 'Target brand target charm', Quantity: 1, Size: 1, Burden: 0 },
      { Name: 'Megacorp pouch', Quantity: 1, Size: 1, Burden: 0 },
      { Name: 'Cigarettes', Quantity: 2, Size: 1, Burden: 0 },
      { Name: 'Beer', Quantity: 2, Size: 1, Burden: 1 },
    ],
  },
}

export const DECEASED = [VINNIE, HOTWIRE, CRASH]

export function buildRecord(template, { owner, dm, existing, now = new Date().toISOString() }) {
  return {
    SystemId: 'essence', Level: 0, XP: 0, Skills: [], Attributes: legacyAttributes(),
    Name: template.Name, Tags: template.Tags, PlayerClass: template.PlayerClass, Essence: template.Essence, CampaignName: CAMPAIGN_NAME,
    Id: existing?.Id ?? randomUUID(), OwnerId: owner.Id, OwnerName: owner.Username, DMId: dm.Id, DMName: dm.Username,
    CreatedAt: existing?.CreatedAt ?? now, UpdatedAt: now, Version: (existing?.Version ?? 0) + (existing ? 1 : 1),
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) {
    for (const template of DECEASED) console.log(`${template.Name}: ${template.Essence.Race}, ${template.Essence.SpiritWeaponCategory}, essences ${template.Essence.Essences.map((e) => e.Name).join('/')}`)
    console.log('Nothing written.')
    return
  }
  await import('dotenv/config')
  const { connectDatabase } = await import('../server/database.mjs')
  const { saveRevision } = await import('../server/character-history.mjs')
  const { client, database: db } = await connectDatabase()
  try {
    const characters = db.collection('characters')
    const anchor = await characters.findOne({ CampaignName: CAMPAIGN_NAME, Name: { $not: /\(Deleted\)/ } }, { projection: { DMId: 1 } })
    if (!anchor) throw new Error(`No characters in "${CAMPAIGN_NAME}" to borrow a DM from.`)
    const dm = await db.collection('users').findOne({ Id: anchor.DMId })
    const ishamoridin = await db.collection('users').findOne({ Username: 'Ishamoridin' }) ?? dm
    const owners = {
      [VINNIE.Name]: ishamoridin,
      [HOTWIRE.Name]: ishamoridin,
      [CRASH.Name]: dm, // The player has left; the DM holds the sheet.
    }
    for (const template of DECEASED) {
      const existing = await characters.findOne({ CampaignName: CAMPAIGN_NAME, Name: template.Name })
      const record = buildRecord(template, { owner: owners[template.Name], dm, existing })
      if (existing) record.Version = (existing.Version ?? 0) + 1
      await saveRevision(db, { kind: 'characters', before: existing ?? null, after: record, actor: dm })
      console.log(`${existing ? 'updated' : 'created'} ${record.Name} (${record.Id}) owned by ${record.OwnerName}`)
    }
  } finally {
    await client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exit(1) })
}
