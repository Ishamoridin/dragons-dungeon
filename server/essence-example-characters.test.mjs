import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { EXAMPLE_ESSENCE_CHARACTERS, SYLAS_ENDERS, GLITZ } = await tsImport('../src/character/essence/EssenceExampleCharacters.ts', import.meta.url)
const { spiritWeaponLabel, spiritWeaponTitle, computeEssenceStats } = await tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url)
const { seedCharacterRecords } = await tsImport('../src/character/CharacterSheetDatabase.ts', import.meta.url)

test('every example character carries more than one spirit weapon block and the stats engine accepts them', () => {
  for (const example of EXAMPLE_ESSENCE_CHARACTERS) {
    assert.ok(example.Essence.SpiritWeapons.length >= 2, `${example.Name} should show the multi-weapon case`)
    const stats = computeEssenceStats(example.Essence)
    assert.ok(stats.maxHP > 0, `${example.Name} computes stats`)
  }
})

test('the spirit weapon label names every weapon with its category, including pact-only blocks', () => {
  assert.equal(spiritWeaponLabel(EXAMPLE_ESSENCE_CHARACTERS[0].Essence), 'Snowball (Spirit Body) · Stick (Spirit Blade)')
  assert.equal(spiritWeaponLabel(SYLAS_ENDERS), 'The Dance (Spirit Body) · Verdant Step (Spirit Aura) · Pact: Steel Sight')
  assert.equal(spiritWeaponLabel(GLITZ), 'Headbang (Spirit Aura) · Arms Crossed (Spirit Aura) · Guitar Solo (Reiatsu Casting)')
  assert.equal(spiritWeaponLabel({ ...GLITZ, SpiritWeapons: [] }), 'Spirit Aura', 'falls back to the Character Sheet category')
  const curseOnly = SYLAS_ENDERS.SpiritWeapons[2]
  assert.equal(spiritWeaponTitle({ ...curseOnly, Pact: { Name: '', Description: '', Effect: '' } }), 'Curse: Rescinded by Water')
})

test('the demo database seeds all three party members with the weapon label as their class', () => {
  const essence = seedCharacterRecords().filter((record) => record.Essence)
  assert.deepEqual(essence.map((record) => [record.Name, record.Essence.Alias]), [['Giles Yavin Megatron', 'Gym'], ['Sylas Enders', 'Sylas'], ['Glitz', 'Glitz']])
  assert.equal(essence[0].Id, 'demo-character-5', 'Gym keeps the id existing databases were seeded with')
  assert.equal(essence[2].PlayerClass.Name, spiritWeaponLabel(GLITZ))
  assert.ok(new Set(essence.map((record) => record.Id)).size === 3)
})
