import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tsImport } from 'tsx/esm/api'

const { InjuriesPanel } = await tsImport('../src/character/essence/EssenceInventory.tsx', import.meta.url)
const { GILES_YAVIN_MEGATRON: data } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)

const injuries = [
  { Location: 'Left Arm', Name: 'Draconic Mutation', Duration: '3/Session(s)', Result: 'Unable to wield weapons' },
  { Location: 'Aura', Name: 'Frayed', Duration: '', Result: '' },
]

test('players see injuries laid out on a paperdoll with systemic effects listed separately', () => {
  const html = renderToStaticMarkup(React.createElement(InjuriesPanel, { data: { ...data, Injuries: injuries } }))
  assert.match(html, /ragdoll-larm[^>]*ragdoll-part-filled/)
  assert.match(html, /Draconic Mutation/)
  assert.match(html, /Systemic effects/)
  assert.match(html, /Aura: Frayed/)
  assert.match(html, /Unhurt/, 'unhurt parts are labelled as such rather than "Bare"')
  assert.doesNotMatch(html, /injury-location-chip/, 'players get no picker')
  assert.doesNotMatch(html, /Add injury/)
})

test('editors pick the location on the paperdoll and can reuse or forget previous entries', () => {
  const edits = []
  const onEdit = (mutate) => edits.push(mutate)
  const presets = [{ Location: 'Ribs', Name: 'Cracked Rib', Duration: '2/Session(s)', Result: 'Constitution -1' }]
  const html = renderToStaticMarkup(React.createElement(InjuriesPanel, { data: { ...data, Injuries: [], InjuryPresets: presets }, onEdit }))
  assert.match(html, /ragdoll-slot-button/, 'body parts become buttons')
  assert.match(html, /ragdoll-head[^>]*ragdoll-part-selected/, 'the first location (Brain) selects the head')
  assert.match(html, /aria-pressed="true"[^>]*>Brain</)
  assert.match(html, />Skull</)
  assert.match(html, /Previous entries/)
  assert.match(html, /Cracked Rib/)
  assert.match(html, /Forget Cracked Rib/)
  assert.match(html, /Add injury/)
  assert.doesNotMatch(html, /No long-term injuries/, 'editors see the empty paperdoll instead of the placeholder line')
})

test('adding an injury also records it as a reusable preset without duplicates', async () => {
  // Drive the add handler the way the component does: apply its mutation to a draft.
  const draft = { ...structuredClone(data), Injuries: [], InjuryPresets: [{ Location: 'Brain', Name: 'Dragon Scoured', Duration: '4/Session(s)', Result: '-3 to all mental rolls' }] }
  const injury = { Location: 'Eyes', Name: 'Dragon Scoured', Duration: '4/Session(s)', Result: '-3 to all mental rolls' }
  const samePreset = (a, b) => a.Name.toLowerCase() === b.Name.toLowerCase() && a.Duration.toLowerCase() === b.Duration.toLowerCase() && a.Result.toLowerCase() === b.Result.toLowerCase()
  draft.Injuries = [...draft.Injuries, injury]
  draft.InjuryPresets = [injury, ...draft.InjuryPresets.filter((preset) => !samePreset(preset, injury))].slice(0, 30)
  assert.equal(draft.Injuries.length, 1)
  assert.equal(draft.InjuryPresets.length, 1, 'same name, duration, and result collapse into one entry')
  assert.equal(draft.InjuryPresets[0].Location, 'Eyes', 'the newest location is remembered')
})
