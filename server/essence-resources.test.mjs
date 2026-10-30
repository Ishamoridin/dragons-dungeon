import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { computeEssenceStats, currentEssenceResources } = await tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url)
const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
const { applyEssenceChange, validateEssenceChange } = await tsImport('../src/character/essence/EssenceChanges.ts', import.meta.url)

test('temporary resource maxima override derived pools without changing the base data', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  const original = computeEssenceStats(data)
  data.TemporaryResources = { hp: { Current: 500, Max: 1000 }, reiryoku: { Current: 200, Max: 800 }, willpower: { Current: 100, Max: 400 } }
  const temporary = computeEssenceStats(data)
  assert.equal(temporary.maxHP, 1000)
  assert.equal(temporary.maxReiryoku, 800)
  assert.equal(temporary.maxWillpower, 400)
  assert.equal(temporary.trueHP, original.trueHP)
  assert.deepEqual(data.Attributes, GILES_YAVIN_MEGATRON.Attributes)
  assert.deepEqual(data.SheetBonuses, GILES_YAVIN_MEGATRON.SheetBonuses)
  delete data.TemporaryResources
  assert.deepEqual(computeEssenceStats(data), original)
})

test('temporary maxima allow zero, clamp negatives, and ignore invalid values', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  const original = computeEssenceStats(data)
  data.TemporaryResources = { hp: { Max: 0 }, reiryoku: { Max: -10 }, willpower: { Max: Number.NaN } }
  const stats = computeEssenceStats(data)
  assert.equal(stats.maxHP, 0)
  assert.equal(stats.maxReiryoku, 0)
  assert.equal(stats.maxWillpower, original.maxWillpower)
})

test('temporary current values are clamped to the effective maxima', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  data.TemporaryResources = { hp: { Current: 1500, Max: 1000 }, reiryoku: { Current: -1 }, willpower: { Current: Number.NaN } }
  const stats = computeEssenceStats(data)
  assert.deepEqual(currentEssenceResources(data, stats), { hp: 1000, reiryoku: 0, willpower: stats.maxWillpower })
})

test('essence changes add, remove, and reject amounts greater than holdings', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  const holding = data.Essences[0]
  const before = holding.Amount
  applyEssenceChange(data, { name: holding.Name, delta: 10 }, { name: 'Test DM', role: 'dm' })
  assert.equal(holding.Amount, before + 10)
  applyEssenceChange(data, { name: holding.Name, delta: -10 }, { name: 'Test DM', role: 'dm' })
  assert.equal(holding.Amount, before)
  assert.match(validateEssenceChange(data, { name: holding.Name, delta: -(before + 1) }), /available/)
})