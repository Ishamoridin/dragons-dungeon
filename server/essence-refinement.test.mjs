import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
const { applyEssenceChange, validateEssenceChange, refinementPlan } = await tsImport('../src/character/essence/EssenceChanges.ts', import.meta.url)
const { treeNode, recipeFor, rateLabel } = await tsImport('../src/character/essence/EssenceTreeData.ts', import.meta.url)
const { collateTempering, classifyTemperingEffect, temperingEffects, isTempering } = await tsImport('../src/character/essence/EssenceTempering.ts', import.meta.url)

const holding = (data, name) => data.Essences.find((item) => item.Name === name)
const stock = (data, amounts) => {
  for (const [name, amount] of Object.entries(amounts)) {
    const held = holding(data, name)
    if (held) held.Amount = amount
    else data.Essences.push({ Name: name, Tier: treeNode(name).tier, Amount: amount, Tempered: false })
  }
}

test('the chart lists the unlisted essences with their ratios', () => {
  assert.deepEqual(treeNode('Dragon').from, ['Magma'])
  assert.equal(rateLabel(treeNode('Dragon')), '500 → 1')
  assert.deepEqual(treeNode('Absolution').from, ['Miracle'])
  assert.equal(rateLabel(treeNode('Absolution')), '50 → 1')
  assert.equal(rateLabel(treeNode('Steel')), '100 + 100 → 1')
  assert.equal(treeNode('Magma').from.length, 0)
})

test('players refine essences by the chart ratio and the change is logged', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  stock(data, { Fire: 350, Earth: 1000, Steel: 2 })
  const plan = refinementPlan(data, 'Steel')
  assert.equal(plan.maxBatches, 3)
  assert.match(validateEssenceChange(data, { kind: 'refine', name: 'Steel', batches: 4 }, 'player'), /needs 400 Fire/)
  applyEssenceChange(data, { kind: 'refine', name: 'Steel', batches: 3, note: 'forging' }, { name: 'Gym', role: 'player' })
  assert.equal(holding(data, 'Fire').Amount, 50)
  assert.equal(holding(data, 'Earth').Amount, 700)
  assert.equal(holding(data, 'Steel').Amount, 5)
  const entries = data.DevelopmentLog.filter((entry) => entry.Kind === 'essence')
  assert.equal(entries.length, 3)
  assert.match(entries.at(-1).Purpose, /Refined 300 Fire \+ 300 Earth into 3 Steel · forging/)
})

test('refining creates the holding when the sheet does not track the result yet', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  data.Essences = data.Essences.filter((item) => item.Name !== 'Dragon')
  stock(data, { Magma: 1200 })
  applyEssenceChange(data, { kind: 'refine', name: 'Dragon', batches: 2 }, { name: 'DM', role: 'dm' })
  assert.equal(holding(data, 'Magma').Amount, 200)
  assert.deepEqual(holding(data, 'Dragon'), { Name: 'Dragon', Tier: 3, Amount: 2, Tempered: false })
})

test('only the DM changes a ratio, and the new ratio drives later refinement', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  assert.match(validateEssenceChange(data, { kind: 'recipe', name: 'Steel', cost: 50, yield: 2 }, 'player'), /Only the DM/)
  assert.match(validateEssenceChange(data, { kind: 'recipe', name: 'Fire', cost: 50, yield: 2 }, 'dm'), /not refined/)
  assert.match(validateEssenceChange(data, { kind: 'recipe', name: 'Steel', cost: 0, yield: 2 }, 'dm'), /above zero/)
  applyEssenceChange(data, { kind: 'recipe', name: 'Steel', cost: 50, yield: 2 }, { name: 'DM', role: 'dm' })
  assert.deepEqual(recipeFor(treeNode('Steel'), data.EssenceRecipes), { Cost: 50, Yield: 2 })
  assert.equal(rateLabel(treeNode('Steel'), recipeFor(treeNode('Steel'), data.EssenceRecipes)), '50 + 50 → 2')
  stock(data, { Fire: 100, Earth: 100, Steel: 0 })
  applyEssenceChange(data, { kind: 'refine', name: 'Steel', batches: 2 }, { name: 'DM', role: 'dm' })
  assert.equal(holding(data, 'Steel').Amount, 4)
  assert.equal(holding(data, 'Fire').Amount, 0)
})

test('plain add and remove changes still work', () => {
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  const name = data.Essences[0].Name
  const before = holding(data, name).Amount
  applyEssenceChange(data, { name, delta: 10 }, { name: 'DM', role: 'dm' })
  assert.equal(holding(data, name).Amount, before + 10)
  assert.match(validateEssenceChange(data, { name, delta: -(before + 11) }), /available/)
})

test('tempering effects are split by paragraph and grouped by how they are used', () => {
  assert.equal(classifyTemperingEffect('This character can use Brawl based actions as a minor action for 50 willpower.'), 'Minor action')
  assert.equal(classifyTemperingEffect('This character recovers willpower during rest, at 50% of the standard rate.'), 'During rest')
  assert.equal(classifyTemperingEffect('This character can spend 250 Willpower to increase the output of any attack by 50%.'), 'Spend to use')
  assert.equal(classifyTemperingEffect('This character gains a permanent +1 armour any time they take more than 100 damage.'), 'On trigger')
  assert.equal(classifyTemperingEffect('This character is immune to Reishi poisoning techniques.'), 'Always on')

  const temperings = GILES_YAVIN_MEGATRON.Techniques.filter(isTempering)
  assert.ok(temperings.length >= 5, 'Gym carries several temperings')
  const effects = temperingEffects(GILES_YAVIN_MEGATRON.Techniques)
  assert.ok(effects.length > temperings.length, 'each tempering yields several effects')
  assert.ok(effects.every((effect) => isTempering({ Name: effect.source })))
  const groups = collateTempering(GILES_YAVIN_MEGATRON.Techniques)
  assert.ok(groups.some((entry) => entry.group === 'Always on'))
  assert.ok(groups.some((entry) => entry.group === 'Spend to use'))
  assert.equal(groups.flatMap((entry) => entry.effects).length, effects.length)
})
