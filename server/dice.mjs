import { randomInt } from 'node:crypto'
import { z } from 'zod'

// Dice roller: the client turns a chat command such as "/r Brawl Melee Attack" into a plain numeric formula
// ("1d20+7"), the server rolls it with crypto randomness, stores the outcome in the rollLog collection, and
// announces it over the live socket. Nothing here trusts the client beyond the formula text itself.

export const MAX_DICE = 200
export const MAX_SIDES = 10_000

// What the client sends. Tokens are the stat values the client substituted, kept for the breakdown display.
export const rollInput = z.object({
  CampaignName: z.string().trim().min(1).max(100),
  // The command as typed, shown in history so a roll can be repeated.
  Command: z.string().max(400).default(''),
  Formula: z.string().trim().min(1).max(300),
  Label: z.string().trim().max(120).default(''),
  Tokens: z.array(z.object({ Name: z.string().min(1).max(60), Value: z.number().finite() }).strict()).max(24).default([]),
  CharacterId: z.string().min(1).max(100).optional(),
  Secret: z.boolean().default(false),
}).strict()

// --- Formula parsing -------------------------------------------------------------------------------------------
// Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ; unary := '-'? atom ;
// atom := dice | number | '(' expr ')' ; dice := [count] 'd' sides ; number := digits[.digits]

const die = (fail) => (sides, rng) => {
  if (!Number.isInteger(sides) || sides < 2 || sides > MAX_SIDES) throw fail(`Dice need between 2 and ${MAX_SIDES} sides.`)
  return rng(sides)
}

export function rollDice(formula, rng = (sides) => randomInt(1, sides + 1)) {
  const text = String(formula)
  const fail = (message) => Object.assign(new Error(message), { dice: true })
  const roll = die(fail)
  let position = 0
  let diceCount = 0
  const rolls = []
  const skip = () => { while (position < text.length && /\s/.test(text[position])) position += 1 }
  const peek = () => { skip(); return text[position] ?? '' }
  const take = (char) => { if (peek() !== char) throw fail(`Expected "${char}" in the formula.`); position += 1 }

  // Every node evaluates to { total, max }: `max` is the same arithmetic with every die at its highest face,
  // used to scale the result animation.
  const expr = () => {
    let value = term()
    while (true) {
      const operator = peek()
      if (operator !== '+' && operator !== '-') return value
      position += 1
      const right = term()
      value = operator === '+'
        ? { total: value.total + right.total, max: value.max + right.max }
        : { total: value.total - right.total, max: value.max - right.max }
    }
  }
  const term = () => {
    let value = unary()
    while (true) {
      const operator = peek()
      if (operator !== '*' && operator !== '/') return value
      position += 1
      const right = unary()
      if (operator === '/' && right.total === 0) throw fail('The formula divides by zero.')
      value = operator === '*'
        ? { total: value.total * right.total, max: value.max * right.max }
        : { total: value.total / right.total, max: right.max === 0 ? value.max : value.max / right.max }
    }
  }
  const unary = () => {
    if (peek() === '-') { position += 1; const value = atom(); return { total: -value.total, max: -value.max } }
    return atom()
  }
  const atom = () => {
    const char = peek()
    if (char === '(') { position += 1; const value = expr(); take(')'); return value }
    const match = /^(?:(\d*)[dD](\d+)|(\d+(?:\.\d+)?))/.exec(text.slice(position))
    if (!match) throw fail('Unable to read the formula.')
    position += match[0].length
    if (match[3] !== undefined) { const value = Number(match[3]); return { total: value, max: value } }
    const count = Number(match[1] || 1)
    const sides = Number(match[2])
    if (count < 1 || count > MAX_DICE) throw fail(`Roll between 1 and ${MAX_DICE} dice at a time.`)
    diceCount += count
    if (diceCount > MAX_DICE) throw fail(`Roll at most ${MAX_DICE} dice in one formula.`)
    const results = Array.from({ length: count }, () => roll(sides, rng))
    rolls.push({ sides, results })
    return { total: results.reduce((sum, value) => sum + value, 0), max: count * sides }
  }

  const value = expr()
  skip()
  if (position < text.length) throw fail('Unable to read the formula.')
  if (rolls.length === 0) throw fail('The formula contains no dice.')
  if (!Number.isFinite(value.total) || !Number.isFinite(value.max)) throw fail('The formula result is too large.')
  const round = (number) => Math.round(number * 100) / 100
  return { total: round(value.total), maxTotal: round(value.max), rolls }
}

// --- Visibility ------------------------------------------------------------------------------------------------
// The campaign's DM and the roller always see a roll. Other players see it only when it is not secret and both
// they and the roller are in the campaign's sharing pool (the same pool the event log uses).

export function visibleRollFor(user, roll, sharerIds = new Set()) {
  if (!user) return null
  const { _id, ...record } = roll
  if (user.SecondaryOwner) return record
  if (user.Role === 'dm' && roll.DMId === user.Id) return record
  if (roll.RollerId === user.Id) return record
  if (!roll.Secret && sharerIds.has(roll.RollerId) && sharerIds.has(user.Id)) return record
  return null
}

// Who hears the live announcement: always the DM and the roller; a shared roll also reaches the pool.
export function rollRecipients(roll, sharerIds = new Set()) {
  const recipients = new Set([roll.DMId, roll.RollerId])
  if (!roll.Secret && sharerIds.has(roll.RollerId)) for (const id of sharerIds) recipients.add(id)
  return [...recipients]
}

// --- Reactions -------------------------------------------------------------------------------------------------
// A plain single d20 that lands on 20 or 1 invites a reaction from everyone watching: celebrate, envy, or dismiss
// a natural 20 as luck; laugh at, mock, or commiserate with a natural 1. One reaction per user, replaceable.

export const naturalD20 = (rolls) =>
  Array.isArray(rolls) && rolls.length === 1 && rolls[0].sides === 20 && rolls[0].results.length === 1 ? rolls[0].results[0] : null

export const ROLL_REACTIONS = {
  20: ['celebrate', 'envy', 'lucky'],
  1: ['laugh', 'mock', 'commiserate'],
}

export const reactionInput = z.object({
  reaction: z.enum([...ROLL_REACTIONS[20], ...ROLL_REACTIONS[1]]),
}).strict()

// Validates a reaction against the roll and returns the updated reaction list, or a refusal with a status code.
export function applyReaction(roll, user, reaction, now = new Date()) {
  const natural = naturalD20(roll.Rolls)
  if (natural !== 20 && natural !== 1) return { ok: false, status: 400, message: 'Only a natural 20 or natural 1 can be reacted to.' }
  if (!ROLL_REACTIONS[natural].includes(reaction)) return { ok: false, status: 400, message: `That reaction does not fit a natural ${natural}.` }
  if (roll.RollerId === user.Id) return { ok: false, status: 400, message: 'You cannot react to your own roll.' }
  const entry = { UserId: user.Id, Username: user.Username, Reaction: reaction, CreatedAt: now.toISOString() }
  return { ok: true, reactions: [...(roll.Reactions ?? []).filter((item) => item.UserId !== user.Id), entry] }
}
