import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
const { computeEssenceStats, weaponFormBonus, hasWeaponForm } = await tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url)

const weapon = (name) => GILES_YAVIN_MEGATRON.SpiritWeapons.find((item) => item.Name === name)

test('Stick reads as a weapon form: armour, bar maxima and an extra minor action while wielded', () => {
  const form = weaponFormBonus(weapon('Stick'))
  assert.deepEqual(form, { name: 'Stick', armour: 200, hp: 300, reiryoku: 300, extraMinorActions: 1 })
  assert.equal(hasWeaponForm(form), true)
  assert.equal(hasWeaponForm(weaponFormBonus(weapon('Snowball'))), false, 'Snowball grants no standing form bonus')
})

test('summoned weapon forms stack onto the derived stats alongside Resero', () => {
  const base = computeEssenceStats(GILES_YAVIN_MEGATRON)
  const withStick = computeEssenceStats(GILES_YAVIN_MEGATRON, null, ['Stick'])
  assert.equal(withStick.armour, base.armour + 200)
  assert.equal(withStick.maxHP, base.maxHP + 300)
  assert.equal(withStick.maxReiryoku, base.maxReiryoku + 300)
  assert.deepEqual(withStick.weaponForms.map((form) => form.name), ['Stick'])
  const both = computeEssenceStats(GILES_YAVIN_MEGATRON, 'Partial', ['Stick', 'Snowball'])
  const partial = GILES_YAVIN_MEGATRON.Resero.find((stage) => stage.Stage === 'Partial')
  assert.equal(both.armour, base.armour + 200 + partial.BonusArmour)
  assert.equal(both.maxHP, base.maxHP + 300 + partial.BonusHP)
  assert.deepEqual(both.weaponForms.map((form) => form.name), ['Stick'], 'weapons without a form bonus are not listed')
  assert.deepEqual(computeEssenceStats(GILES_YAVIN_MEGATRON, null, ['Nope']).weaponForms, [])
})
