import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { detectWorkbookSystem, importEssenceFromWorkbook, essenceCellUpdates, changelogMarker } = await tsImport('../src/character/essence/EssenceWorkbook.ts', import.meta.url)

// Builds a sparse sheet from A1-style assignments so tests read like the workbook layout.
function sheet(name, cells) {
  const rows = []
  for (const [ref, value] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref)
    let col = 0
    for (const ch of match[1]) col = col * 26 + ch.charCodeAt(0) - 64
    const row = Number(match[2]) - 1
    ;(rows[row] ??= [])[col - 1] = value
  }
  return { name, rows: Array.from(rows, (row) => (row ? Array.from(row, (value) => value ?? null) : [])) }
}

function essenceWorkbook(overrides = {}) {
  const character = {
    F2: 'Essence: The Spirit Journey', C10: 'Player name:', E10: 'Ishamoridin', H10: 'Character Concept:', J10: 'Ox King Goku', M10: 'Character Name:', O10: 'Giles Yavin Megatron',
    E12: 35, J12: 'Spirit Body', O12: 'Half-Construct',
    C22: 'Intelligence', E22: 12, H22: 'Strength', J22: 12, M22: 'Presence', O22: 12,
    C23: 'Wisdom', E23: 12, H23: 'Constitution', J23: 12, M23: 'Manipulation', O23: 0,
    C24: 'Resolve', E24: 12, H24: 'Agility', J24: 12, M24: 'Composure', O24: 6,
    C25: 'Reiryoku Control', E25: 12, H25: 'Reiatsu Release', J25: 12, M25: 'Reishi Manipulation', O25: 15,
    C38: 'Academics (Int/Wis)', E38: 8, H38: 'Riding (Str/Agi)', J38: 0, M38: 'Empathy (Pre/Com)', O38: 0,
    C39: 'Politics (Wis/Res)', E39: 3, H39: 'Exotic (Str/Agi)', J39: 12, M39: 'Expression (Pre/Man)', O39: 12,
    C47: 'Metalworking (Res/Rei)', E47: 0, H47: 'Larceny (Agi/Reia)', J47: 0, M47: 'Politics (Pre/Man)', O47: 4,
    Z35: 181, S57: 20, S58: 5100,
    F57: 2355, J57: 1375, N57: 765, J59: 799, J63: 15,
    E74: 'Snowball - Overrun', E75: 'Major Action', E76: 'Presence of 15+', E77: 100, E78: 50, E79: 75, E80: 100, E81: 75, F71: 100, F72: 100,
    C83: '\nOn Trigger:\nColour fades.\n\nEssence trait:\nYour move.', D91: 'Determination', F91: 50000, I91: 'Ambition', K91: 50000, N91: 'None', P91: 0,
    D126: 'Helmet', F126: 'Rush-Plate Half-Helm', H126: 'Half-Plate', I126: 20, J126: -2, K126: 2, L126: -2, M126: 10, N126: 4, O126: 0,
    D131: 'Left accessory', F131: 'Nothing',
    H146: 0, H147: 0, H148: 0, H149: 2, H150: 0,
    C160: 'Rope', E160: 1, F160: 1, G160: 3,
    K159: 'Brain:', L159: 'Dragon Scoured', N159: '4/Session(s)', O159: '-3 to all mental rolls', K160: 'Skull:', N160: 'None',
    K182: 'Marked', M182: '2/Session(s)', N182: 'Hunted by the Flock',
    ...overrides,
  }
  return {
    title: 'Gym',
    sheets: [
      sheet('Character Sheet', character),
      sheet('Development', { E15: 72, I15: 581, M15: 53, G17: 0, K17: 0, E19: 66, I19: 56, M19: 13, C27: 'Intelligence', E27: 24, G27: 'Strength', I27: 38, K27: 'Presence', M27: 10, C30: 'Reiryoku', E30: 61, G30: 'Reiatsu', I30: 79, K30: 'Reishi', M30: 70, C31: 'Academics (Int/Wis)', E31: 78, G36: 'Brawl (Str/Con)', I36: 117, K40: 'Politics (Pre/Man)', M40: 3, E47: 190, I47: 118, M47: 191, G49: 229, K49: 299 }),
      sheet('Spirit Weapon + Pacts', { C5: "Realm's Resurrection", I5: 'Snowball', I6: 'Spirit Body', I7: '25 Reiryoku', I8: 'Not Applicable', I9: 'Brawl of 15+', I10: 'Active Passive', I11: 'Personal', I12: '1d50+75', B7: 'What does not kill you', B14: 'Pact text', G14: 'Weapon text', O5: 'Tabula Rasa', N7: 'Curse desc', N14: 'Curse text', I25: 'Stick', I26: 'Spirit Blade', I27: '50 Reiryoku', I28: 'Not Applicable', I29: 'Weaponry of 18+', I30: 'Minor', I31: '3 tiles', I32: '1d150+100', G34: 'Stick text' }),
      sheet('Known Techniques', { D6: 'Reishi Beam (Evil)', D7: 30, D8: 200, D9: 'Reiatsu Release (7+)', D10: '18+', D11: 'Major Action', D12: 'Line of Sight', D13: '1d100', B15: 'Beam text', K6: 'Reiryoku Density (3/3)', K7: 0, K8: 0, K9: 'N/A', K10: 'N/A', K11: 'Passive', I15: 'Density text', D25: 'Tempered by the Barrens', D26: 'Not Applicable', D27: 'Not Applicable', B34: 'Barrens text' }),
      sheet('Essences', { F12: 'Zodiac Font (Weasel - Ambition)', C30: 'Tier 1', F30: 'TIer 2', C32: 'Fire (T)', D32: 50000, E33: '100 > 1', F33: 'Steel', G33: 107584, C34: 'Earth (T)', D34: 50000, F46: 'v', G46: '200:1', I31: 'Magma (T)', J31: 5000 }),
      sheet('Other Notes', { E1: 'Zodiac of Ambition - Passive', A2: 'Passive text', Q1: 'Zodiac of Ambition - Active', M2: 'Active text', E8: 'Realm Boons', A9: 'Boon text', Q8: 'Half-Human, Half-Construct', M9: 'Construct text', E15: 'Label goes here', A16: 'Please double click a cell to begin writing in it.' }),
      sheet('KidoHado', { C13: 'Kido #1:', D13: 'Hainawa (Hi-Nah-Wah)', D15: 10, D16: 30, D17: 2, D18: '11+', D19: '6 Tiles', D20: 'None (0)', C22: 'Binds the target.', E27: 0, E28: 5, L13: 'Hado #1:', M13: 'Sokatsui (So-Cat-Soo-E)', M15: 10, M16: 30, M17: 2, M18: '11+', M19: '5 Tiles', M20: 'None (0)', L22: 'Fire ball.', N27: 3, N28: 5, C100: 'Player Kido:', C115: 'Required uses:', D115: 'Required uses:', C117: 'Player Kido:', D117: 'Mirror Step (Mir-or)', D119: 5, D120: 5, D121: 1, D122: '10+', D123: 'Personal', D124: 'None (0)', C126: 'Blink.', E131: 1, E132: 2 }),
      sheet('DM Only', { C4: 'Issued U.S.P:', C5: 181 }),
    ],
  }
}

test('recognises an Essence workbook and a generic character sheet', () => {
  const essence = detectWorkbookSystem(essenceWorkbook())
  assert.equal(essence.ruleset, 'essence')
  assert.equal(essence.title, 'Essence')
  assert.equal(essence.fullTitle, 'Essence: The Spirit Journey')
  assert.equal(essence.characterName, 'Giles Yavin Megatron')
  assert.equal(essence.campaignName, '', 'no Campaign cell means no campaign')
  const generic = detectWorkbookSystem({ sheets: [sheet('Sheet1', { B2: 'Frontier Tales', C5: 'Player name:', D5: 'Sam', C6: 'Character Name:', D6: 'Jessa Crowe', C7: 'Campaign:', D7: 'Dustwater Run' })] })
  assert.equal(generic.ruleset, 'private')
  assert.equal(generic.title, 'Frontier Tales')
  assert.equal(generic.characterName, 'Jessa Crowe')
  assert.equal(generic.campaignName, 'Dustwater Run')
  const below = detectWorkbookSystem({ sheets: [sheet('Notes', { A1: 'Campaign', A2: 'Ashen Vale' }), sheet('Sheet1', { B2: 'Frontier Tales', C5: 'Player name:', D5: 'Sam' })] })
  assert.equal(below.campaignName, 'Ashen Vale', 'the name may also sit directly under the label')
  assert.equal(detectWorkbookSystem({ sheets: [sheet('Budget', { A1: 'Rent', B1: 900 })] }).ruleset, null)
})

test('imports identity, attributes, skills, and tallies from their cells', () => {
  const { essence, name, warnings } = importEssenceFromWorkbook(essenceWorkbook())
  assert.deepEqual(warnings, [])
  assert.equal(name, 'Giles Yavin Megatron')
  assert.equal(essence.PlayerName, 'Ishamoridin')
  assert.equal(essence.Age, 35)
  assert.equal(essence.Race, 'Half-Construct')
  assert.equal(essence.SpiritWeaponCategory, 'Spirit Body')
  assert.equal(essence.Attributes.reishiManipulation, 15)
  assert.equal(essence.Attributes.manipulation, 0)
  assert.equal(essence.Skills.politicsMental, 3)
  assert.equal(essence.Skills.politicsSpiritual, 4)
  assert.equal(essence.Skills.exotic, 12)
  assert.equal(essence.Skills.faith, 0, 'unlisted skills default to zero')
  assert.equal(essence.DMIssuedPoints, 181)
  assert.equal(essence.Mastery, 20)
  assert.equal(essence.PotentialStored, 5100)
  assert.equal(essence.Development.Metaphysical.spiritWeapon, 581)
  assert.equal(essence.Development.AttributeUses.reiryokuControl, 61, 'short attribute names resolve')
  assert.equal(essence.Development.SkillUses.politicsSpiritual, 3)
  assert.equal(essence.Development.Stats.defended, 299)
})

test('imports equipment, injuries, resero, essences, powers, and notes', () => {
  const { essence } = importEssenceFromWorkbook(essenceWorkbook())
  assert.deepEqual(essence.Armour, [{ Slot: 'Helmet', Name: 'Rush-Plate Half-Helm', Type: 'Half-Plate', ArmourValue: 20, DodgeMod: -2, DefenseMod: 2, AthleticsMod: -2, MaxReiMod: 10, Burden: 4, ArmourMod: 0 }])
  assert.equal(essence.Wearables.pouch, 2)
  assert.deepEqual(essence.Inventory, [{ Name: 'Rope', Quantity: 1, Size: 1, Burden: 3 }])
  assert.deepEqual(essence.Injuries, [{ Location: 'Brain', Name: 'Dragon Scoured', Duration: '4/Session(s)', Result: '-3 to all mental rolls' }])
  assert.deepEqual(essence.Statuses, [{ Name: 'Marked', Duration: '2/Session(s)', Rules: 'Hunted by the Flock' }])
  assert.equal(essence.Resero[0].Name, 'Snowball - Overrun')
  assert.equal(essence.Resero[0].CostToTrigger, 100)
  assert.equal(essence.Resero[0].RequiredSkillPoints, 100)
  assert.equal(essence.Resero[0].AlignedEssence, 'Determination')
  assert.equal(essence.Resero[0].EssenceInvested, 50000)
  assert.match(essence.Resero[0].Details, /^On Trigger:\nColour fades\./)
  assert.equal(essence.Resero[2].AlignedEssence, 'None')
  assert.deepEqual(essence.Essences, [
    { Name: 'Fire', Tier: 1, Amount: 50000, Tempered: true }, { Name: 'Earth', Tier: 1, Amount: 50000, Tempered: true },
    { Name: 'Steel', Tier: 2, Amount: 107584, Tempered: false }, { Name: 'Magma', Tier: 3, Amount: 5000, Tempered: true },
  ])
  assert.equal(essence.SpiritWeapons.length, 2)
  assert.equal(essence.SpiritWeapons[0].Pact.Name, "Realm's Resurrection")
  assert.equal(essence.SpiritWeapons[0].Curse.Effect, 'Curse text')
  assert.equal(essence.SpiritWeapons[1].Damage, '1d150+100')
  assert.deepEqual(essence.Techniques.map((technique) => technique.Name), ['Reishi Beam (Evil)', 'Reiryoku Density (3/3)', 'Tempered by the Barrens'])
  assert.equal(essence.Techniques[0].MinReiryoku, 30)
  assert.equal(essence.Techniques[2].MinReiryoku, 'Not Applicable')
  assert.equal(essence.Techniques[1].Range, '')
  assert.deepEqual(essence.Spells.map((spell) => `${spell.Path}${spell.Order}:${spell.Name}`), ['Kido1:Hainawa', 'Hado1:Sokatsui', 'Kido2:Mirror Step'])
  assert.equal(essence.Spells[0].Pronunciation, 'Hi-Nah-Wah')
  assert.equal(essence.Spells[1].Uses, 3)
  assert.equal(essence.Spells[2].RequiredUses, 2)
  assert.deepEqual(essence.Zodiac, { Name: 'Weasel', Essence: 'Ambition', Passive: 'Passive text', Active: 'Active text' })
  assert.deepEqual(essence.Notes, [{ Title: 'Realm Boons', Body: 'Boon text' }, { Title: 'Half-Human, Half-Construct', Body: 'Construct text' }])
})

test('sheet totals beyond the rules engine are stored as sheet bonuses', () => {
  const { essence } = importEssenceFromWorkbook(essenceWorkbook())
  // 2355 on the sheet versus the engine's base for these attributes and race; the gap is the bonus.
  assert.equal(typeof essence.SheetBonuses.hp, 'number')
  assert.ok(essence.SheetBonuses.hp > 0)
  const { essence: again } = importEssenceFromWorkbook(essenceWorkbook({ F57: 2455 }))
  assert.equal(again.SheetBonuses.hp - essence.SheetBonuses.hp, 100)
})

test('write-back emits only the cells that differ from the workbook', () => {
  const workbook = essenceWorkbook()
  const { essence } = importEssenceFromWorkbook(workbook)
  assert.deepEqual(essenceCellUpdates(workbook, essence), [])
  const edited = structuredClone(essence)
  edited.Attributes.strength = 13
  edited.Development.SkillUses.brawl = 118
  edited.Spells[0].Uses = 4
  edited.Spells[2].Name = 'Mirror Dash'
  edited.Injuries[0].Duration = '1/Session(s)'
  edited.Techniques[0].Name = 'Reishi Beam (Evil) II'
  assert.deepEqual(essenceCellUpdates(workbook, edited).sort((a, b) => `${a.sheet}${a.cell}`.localeCompare(`${b.sheet}${b.cell}`)), [
    { sheet: 'Character Sheet', cell: 'J22', value: 13 },
    { sheet: 'Character Sheet', cell: 'N159', value: '1/Session(s)' },
    { sheet: 'Development', cell: 'I36', value: 118 },
    { sheet: 'KidoHado', cell: 'D117', value: 'Mirror Dash (Mir-or)' },
    { sheet: 'KidoHado', cell: 'E27', value: 4 },
    { sheet: 'Known Techniques', cell: 'D6', value: 'Reishi Beam (Evil) II' },
  ])
})

test('changelog marker is the last filled row of a Changelog tab, or null without one', () => {
  assert.equal(changelogMarker(essenceWorkbook()), null)
  const withLog = essenceWorkbook()
  withLog.sheets.push(sheet('Changelog', { A1: 'Date', B1: 'Change', A2: '2026-11-01', B2: 'Raised Occult to 12', A3: '2026-11-02', B3: 'Added Magma essence' }))
  assert.equal(changelogMarker(withLog), '3:2026-11-02 | Added Magma essence')
  withLog.sheets[withLog.sheets.length - 1] = sheet('Change log', { A1: 'Date' })
  assert.equal(changelogMarker(withLog), '1:Date')
})
