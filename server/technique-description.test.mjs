import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { composeTechniqueDescription, techniqueDescriptionParts } = await tsImport('../src/character/essence/TechniqueLibrary.ts', import.meta.url)

test('combines flavour and effects in a stable description order', () => {
  assert.equal(composeTechniqueDescription({ Flavour: ' A quiet storm. ', PassiveEffect: ' +2 defense. ', ActiveEffect: ' Strike twice. ' }), 'A quiet storm.\n\nPassive Effect:\n+2 defense.\n\nActive Effect:\nStrike twice.')
})

test('omits empty sections and headings', () => {
  assert.equal(composeTechniqueDescription({ Flavour: '', PassiveEffect: ' ', ActiveEffect: 'Strike.' }), 'Active Effect:\nStrike.')
  assert.equal(composeTechniqueDescription({ Flavour: '', PassiveEffect: '', ActiveEffect: '' }), '')
})

test('legacy descriptions remain available as flavour without attempting to parse them', () => {
  const parts = techniqueDescriptionParts({ Details: 'Existing paragraphs.\n\nExisting effect.' })
  assert.deepEqual(parts, { Flavour: 'Existing paragraphs.\n\nExisting effect.', PassiveEffect: '', ActiveEffect: '' })
  assert.equal(composeTechniqueDescription(parts), 'Existing paragraphs.\n\nExisting effect.')
})

test('editing structured techniques does not duplicate the combined description', () => {
  const fields = { Flavour: '', PassiveEffect: '+2 defense.', ActiveEffect: 'Strike.' }
  assert.deepEqual(techniqueDescriptionParts({ ...fields, Details: composeTechniqueDescription(fields) }), fields)
})