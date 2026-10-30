import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { interpretWoundResult, applyWoundModifiers } = await tsImport('../src/character/essence/WoundEffects.ts', import.meta.url)
const targets = [
  { Id: 'strength', Name: 'Strength', Minimum: 0 },
  { Id: 'dodge', Name: 'Dodge' },
  { Id: 'maxHP', Name: 'Maximum HP', Aliases: ['max health', 'max hp'], Minimum: 0 },
  { Id: 'armour', Name: 'Armour', Aliases: ['armor'], Minimum: 0 },
]

test('interprets signed values, natural reductions, increases, and percentages', () => {
  const parsed = interpretWoundResult('Strength -2; -1 to Dodge; maximum HP reduced by 100; lose 10 armor; increase 5 Strength; max health -25%', targets)
  assert.equal(parsed.Unapplied.length, 0)
  assert.equal(parsed.Modifiers.length, 6)
  assert.equal(applyWoundModifiers(targets[0], 10, parsed.Modifiers), 13)
  assert.equal(applyWoundModifiers(targets[1], 2, parsed.Modifiers), 1)
  assert.equal(applyWoundModifiers(targets[2], 1000, parsed.Modifiers), 675)
  assert.equal(applyWoundModifiers(targets[3], 8, parsed.Modifiers), 0)
})

test('handles decimal values, thousands, multipliers, and independent clauses', () => {
  const parsed = interpretWoundResult('Dodge -2.5 and Strength +1. Maximum HP -1,000; half Armour', targets)
  assert.equal(parsed.Modifiers.length, 4)
  assert.equal(parsed.Unapplied.length, 0)
  assert.equal(applyWoundModifiers(targets[3], 100, parsed.Modifiers), 50)
  assert.equal(applyWoundModifiers(targets[2], 2000, parsed.Modifiers), 1000)
})

test('does not silently apply conditional, ambiguous, or unsupported rules', () => {
  const parsed = interpretWoundResult('If exhausted, Strength -2; cannot walk; lose 50 HP; Dodge -1 per turn', targets)
  assert.equal(parsed.Modifiers.length, 0)
  assert.equal(parsed.Unapplied.length, 4)
  const partial = interpretWoundResult('Dodge -1; cannot walk', targets)
  assert.equal(partial.Modifiers.length, 1)
  assert.deepEqual(partial.Unapplied, ['cannot walk'])
})

test('injuries affect derived stats once, preserve purchased values, and reverse when removed', async () => {
  const { computeEssenceStats } = await tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url)
  const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  const original = computeEssenceStats(data)
  data.Injuries = [{ Location: 'Left Arm', Name: 'Fracture', Duration: 'Until healed', Result: 'Strength -2; Dodge -1; maximum HP -100; weaponry skill -1' }]
  const injured = computeEssenceStats(data)
  assert.equal(injured.attributes.strength, data.Attributes.strength - 2)
  assert.equal(injured.skills.weaponry, data.Skills.weaponry - 1)
  assert.equal(injured.maxHP, original.maxHP - 110)
  assert.equal(injured.dodge, original.dodge - 1.25)
  assert.equal(injured.weaponry, original.weaponry - 1.5)
  assert.deepEqual(injured.points, original.points)
  assert.deepEqual(data.Attributes, GILES_YAVIN_MEGATRON.Attributes)
  assert.deepEqual(computeEssenceStats(data), injured)
  const { EssenceMiniSheet } = await tsImport('../src/character/essence/EssenceViews.tsx', import.meta.url)
  const summary = renderToStaticMarkup(React.createElement(EssenceMiniSheet, { data, name: 'Gym' }))
  assert.ok(summary.includes('/roll 1d20-3.75'))
  assert.ok(summary.includes('Physical 46'))
  data.Injuries = []
  assert.deepEqual(computeEssenceStats(data), original)
})

test('temporary resource overrides remain authoritative and ambiguous politics is not guessed', async () => {
  const { computeEssenceStats, ESSENCE_WOUND_TARGETS } = await tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url)
  const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  data.Injuries = [{ Location: 'Skin', Name: 'Wound', Duration: '', Result: 'maximum HP -100' }]
  data.TemporaryResources = { hp: { Max: 500 } }
  assert.equal(computeEssenceStats(data).maxHP, 500)
  assert.equal(interpretWoundResult('Politics -2', ESSENCE_WOUND_TARGETS).Unapplied.length, 1)
  assert.equal(interpretWoundResult('mental politics skill -2', ESSENCE_WOUND_TARGETS).Modifiers[0].Target, 'skill:politicsMental')
})

test('accepts ordinary verb-first stat reductions and increases', () => {
  const parsed = interpretWoundResult('Reduces your Strength by 2; increase Dodge by 1; lowers maximum HP by 10%', targets)
  assert.equal(parsed.Unapplied.length, 0)
  assert.equal(applyWoundModifiers(targets[0], 10, parsed.Modifiers), 8)
  assert.equal(applyWoundModifiers(targets[1], 2, parsed.Modifiers), 3)
  assert.equal(applyWoundModifiers(targets[2], 1000, parsed.Modifiers), 900)
})

test('oversized wound descriptions are left for review without evaluation', () => {
  const parsed = interpretWoundResult('Strength -2;'.repeat(1000), targets)
  assert.equal(parsed.Modifiers.length, 0)
  assert.equal(parsed.Unapplied.length, 1)
})