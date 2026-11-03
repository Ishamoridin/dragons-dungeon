// Maps the Essence character workbook (Google Sheets) onto EssenceCharacterData and back.
//
// Cell addresses follow the workbook layout as of November 2026. Every value read here is recorded with the cell it
// came from, so the same table drives write-back: essenceCellUpdates() compares an edited character with what the
// workbook currently says and emits only the cells that differ.
import { ESSENCE_ATTRIBUTES, ESSENCE_SKILLS, ESSENCE_ZODIACS, RACES, computeEssenceStats, type AttributeGroupId } from './EssenceSystem'
import type {
  EssenceArmourPiece, EssenceCharacterData, EssenceHolding, EssenceInjury, EssenceInventoryItem, EssenceRace, EssenceResero,
  EssenceSpell, EssenceSpiritWeapon, EssenceStatus, EssenceTechnique, EssenceNote,
} from './EssenceTypes'

export type CellValue = string | number | boolean | null
export type WorkbookSheet = { name: string; gid?: number; rows: CellValue[][] }
export type Workbook = { title?: string; sheets: WorkbookSheet[] }
export type CellUpdate = { sheet: string; cell: string; value: string | number }

// Fields the app owns; the workbook never sees them and sync leaves them untouched.
export const APP_ONLY_ESSENCE_FIELDS = ['Alias', 'TemporaryResources', 'AbilityTrackers', 'DisabledSpellPaths', 'DevelopmentLog', 'DevelopmentLogSeenAt', 'InjuryPresets', 'EssenceRecipes'] as const

export const TABS = {
  character: 'Character Sheet',
  development: 'Development',
  spiritWeapons: 'Spirit Weapon + Pacts',
  techniques: 'Known Techniques',
  essences: 'Essences',
  notes: 'Other Notes',
  spells: 'KidoHado',
  dmOnly: 'DM Only',
} as const

// ---------- cell helpers ----------

export function columnIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}
export function columnLetters(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26) }
  return out
}
const parseRef = (ref: string) => {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref)
  if (!match) throw new Error(`Invalid cell reference: ${ref}`)
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) }
}
const ref = (col: string, row: number) => `${col}${row}`

const text = (value: CellValue): string => value === null || value === undefined ? '' : typeof value === 'number' ? (Number.isInteger(value) ? String(value) : String(value)) : String(value).trim()
const num = (value: CellValue): number => {
  if (typeof value === 'number') return value
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}
// Fields typed number | string keep prose such as "Not Applicable" but turn numeric text into numbers.
const numOrText = (value: CellValue): number | string => {
  if (typeof value === 'number') return value
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') return ''
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && /^-?\d+(\.\d+)?$/.test(trimmed) ? parsed : trimmed
}
const normalise = (value: string) => value.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '')

class SheetReader {
  readonly bindings: { path: string; sheet: string; cell: string; value: string | number }[] = []
  readonly workbook: Workbook
  readonly warnings: string[]
  constructor(workbook: Workbook, warnings: string[]) {
    this.workbook = workbook
    this.warnings = warnings
  }

  sheet(name: string): WorkbookSheet | null {
    const wanted = name.toLowerCase().replace(/\s+/g, '')
    return this.workbook.sheets.find((sheet) => sheet.name.toLowerCase().replace(/\s+/g, '') === wanted)
      ?? this.workbook.sheets.find((sheet) => sheet.name.toLowerCase().includes(wanted.slice(0, 6))) ?? null
  }
  raw(sheetName: string, cell: string): CellValue {
    const sheet = this.sheet(sheetName)
    if (!sheet) return null
    const { row, col } = parseRef(cell)
    return sheet.rows[row]?.[col] ?? null
  }
  // Reads a cell and remembers where it lives so write-back can target it.
  bind<T extends string | number>(path: string, sheetName: string, cell: string, convert: (value: CellValue) => T): T {
    const value = convert(this.raw(sheetName, cell))
    this.bindings.push({ path, sheet: this.sheet(sheetName)?.name ?? sheetName, cell, value })
    return value
  }
  // Numeric cells with a decimal cached value ("35.0") still bind as numbers.
  text(path: string, sheet: string, cell: string) { return this.bind(path, sheet, cell, text) }
  num(path: string, sheet: string, cell: string) { return this.bind(path, sheet, cell, num) }
  numOrText(path: string, sheet: string, cell: string): number | string {
    const value = numOrText(this.raw(sheet, cell))
    this.bindings.push({ path, sheet: this.sheet(sheet)?.name ?? sheet, cell, value })
    return value
  }
  rowCount(sheetName: string): number { return this.sheet(sheetName)?.rows.length ?? 0 }
}

// ---------- detection ----------

export type WorkbookDetection = { ruleset: 'essence' | 'private' | null; title: string; fullTitle: string; characterName: string; campaignName: string; warnings: string[] }

// The campaign comes from the workbook: a "Campaign:" label on any tab with the name in the next cell to the right
// (or directly below it).
function campaignNameFrom(workbook: Workbook): string {
  for (const sheet of workbook.sheets) {
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? []
      const c = row.findIndex((value) => /^campaign(\s*name)?:?$/i.test(text(value)))
      if (c < 0) continue
      const right = text(row.slice(c + 1).find((value) => text(value)) ?? null)
      const below = text(sheet.rows[r + 1]?.[c] ?? null)
      return right || below
    }
  }
  return ''
}

export function detectWorkbookSystem(workbook: Workbook): WorkbookDetection {
  const warnings: string[] = []
  const campaignName = campaignNameFrom(workbook)
  const first = workbook.sheets.find((sheet) => /character/i.test(sheet.name)) ?? workbook.sheets[0]
  const flat = (sheet?: WorkbookSheet) => (sheet?.rows ?? []).flatMap((row, r) => row.map((value, c) => ({ value: text(value), r, c })).filter((cell) => cell.value))
  const cells = flat(first)
  const titleCell = cells.find((cell) => cell.r < 6 && /^essence\b/i.test(cell.value)) ?? cells.find((cell) => cell.r < 6 && cell.value.length > 8)
  const fullTitle = titleCell?.value ?? workbook.title ?? ''
  const labels = new Set(cells.map((cell) => normalise(cell.value)))
  const hasEssenceAttributes = ['intelligence', 'reiryokucontrol', 'reiatsurelease', 'reishimanipulation'].every((name) => labels.has(name))
  const nameLabel = cells.find((cell) => /^character name:?$/i.test(cell.value))
  const characterName = nameLabel ? text(first?.rows[nameLabel.r]?.slice(nameLabel.c + 1).find((value) => text(value)) ?? null) : ''
  if (hasEssenceAttributes || /^essence\b/i.test(fullTitle)) {
    if (!hasEssenceAttributes) warnings.push('The title says Essence but the attribute table was not found where expected; values may be incomplete.')
    return { ruleset: 'essence', title: 'Essence', fullTitle: fullTitle || 'Essence', characterName, campaignName, warnings }
  }
  if (labels.has('playername') || labels.has('charactername')) {
    return { ruleset: 'private', title: fullTitle || 'Imported system', fullTitle, characterName, campaignName, warnings }
  }
  return { ruleset: null, title: fullTitle, fullTitle, characterName, campaignName, warnings }
}

// ---------- import ----------

const ATTRIBUTE_ALIASES: Record<string, string> = { reiryoku: 'reiryokuControl', reiatsu: 'reiatsuRelease', reishi: 'reishiManipulation', rei: 'reiryokuControl' }
const attributeIdFor = (label: string): string | null => {
  const key = normalise(label)
  return ESSENCE_ATTRIBUTES.find((attribute) => normalise(attribute.Name) === key)?.Id ?? ATTRIBUTE_ALIASES[key] ?? null
}
const skillIdFor = (label: string, group: AttributeGroupId): string | null => {
  const key = normalise(label)
  return ESSENCE_SKILLS.find((skill) => skill.Group === group && normalise(skill.Name) === key)?.Id
    ?? ESSENCE_SKILLS.find((skill) => normalise(skill.Name) === key)?.Id ?? null
}

// Column triplets used by the character and development tabs: [label column, value column, group].
const GROUP_COLUMNS: { label: string; value: string; group: AttributeGroupId }[] = [
  { label: 'C', value: 'E', group: 'mental' }, { label: 'H', value: 'J', group: 'physical' }, { label: 'M', value: 'O', group: 'spiritual' },
]
const DEV_COLUMNS: { label: string; value: string; group: AttributeGroupId }[] = [
  { label: 'C', value: 'E', group: 'mental' }, { label: 'G', value: 'I', group: 'physical' }, { label: 'K', value: 'M', group: 'spiritual' },
]

export type EssenceImport = { essence: EssenceCharacterData; name: string; warnings: string[]; bindings: SheetReader['bindings'] }

export function importEssenceFromWorkbook(workbook: Workbook): EssenceImport {
  const warnings: string[] = []
  const r = new SheetReader(workbook, warnings)
  const CS = TABS.character
  if (!r.sheet(CS)) throw Object.assign(new Error('The workbook has no "Character Sheet" tab.'), { status: 400 })

  // Identity
  const name = r.text('Name', CS, 'O10')
  const raceText = r.text('Race', CS, 'O12')
  const race = (RACES.find((candidate) => candidate.toLowerCase() === raceText.toLowerCase()) ?? 'Human') as EssenceRace
  if (!RACES.includes(race) || race.toLowerCase() !== raceText.toLowerCase()) warnings.push(`Unknown race "${raceText}"; defaulted to Human.`)

  // Attributes (rows 22-25) and skills (rows 38-47), three group columns each
  const Attributes: Record<string, number> = {}
  for (let row = 22; row <= 25; row++) {
    for (const column of GROUP_COLUMNS) {
      const label = text(r.raw(CS, ref(column.label, row)))
      const id = label && attributeIdFor(label)
      if (id) Attributes[id] = r.num(`Attributes.${id}`, CS, ref(column.value, row))
      else if (label) warnings.push(`Unrecognised attribute "${label}" at ${CS}!${column.label}${row}.`)
    }
  }
  const Skills: Record<string, number> = {}
  for (let row = 38; row <= 47; row++) {
    for (const column of GROUP_COLUMNS) {
      const label = text(r.raw(CS, ref(column.label, row)))
      const id = label && skillIdFor(label, column.group)
      if (id) Skills[id] = r.num(`Skills.${id}`, CS, ref(column.value, row))
      else if (label) warnings.push(`Unrecognised skill "${label}" at ${CS}!${column.label}${row}.`)
    }
  }
  for (const attribute of ESSENCE_ATTRIBUTES) Attributes[attribute.Id] ??= 0
  for (const skill of ESSENCE_SKILLS) Skills[skill.Id] ??= 0

  // Armour table rows 126-134 (slot, name, type, value, dodge, defense, athletics, max rei, burden, armour mod)
  const Armour: EssenceArmourPiece[] = []
  for (let row = 126; row <= 134; row++) {
    const pieceName = text(r.raw(CS, ref('F', row)))
    if (!pieceName || /^nothing$/i.test(pieceName)) continue
    const i = Armour.length
    Armour.push({
      Slot: r.text(`Armour.${i}.Slot`, CS, ref('D', row)), Name: r.text(`Armour.${i}.Name`, CS, ref('F', row)), Type: r.text(`Armour.${i}.Type`, CS, ref('H', row)),
      ArmourValue: r.num(`Armour.${i}.ArmourValue`, CS, ref('I', row)), DodgeMod: r.num(`Armour.${i}.DodgeMod`, CS, ref('J', row)), DefenseMod: r.num(`Armour.${i}.DefenseMod`, CS, ref('K', row)),
      AthleticsMod: r.num(`Armour.${i}.AthleticsMod`, CS, ref('L', row)), MaxReiMod: r.num(`Armour.${i}.MaxReiMod`, CS, ref('M', row)), Burden: r.num(`Armour.${i}.Burden`, CS, ref('N', row)), ArmourMod: r.num(`Armour.${i}.ArmourMod`, CS, ref('O', row)),
    })
  }

  // Special wearables rows 146-150: modifier column H
  const Wearables = {
    mask: r.num('Wearables.mask', CS, 'H146'), badge: r.num('Wearables.badge', CS, 'H147'), talisman: r.num('Wearables.talisman', CS, 'H148'),
    pouch: r.num('Wearables.pouch', CS, 'H149'), charm: r.num('Wearables.charm', CS, 'H150'),
  }

  // Inventory rows 160-184 (name, quantity, size, burden)
  const Inventory: EssenceInventoryItem[] = []
  for (let row = 160; row <= 184; row++) {
    if (!text(r.raw(CS, ref('C', row)))) continue
    const i = Inventory.length
    Inventory.push({ Name: r.text(`Inventory.${i}.Name`, CS, ref('C', row)), Quantity: r.num(`Inventory.${i}.Quantity`, CS, ref('E', row)) || 1, Size: r.num(`Inventory.${i}.Size`, CS, ref('F', row)), Burden: r.num(`Inventory.${i}.Burden`, CS, ref('G', row)) })
  }

  // Long-term injuries rows 159-179: location label K, name L, duration N, result O
  const Injuries: EssenceInjury[] = []
  for (let row = 159; row <= 179; row++) {
    const location = text(r.raw(CS, ref('K', row))).replace(/:$/, '')
    const injuryName = text(r.raw(CS, ref('L', row)))
    if (!location || !injuryName) continue
    const i = Injuries.length
    Injuries.push({ Location: location, Name: r.text(`Injuries.${i}.Name`, CS, ref('L', row)), Duration: r.text(`Injuries.${i}.Duration`, CS, ref('N', row)).replace(/^none$/i, ''), Result: r.text(`Injuries.${i}.Result`, CS, ref('O', row)) })
  }
  // Special status rows 182-185: name K, duration M, rules N
  const Statuses: EssenceStatus[] = []
  for (let row = 182; row <= 185; row++) {
    if (!text(r.raw(CS, ref('K', row)))) continue
    const i = Statuses.length
    Statuses.push({ Name: r.text(`Statuses.${i}.Name`, CS, ref('K', row)), Duration: r.text(`Statuses.${i}.Duration`, CS, ref('M', row)).replace(/^none$/i, ''), Rules: r.text(`Statuses.${i}.Rules`, CS, ref('N', row)) })
  }

  // Resero: three stage columns; each stage's write-up is one multi-line cell on row 83 and its aligned essence sits on row 91
  const stages: { stage: EssenceResero['Stage']; label: string; value: string; essenceName: string; essenceInvested: string }[] = [
    { stage: 'Partial', label: 'C', value: 'E', essenceName: 'D', essenceInvested: 'F' },
    { stage: 'First', label: 'H', value: 'J', essenceName: 'I', essenceInvested: 'K' },
    { stage: 'True', label: 'M', value: 'O', essenceName: 'N', essenceInvested: 'P' },
  ]
  const Resero: EssenceResero[] = stages.map((column, index) => {
    const p = `Resero.${index}`
    const aligned = r.text(`${p}.AlignedEssence`, CS, ref(column.essenceName, 91))
    return {
      Stage: column.stage,
      Name: r.text(`${p}.Name`, CS, ref(column.value, 74)), Action: r.text(`${p}.Action`, CS, ref(column.value, 75)), DC: r.text(`${p}.DC`, CS, ref(column.value, 76)),
      CostToTrigger: r.num(`${p}.CostToTrigger`, CS, ref(column.value, 77)), CostToMaintain: r.num(`${p}.CostToMaintain`, CS, ref(column.value, 78)),
      BonusHP: r.num(`${p}.BonusHP`, CS, ref(column.value, 79)), BonusReiryoku: r.num(`${p}.BonusReiryoku`, CS, ref(column.value, 80)), BonusArmour: r.num(`${p}.BonusArmour`, CS, ref(column.value, 81)),
      RequiredSpiritWeaponUses: r.num(`${p}.RequiredSpiritWeaponUses`, CS, ref(column.essenceInvested, 71)), RequiredSkillPoints: r.num(`${p}.RequiredSkillPoints`, CS, ref(column.essenceInvested, 72)),
      AlignedEssence: aligned, EssenceInvested: r.num(`${p}.EssenceInvested`, CS, ref(column.essenceInvested, 91)),
      Details: r.text(`${p}.Details`, CS, ref(column.label, 83)),
    }
  })

  // Scalars
  const DMIssuedPoints = r.num('DMIssuedPoints', CS, 'Z35')
  const Mastery = r.num('Mastery', CS, 'S57')
  const PotentialStored = r.num('PotentialStored', CS, 'S58')

  const Essences = importEssences(r, warnings)
  const SpiritWeapons = importSpiritWeapons(r)
  const Techniques = importTechniques(r)
  const Spells = importSpells(r)
  const { Zodiac, Notes } = importNotes(r, warnings)
  const Development = importDevelopment(r, warnings)

  const essence: EssenceCharacterData = {
    PlayerName: r.text('PlayerName', CS, 'E10'), Concept: r.text('Concept', CS, 'J10'), Age: r.num('Age', CS, 'E12'), Race: race,
    SpiritWeaponCategory: r.text('SpiritWeaponCategory', CS, 'J12'),
    Attributes, Skills, Development, DMIssuedPoints, Zodiac, Armour, Wearables,
    SheetBonuses: { hp: 0, reiryoku: 0, willpower: 0, armour: 0, initiative: 0 },
    Essences, Mastery, PotentialStored, SpiritWeapons, Resero, Techniques, Spells, Notes,
    ...(Injuries.length ? { Injuries } : {}), ...(Statuses.length ? { Statuses } : {}), ...(Inventory.length ? { Inventory } : {}),
  }
  // The workbook's totals carry bonuses the rules engine cannot derive; store the gap so the app shows the same numbers.
  const base = computeEssenceStats(essence)
  essence.SheetBonuses = {
    hp: Math.round(num(r.raw(CS, 'F57')) - base.maxHP),
    reiryoku: Math.round(num(r.raw(CS, 'J57')) - base.maxReiryoku),
    willpower: Math.round(num(r.raw(CS, 'N57')) - base.maxWillpower),
    armour: Math.round(num(r.raw(CS, 'J59')) - base.armour),
    initiative: Math.round(num(r.raw(CS, 'J63')) - base.initiative),
  }
  return { essence, name: name || essence.PlayerName || 'Imported character', warnings, bindings: r.bindings }
}

// The Essence Chart: five tier columns of (name, amount) pairs; "(T)" marks a tempered essence.
function importEssences(r: SheetReader, warnings: string[]): EssenceHolding[] {
  const sheet = r.sheet(TABS.essences)
  if (!sheet) { warnings.push('No "Essences" tab; essence holdings were left empty.'); return [] }
  const tiers: { name: string; amount: string; tier: EssenceHolding['Tier'] }[] = [
    { name: 'C', amount: 'D', tier: 1 }, { name: 'F', amount: 'G', tier: 2 }, { name: 'I', amount: 'J', tier: 3 }, { name: 'L', amount: 'M', tier: 4 }, { name: 'O', amount: 'P', tier: 5 },
  ]
  const holdings: EssenceHolding[] = []
  for (const column of tiers) {
    for (let row = 31; row <= sheet.rows.length; row++) {
      const label = text(sheet.rows[row - 1]?.[columnIndex(column.name)] ?? null)
      if (!label || label.length < 3 || /[>:^]/.test(label) || /^tier/i.test(label) || /^v$/i.test(label)) continue
      const amountCell = sheet.rows[row - 1]?.[columnIndex(column.amount)] ?? null
      if (typeof amountCell !== 'number' && !/^\d/.test(text(amountCell))) continue
      const i = holdings.length
      holdings.push({ Name: label.replace(/\s*\(T\)\s*$/i, '').trim(), Tier: column.tier, Amount: r.num(`Essences.${i}.Amount`, TABS.essences, ref(column.amount, row)), Tempered: /\(T\)/i.test(label) })
    }
  }
  return holdings
}

// Each block holds a pact (B/C), a weapon (G/I) and a curse (N/O) with the same row offsets. Blocks are located by
// their header labels ("Pact name:", "Spirit Weapon Name:", "Curse name:") rather than a fixed stride, so a sheet
// with inserted rows or extra blocks still imports every weapon. A block is kept when any of the three names is
// filled in, so a pact or curse granted before its weapon is not lost. Sheets without labels fall back to the
// template layout of 20-row blocks from row 5.
const SPIRIT_BLOCK_LABELS: { column: string; pattern: RegExp }[] = [
  { column: 'B', pattern: /^pact\s*name:?$/i }, { column: 'G', pattern: /^spirit\s*weapon\s*name:?$/i }, { column: 'N', pattern: /^curse\s*name:?$/i },
]
function spiritBlockRows(r: SheetReader, tab: string): number[] {
  const tops: number[] = []
  for (let row = 1; row <= r.rowCount(tab); row++) {
    if (!SPIRIT_BLOCK_LABELS.some(({ column, pattern }) => pattern.test(text(r.raw(tab, ref(column, row)))))) continue
    if (tops.length && row - tops[tops.length - 1] < 10) continue
    tops.push(row)
  }
  if (tops.length) return tops
  for (let top = 5; top <= r.rowCount(tab); top += 20) tops.push(top)
  return tops
}
function importSpiritWeapons(r: SheetReader): EssenceSpiritWeapon[] {
  const tab = TABS.spiritWeapons
  const weapons: EssenceSpiritWeapon[] = []
  if (!r.sheet(tab)) return weapons
  for (const top of spiritBlockRows(r, tab)) {
    if (!text(r.raw(tab, ref('I', top))) && !text(r.raw(tab, ref('C', top))) && !text(r.raw(tab, ref('O', top)))) continue
    const i = weapons.length
    const p = `SpiritWeapons.${i}`
    weapons.push({
      Name: r.text(`${p}.Name`, tab, ref('I', top)), Category: r.text(`${p}.Category`, tab, ref('I', top + 1)), CostToSummon: r.text(`${p}.CostToSummon`, tab, ref('I', top + 2)),
      CostToMaintain: r.text(`${p}.CostToMaintain`, tab, ref('I', top + 3)), ToHit: r.text(`${p}.ToHit`, tab, ref('I', top + 4)), ActionType: r.text(`${p}.ActionType`, tab, ref('I', top + 5)),
      Range: r.text(`${p}.Range`, tab, ref('I', top + 6)), Damage: r.text(`${p}.Damage`, tab, ref('I', top + 7)), Details: r.text(`${p}.Details`, tab, ref('G', top + 9)),
      Pact: { Name: r.text(`${p}.Pact.Name`, tab, ref('C', top)), Description: r.text(`${p}.Pact.Description`, tab, ref('B', top + 2)), Effect: r.text(`${p}.Pact.Effect`, tab, ref('B', top + 9)) },
      Curse: { Name: r.text(`${p}.Curse.Name`, tab, ref('O', top)), Description: r.text(`${p}.Curse.Description`, tab, ref('N', top + 2)), Effect: r.text(`${p}.Curse.Effect`, tab, ref('N', top + 9)) },
    })
  }
  return weapons
}

// Blocks of 19 rows from row 6, three techniques per block in columns (B,D), (I,K), (P,R).
const TECHNIQUE_COLUMNS = [{ label: 'B', value: 'D' }, { label: 'I', value: 'K' }, { label: 'P', value: 'R' }]
function importTechniques(r: SheetReader): EssenceTechnique[] {
  const tab = TABS.techniques
  const techniques: EssenceTechnique[] = []
  if (!r.sheet(tab)) return techniques
  for (let top = 6; top + 9 <= r.rowCount(tab); top += 19) {
    for (const column of TECHNIQUE_COLUMNS) {
      if (!text(r.raw(tab, ref(column.value, top)))) continue
      const i = techniques.length
      const p = `Techniques.${i}`
      techniques.push({
        Name: r.text(`${p}.Name`, tab, ref(column.value, top)), MinReiryoku: r.numOrText(`${p}.MinReiryoku`, tab, ref(column.value, top + 1)), MaxReiryoku: r.numOrText(`${p}.MaxReiryoku`, tab, ref(column.value, top + 2)),
        MinSkill: r.text(`${p}.MinSkill`, tab, ref(column.value, top + 3)), DC: r.text(`${p}.DC`, tab, ref(column.value, top + 4)), Action: r.text(`${p}.Action`, tab, ref(column.value, top + 5)),
        Range: r.text(`${p}.Range`, tab, ref(column.value, top + 6)), Damage: r.text(`${p}.Damage`, tab, ref(column.value, top + 7)), Details: r.text(`${p}.Details`, tab, ref(column.label, top + 9)),
      })
    }
  }
  return techniques
}

// Each spell block is anchored on its header label ("Kido #1:" or "Player Kido:") in column C, Hado in column L; the
// standard and player-designed blocks are not evenly spaced, so headers are located rather than assumed.
const SPELL_COLUMNS: { path: EssenceSpell['Path']; label: string; value: string; uses: string }[] = [
  { path: 'Kido', label: 'C', value: 'D', uses: 'E' }, { path: 'Hado', label: 'L', value: 'M', uses: 'N' },
]
const SPELL_HEADER = /^(?:kido|hado)\s*#?\s*\d*:?$|^player\s+(?:kido|hado):?$/i
function importSpells(r: SheetReader): EssenceSpell[] {
  const tab = TABS.spells
  const spells: EssenceSpell[] = []
  const sheet = r.sheet(tab)
  if (!sheet) return spells
  const orders: Record<EssenceSpell['Path'], number> = { Kido: 0, Hado: 0 }
  for (let top = 1; top + 15 <= sheet.rows.length; top++) {
    for (const column of SPELL_COLUMNS) {
      if (!SPELL_HEADER.test(text(r.raw(tab, ref(column.label, top))))) continue
      const raw = text(r.raw(tab, ref(column.value, top)))
      if (!raw) continue
      const i = spells.length
      const p = `Spells.${i}`
      const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw)
      orders[column.path] += 1
      r.bindings.push({ path: `${p}.Name`, sheet: r.sheet(tab)?.name ?? tab, cell: ref(column.value, top), value: raw })
      spells.push({
        Path: column.path, Order: orders[column.path], Name: (match?.[1] ?? raw).trim(), Pronunciation: (match?.[2] ?? '').trim(),
        MinReiryoku: r.numOrText(`${p}.MinReiryoku`, tab, ref(column.value, top + 2)), MaxReiryoku: r.numOrText(`${p}.MaxReiryoku`, tab, ref(column.value, top + 3)),
        ReiatsuRequired: r.numOrText(`${p}.ReiatsuRequired`, tab, ref(column.value, top + 4)), ReiatsuDC: r.text(`${p}.ReiatsuDC`, tab, ref(column.value, top + 5)),
        Range: r.text(`${p}.Range`, tab, ref(column.value, top + 6)), Essence: r.text(`${p}.Essence`, tab, ref(column.value, top + 7)), Effect: r.text(`${p}.Effect`, tab, ref(column.label, top + 9)),
        Uses: r.num(`${p}.Uses`, tab, ref(column.uses, top + 14)), RequiredUses: r.num(`${p}.RequiredUses`, tab, ref(column.uses, top + 15)),
      })
    }
  }
  return spells
}

// Other Notes: zodiac passive/active on rows 1-2, then labelled blocks every 7 rows in two columns.
function importNotes(r: SheetReader, warnings: string[]): { Zodiac: EssenceCharacterData['Zodiac']; Notes: EssenceNote[] } {
  const tab = TABS.notes
  const Notes: EssenceNote[] = []
  const zodiacLabel = text(r.raw(tab, 'E1'))
  const essenceName = /zodiac of (\w+)/i.exec(zodiacLabel)?.[1] ?? ''
  const fontLabel = (r.sheet(TABS.essences)?.rows ?? []).flat().map(text).find((value) => /zodiac font/i.test(value)) ?? ''
  const fontMatch = /\((\w+)\s*-\s*(\w+)\)/.exec(fontLabel)
  const known = ESSENCE_ZODIACS.find((zodiac) => zodiac.Essence.toLowerCase() === (fontMatch?.[2] ?? essenceName).toLowerCase())
  const Zodiac = {
    Name: fontMatch?.[1] ?? known?.Name ?? '', Essence: fontMatch?.[2] ?? essenceName ?? known?.Essence ?? '',
    Passive: r.text('Zodiac.Passive', tab, 'A2'), Active: r.text('Zodiac.Active', tab, 'M2'),
  }
  if (!Zodiac.Name) warnings.push('Could not determine the zodiac animal from the Essences tab; set it in the app.')
  if (!r.sheet(tab)) { warnings.push('No "Other Notes" tab; notes were left empty.'); return { Zodiac, Notes } }
  for (let row = 8; row + 1 <= r.rowCount(tab); row += 7) {
    for (const column of [{ label: 'E', body: 'A' }, { label: 'Q', body: 'M' }]) {
      const title = text(r.raw(tab, ref(column.label, row)))
      const body = text(r.raw(tab, ref(column.body, row + 1)))
      if (!title || /^label goes here$/i.test(title) || !body || /^please double click/i.test(body)) continue
      const i = Notes.length
      Notes.push({ Title: r.text(`Notes.${i}.Title`, tab, ref(column.label, row)), Body: r.text(`Notes.${i}.Body`, tab, ref(column.body, row + 1)) })
    }
  }
  return { Zodiac, Notes }
}

const METAPHYSICAL_CELLS: [string, string][] = [
  ['reiatsuManipulation', 'E15'], ['spiritWeapon', 'I15'], ['reishiManipulation', 'M15'], ['kido', 'G17'], ['hado', 'K17'],
  ['essenceHarvesting', 'E19'], ['essenceCasting', 'I19'], ['essenceCultivation', 'M19'],
]
const STAT_CELLS: [string, string][] = [['reducedToZeroHP', 'E47'], ['tookOverTenPercent', 'I47'], ['tookNoDamage', 'M47'], ['dodged', 'G49'], ['defended', 'K49']]

function importDevelopment(r: SheetReader, warnings: string[]): EssenceCharacterData['Development'] {
  const tab = TABS.development
  const Metaphysical: Record<string, number> = {}
  const AttributeUses: Record<string, number> = {}
  const SkillUses: Record<string, number> = {}
  const Stats: Record<string, number> = {}
  if (!r.sheet(tab)) { warnings.push('No "Development" tab; development tallies start at zero.'); return { Metaphysical, AttributeUses, SkillUses, Stats } }
  for (const [key, cell] of METAPHYSICAL_CELLS) Metaphysical[key] = r.num(`Development.Metaphysical.${key}`, tab, cell)
  for (let row = 27; row <= 30; row++) {
    for (const column of DEV_COLUMNS) {
      const label = text(r.raw(tab, ref(column.label, row)))
      const id = label && attributeIdFor(label)
      if (id) AttributeUses[id] = r.num(`Development.AttributeUses.${id}`, tab, ref(column.value, row))
    }
  }
  for (let row = 31; row <= 40; row++) {
    for (const column of DEV_COLUMNS) {
      const label = text(r.raw(tab, ref(column.label, row)))
      const id = label && skillIdFor(label, column.group)
      if (id) SkillUses[id] = r.num(`Development.SkillUses.${id}`, tab, ref(column.value, row))
      else if (label) warnings.push(`Unrecognised development skill "${label}" at ${tab}!${column.label}${row}.`)
    }
  }
  for (const [key, cell] of STAT_CELLS) Stats[key] = r.num(`Development.Stats.${key}`, tab, cell)
  for (const attribute of ESSENCE_ATTRIBUTES) AttributeUses[attribute.Id] ??= 0
  for (const skill of ESSENCE_SKILLS) SkillUses[skill.Id] ??= 0
  return { Metaphysical, AttributeUses, SkillUses, Stats }
}

// ---------- change detection and write-back ----------

// A workbook "Changelog" tab (any tab whose name contains "change" and "log") lets daily checks skip the full
// comparison: its last non-empty row is the marker. Returns null when the workbook has no such tab.
export function changelogMarker(workbook: Workbook): string | null {
  const tab = workbook.sheets.find((sheet) => /change\s*log|changelog|updates/i.test(sheet.name))
  if (!tab) return null
  for (let row = tab.rows.length - 1; row >= 0; row--) {
    const line = (tab.rows[row] ?? []).map(text).filter(Boolean).join(' | ')
    if (line) return `${row + 1}:${line}`
  }
  return ''
}

const getPath = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined), value)

// Cells whose bound value differs from the edited character. Spell names are re-joined with their pronunciation.
export function essenceCellUpdates(workbook: Workbook, essence: EssenceCharacterData): CellUpdate[] {
  const imported = importEssenceFromWorkbook(workbook)
  const updates: CellUpdate[] = []
  for (const binding of imported.bindings) {
    let next = getPath(essence, binding.path)
    if (binding.path.endsWith('.Name') && binding.path.startsWith('Spells.')) {
      const spell = getPath(essence, binding.path.replace(/\.Name$/, '')) as EssenceSpell | undefined
      if (!spell) continue
      next = spell.Pronunciation ? `${spell.Name} (${spell.Pronunciation})` : spell.Name
    }
    if (next === undefined || next === null) continue
    if (typeof next === 'boolean') continue
    const value = typeof next === 'number' ? next : String(next)
    if (String(value) === String(binding.value)) continue
    updates.push({ sheet: binding.sheet, cell: binding.cell, value })
  }
  return updates
}
