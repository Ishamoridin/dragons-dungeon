// Turns a chat command such as "/r Brawl Melee Attack" or "/r (1d200+500)*4 Fire Damage" into a plain numeric
// dice formula plus a label. Stat tokens (skills, attributes, combat mods, Resero, resource values) resolve against
// the character's derived stats before anything is sent; the server only ever sees numbers and dice.
import { ESSENCE_ATTRIBUTES, ESSENCE_SKILLS, currentEssenceResources, type EssenceDerived } from '../essence/EssenceSystem'
import type { EssenceCharacterData } from '../essence/EssenceTypes'
import type { RollTokenValue } from '../RollApi'

export type RollTokenGroup = 'Attributes' | 'Skills' | 'Combat mods' | 'Resero' | 'Resources'

export type RollToken = { Name: string; Value: number; Group: RollTokenGroup; Aliases?: string[] }

// Token lookup ignores case, spaces, and hyphens: "Reiryoku Control", "reiryokucontrol" and "Reiryoku-Control" match.
export const tokenKey = (name: string) => name.toLowerCase().replace(/[\s-]+/g, '')

const fmt = (value: number) => (Number.isInteger(value) ? value : Math.round(value * 100) / 100)

export function buildRollTokens(data: EssenceCharacterData, stats: EssenceDerived): RollToken[] {
  const byKey = new Map<string, RollToken>()
  const add = (Name: string, Value: number, Group: RollTokenGroup, Aliases: string[] = []) => {
    const existing = byKey.get(tokenKey(Name))
    // Two skills share the name Politics; the higher one answers the token.
    if (existing && existing.Value >= fmt(Value)) return
    byKey.set(tokenKey(Name), { Name, Value: fmt(Value), Group, ...(Aliases.length ? { Aliases } : {}) })
  }
  for (const attribute of ESSENCE_ATTRIBUTES) add(attribute.Name, stats.attributes[attribute.Id] ?? 0, 'Attributes')
  for (const skill of ESSENCE_SKILLS) add(skill.Name, stats.skills[skill.Id] ?? data.Skills[skill.Id] ?? 0, 'Skills')
  add('BrawlMod', stats.brawl, 'Combat mods', ['brawl modifier'])
  add('WeaponryMod', stats.weaponry, 'Combat mods', ['weaponry modifier'])
  add('RangedMod', stats.ranged, 'Combat mods', ['ranged modifier'])
  add('Dodge', stats.dodge, 'Combat mods')
  add('Defense', stats.defense, 'Combat mods', ['defence'])
  add('Initiative', stats.initiative, 'Combat mods', ['init'])
  add('Armour', stats.armour, 'Combat mods', ['armor'])
  add('ReiatsuMod', stats.reiatsuModifier, 'Combat mods', ['reiatsu modifier'])
  add('ReishiMod', stats.reishiModifier, 'Combat mods', ['reishi modifier'])
  add('Resero', stats.resero.rollBonus, 'Resero', ['resero bonus'])
  const current = currentEssenceResources(data, stats)
  add('HP', current.hp, 'Resources', ['health'])
  add('Reiryoku', current.reiryoku, 'Resources')
  add('Willpower', current.willpower, 'Resources')
  add('MaxHP', stats.maxHP, 'Resources')
  add('MaxReiryoku', stats.maxReiryoku, 'Resources')
  add('MaxWillpower', stats.maxWillpower, 'Resources')
  return [...byKey.values()]
}

export type ParsedRoll = { formula: string; label: string; tokens: RollTokenValue[] }

type Lexeme = { kind: 'value' | 'operator' | 'open' | 'close'; text: string; end: number; token?: RollToken }

// The formula is the longest valid expression at the front of the command; everything after it is the label.
// A stat token may contain spaces, so words are matched greedily (up to three) against the token table.
export function parseRollCommand(input: string, tokens: RollToken[] = []): ParsedRoll | { error: string } {
  const table = new Map<string, RollToken>()
  for (const token of tokens) for (const name of [token.Name, ...(token.Aliases ?? [])]) table.set(tokenKey(name), token)
  const text = input.trim().replace(/^\/(?:r(?:oll)?)\b\s*/i, '')
  if (!text) return { error: 'Type a roll, such as "1d20+5 Attack" or "Brawl Melee Attack".' }

  const lexemes: Lexeme[] = []
  let position = 0
  let depth = 0
  const last = () => lexemes[lexemes.length - 1] ?? null
  const expectsValue = () => { const previous = last(); return !previous || previous.kind === 'operator' || previous.kind === 'open' }

  scan: while (position < text.length) {
    const rest = text.slice(position)
    const space = /^\s+/.exec(rest)
    if (space) { position += space[0].length; continue }
    const char = rest[0]
    if ('+-*/'.includes(char)) {
      // A minus may also open a value (unary); the other operators need a finished value on their left.
      if (char !== '-' && expectsValue()) break
      lexemes.push({ kind: 'operator', text: char, end: position + 1 })
      position += 1
      continue
    }
    if (char === '(') {
      if (!expectsValue()) break
      lexemes.push({ kind: 'open', text: '(', end: position + 1 }); depth += 1; position += 1; continue
    }
    if (char === ')') {
      if (expectsValue() || depth === 0) break
      lexemes.push({ kind: 'close', text: ')', end: position + 1 }); depth -= 1; position += 1; continue
    }
    const dice = /^\d*[dD]\d+(?![\w.])/.exec(rest)
    const number = dice ? null : /^\d+(?:\.\d+)?(?![\w.])/.exec(rest)
    if (dice || number) {
      if (!expectsValue()) break
      const matched = (dice ?? number)![0]
      lexemes.push({ kind: 'value', text: matched.toLowerCase(), end: position + matched.length })
      position += matched.length
      continue
    }
    // Words: the longest leading run (up to three words) that names a stat token becomes its value.
    const words = /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}/.exec(rest)
    if (!words || !expectsValue()) break
    const parts = words[0].split(/\s+/)
    for (let count = parts.length; count >= 1; count -= 1) {
      const token = table.get(tokenKey(parts.slice(0, count).join(' ')))
      if (token) {
        const length = coveredLength(rest, parts.slice(0, count))
        lexemes.push({ kind: 'value', text: String(token.Value), end: position + length, token })
        position += length
        continue scan
      }
    }
    break
  }

  // Trim back to a complete expression: no trailing operator and no unclosed parenthesis.
  while (lexemes.length > 0 && (last()!.kind === 'operator' || last()!.kind === 'open' || depth > 0)) {
    const dropped = lexemes.pop()!
    if (dropped.kind === 'open') depth -= 1
    if (dropped.kind === 'close') depth += 1
  }
  if (lexemes.length === 0) return { error: 'The roll must start with dice, a number, or a stat such as Brawl.' }

  const label = text.slice(last()!.end).replace(/^[\s+\-*/)]+/, '').trim()
  const used = [...new Map(lexemes.filter((lexeme) => lexeme.token).map((lexeme) => [lexeme.token!.Name, { Name: lexeme.token!.Name, Value: lexeme.token!.Value }])).values()]
  let formula = lexemes.map((lexeme) => (lexeme.token && lexeme.token.Value < 0 ? `(${lexeme.text})` : lexeme.text)).join('')
  // A roll with no dice is a stat check: 1d20 plus whatever was written.
  if (!/\d*d\d/.test(formula)) formula = /^\d+(?:\.\d+)?$/.test(formula) ? `1d20+${formula}` : `1d20+(${formula})`
  return { formula, label, tokens: used }
}

// How many characters of `rest` the matched words cover, including the whitespace between them.
function coveredLength(rest: string, words: string[]): number {
  let position = 0
  for (const word of words) position = rest.indexOf(word, position) + word.length
  return position
}

// The single d20 face of a plain check, used to flag natural 20s and 1s; null for anything else.
export const naturalD20 = (rolls: { sides: number; results: number[] }[]): number | null =>
  rolls.length === 1 && rolls[0].sides === 20 && rolls[0].results.length === 1 ? rolls[0].results[0] : null
