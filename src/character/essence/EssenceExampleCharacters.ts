// Example Essence characters for the Welcome to the Sprawl party beyond Gym. Their sheets are illustrative, built
// from the session journal (docs/journal/welcome-to-the-sprawl) rather than imported from a workbook, and they
// exercise the parts of the system Gym's sheet does not: three spirit weapons on one character, a pact or curse
// granted before its weapon has a name, and a curse that stands on its own block.
import { blankEssenceCharacter } from './EssenceSystem'
import { GILES_YAVIN_MEGATRON, GILES_YAVIN_MEGATRON_NAME } from './EssenceCharacters'
import type { EssenceCharacterData, EssenceSpiritWeapon } from './EssenceTypes'

const none = { Name: '', Description: '', Effect: '' }
const weapon = (fields: Partial<EssenceSpiritWeapon> & Pick<EssenceSpiritWeapon, 'Name' | 'Category'>): EssenceSpiritWeapon => ({
  CostToSummon: 'Not Applicable', CostToMaintain: 'Not Applicable', ToHit: '', ActionType: 'Passive', Range: 'Personal', Damage: '', Details: '', Pact: none, Curse: none, ...fields,
})

export const SYLAS_ENDERS_NAME = 'Sylas Enders'
export const SYLAS_ENDERS: EssenceCharacterData = blankEssenceCharacter({
  PlayerName: 'Rangerium', Concept: 'A dancer whose rhythm shapes Nature', Age: 27, Race: 'Soul', SpiritWeaponCategory: 'Spirit Body',
  Attributes: { ...blankEssenceCharacter().Attributes, agility: 14, constitution: 11, strength: 10, presence: 9, composure: 12, resolve: 10, wisdom: 8, reiryokuControl: 13, reishiManipulation: 9, reiatsuRelease: 7 },
  Skills: { ...blankEssenceCharacter().Skills, athletics: 12, brawl: 10, expression: 11, empathy: 6, survival: 8 },
  Development: { ...blankEssenceCharacter().Development, Metaphysical: { ...blankEssenceCharacter().Development.Metaphysical, spiritWeapon: 312, reishiManipulation: 44 } },
  DMIssuedPoints: 140,
  Zodiac: {
    Name: 'Goat', Essence: 'Nature',
    Passive: 'Heals everyone within 10 ft by 20+ to all three bars when resting; x2 if nature surrounded.',
    Active: 'Generate a 10ft x 10ft nature essence region around yourself.',
  },
  Essences: [{ Name: 'Nature', Tier: 1, Amount: 49276, Tempered: true }, { Name: 'Steel', Tier: 2, Amount: 494, Tempered: false }, { Name: 'Insight', Tier: 3, Amount: 196, Tempered: false }],
  SpiritWeapons: [
    weapon({
      Name: 'The Dance', Category: 'Spirit Body', CostToSummon: '20 Reiryoku', CostToMaintain: '10 Reiryoku per turn kept going', ToHit: 'Athletics or Expression of 15+, or standard counter rolls', ActionType: 'Active Passive', Range: 'Personal', Damage: '1d40+60',
      Details: 'While the dance is kept going every strike Sylas lands or counters adds one beat. Each beat multiplies the next combination: a four-strike combination at full rhythm multiplies its damage by the number of beats held (max x4).\n\nKeeping the dance going counts as a spirit weapon use each turn.',
      Pact: { Name: 'Two Paths', Description: 'The Wall has given this soul two ways back.', Effect: 'This character has denied themselves reincarnation until their role as a Zodiac is complete. If reduced to zero in all three bars they may instead return at the nearest Nature essence region with 1 in every bar, once per session.' },
      Curse: none,
    }),
    weapon({
      Name: 'Verdant Step', Category: 'Spirit Aura', CostToSummon: '40 Reiryoku', ToHit: 'Reishi Manipulation of 14+', ActionType: 'Minor', Range: '2 tiles around the wielder', Damage: '1d20+25 (Nature)',
      Details: 'Every tile Sylas dances across sprouts for one turn. Allies standing on sprouted ground heal 25 to all three bars at the start of their turn; enemies take the listed damage as Nature essence and lose 1 tile of movement.',
    }),
    weapon({
      Name: '', Category: '',
      Pact: { Name: 'Steel Sight', Description: 'Threads of reishi and Steel grew between his spirit and the reishi of his eyes.', Effect: 'Even with their own essence gone this character sees perfectly. Blindness and darkness penalties do not apply, and Steel essence spent on perception rolls counts double.' },
      Curse: { Name: 'Rescinded by Water', Description: 'Water will recognise the Zodiac as neutral, but identifies Sylas as acting beyond his jurisdiction.', Effect: 'Officials of the Township of Water treat this character as hostile until the Abyssal authority is restored. Social rolls against Water-aligned targets suffer -3.' },
    }),
  ],
  Resero: [{
    Stage: 'Partial', Name: 'The Dance - Crescendo', Action: 'Major Action', DC: 'Agility/Expression of 15+', CostToTrigger: 100, CostToMaintain: 50, BonusHP: 75, BonusReiryoku: 100, BonusArmour: 50,
    RequiredSpiritWeaponUses: 100, RequiredSkillPoints: 100, AlignedEssence: 'Nature', EssenceInvested: 25000,
    Details: 'On Trigger:\nThe rhythm becomes visible as rings of Nature essence. Counters no longer break the dance, and the beat cap rises to x6.\n\nEssence trait:\nRestoration - when Sylas consumes Nature essence, a ripple of restoration passes through every ally within 10 tiles for 50 to all three bars.',
  }],
  Techniques: [{ Name: 'Not a Human', MinReiryoku: 0, MaxReiryoku: 0, MinSkill: 'N/A', DC: 'N/A', Action: 'Passive', Range: '', Damage: '', Details: 'Issued by Boros. This character no longer counts as Human for essence, Realm or Zodiac effects that key off race.' }],
  Notes: [{ Title: 'Example sheet', Body: 'Sylas is an illustrative sheet built from the session journal. Link the real workbook to replace these values.' }],
})

export const GLITZ_NAME = 'Glitz'
export const GLITZ: EssenceCharacterData = blankEssenceCharacter({
  PlayerName: 'kbub', Concept: 'Rock star whose poses bend the room', Age: 24, Race: 'Human', SpiritWeaponCategory: 'Spirit Aura',
  Attributes: { ...blankEssenceCharacter().Attributes, presence: 15, manipulation: 12, composure: 10, agility: 9, constitution: 9, strength: 7, intelligence: 10, resolve: 11, reiatsuRelease: 14, reiryokuControl: 10, reishiManipulation: 8 },
  Skills: { ...blankEssenceCharacter().Skills, expression: 14, intimidation: 10, occult: 9, empathy: 7, faith: 5 },
  Development: { ...blankEssenceCharacter().Development, Metaphysical: { ...blankEssenceCharacter().Development.Metaphysical, spiritWeapon: 268, reiatsuManipulation: 91, essenceCultivation: 30 } },
  DMIssuedPoints: 150,
  Zodiac: {
    Name: 'Snake', Essence: 'Surprise',
    Passive: 'Double cast any one Rei-based action for free per session.',
    Active: 'Mimic one technique observed this session (note timestamp).',
  },
  Essences: [{ Name: 'Surprise', Tier: 1, Amount: 43969, Tempered: true }, { Name: 'Doom', Tier: 2, Amount: 3948, Tempered: false }, { Name: 'Fire', Tier: 3, Amount: 158, Tempered: false }],
  SpiritWeapons: [
    weapon({
      Name: 'Headbang', Category: 'Spirit Aura', CostToSummon: '30 Reiryoku', CostToMaintain: '15 Reiryoku per turn', ToHit: 'Expression of 14+', ActionType: 'Minor', Range: '5 tiles around the wielder', Damage: '',
      Details: 'The whole fight runs faster: every creature within range gains +2 initiative and one extra tile of movement, allies and enemies alike. If Glitz headbangs for three turns without pause he must pass a Composure of 12+ or lose himself in the song for a turn.',
      Pact: { Name: 'Desert Rose', Description: 'Married to Aureon of Fire.', Effect: 'Once per session Glitz may send a Surprise bird to Aureon as a free action. The reply arrives within five seconds and Fire-aligned NPCs who witness it treat Glitz as kin.' },
      Curse: none,
    }),
    weapon({
      Name: 'Arms Crossed', Category: 'Spirit Aura', CostToSummon: '30 Reiryoku', CostToMaintain: '15 Reiryoku per turn', ToHit: 'Composure of 14+', ActionType: 'Minor', Range: '5 tiles around the wielder', Damage: '',
      Details: 'Calms the battle: every creature within range loses 2 initiative and may not take extra actions granted by other effects. Glitz himself cannot attack while the pose is held.',
      Curse: { Name: 'Paid For It', Description: 'Danced on Doom with expression and luck, then paid for it.', Effect: 'Whenever a Surprise-driven roll succeeds by 10 or more, the next hostile roll against Glitz gains +2.' },
    }),
    weapon({
      Name: 'Guitar Solo', Category: 'Reiatsu Casting', CostToSummon: '50 Reiryoku', ToHit: 'Expression or Reiatsu Release of 16+', ActionType: 'Major Action', Range: 'Line of sight', Damage: '1d60+40',
      Details: 'Drags every eye in the room onto Glitz. All enemies that can see him must target him with their next action or pass a Resolve of 15+; those that fail also take the listed damage as Willpower. Glitz’s curses placed during the solo strip 50 armour and cannot be resisted until the target’s own turn.',
    }),
  ],
  Resero: [{
    Stage: 'First', Name: 'Guitar Solo: Encore', Action: 'Major Action', DC: 'Presence/Reiatsu Release of 18+', CostToTrigger: 125, CostToMaintain: 0, BonusHP: 100, BonusReiryoku: 125, BonusArmour: 75,
    RequiredSpiritWeaponUses: 250, RequiredSkillPoints: 150, AlignedEssence: 'Surprise', EssenceInvested: 40000,
    Details: 'On Trigger:\nAll three poses may be held at once and the maintain cost of the Headbang and Arms Crossed drops to zero (granted by the Wall after Fifty Million Earth).\n\nEssence trait:\nAnything is possible - once per combat Glitz may declare a roll a surprise and swap its natural result with any ally’s natural result from this round.',
  }],
  Techniques: [{ Name: 'Agnostic Reishi', MinReiryoku: 10, MaxReiryoku: 100, MinSkill: 'Reiatsu Release (6+)', DC: '14+', Action: 'Major Action', Range: '10 tiles', Damage: '1d50+(Rei invested)', Details: 'Issued by Boros. A beam that carries no essence alignment, so no essence-based resistance applies to it.' }],
  Notes: [{ Title: 'Example sheet', Body: 'Glitz is an illustrative sheet built from the session journal. Link the real workbook to replace these values.' }],
})

export const EXAMPLE_ESSENCE_CHARACTERS: { Name: string; Alias: string; Essence: EssenceCharacterData; Tags: string[] }[] = [
  { Name: GILES_YAVIN_MEGATRON_NAME, Alias: 'Gym', Essence: GILES_YAVIN_MEGATRON, Tags: ['Half-Construct', 'Zodiac of Ambition'] },
  { Name: SYLAS_ENDERS_NAME, Alias: 'Sylas', Essence: SYLAS_ENDERS, Tags: ['Soul', 'Zodiac of Nature'] },
  { Name: GLITZ_NAME, Alias: 'Glitz', Essence: GLITZ, Tags: ['Human', 'Zodiac of Surprise'] },
]
