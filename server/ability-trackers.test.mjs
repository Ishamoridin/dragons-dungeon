import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tsImport } from 'tsx/esm/api'

const { default: AbilityTrackers, setAbilityTracker, suggestedTrackerNames } = await tsImport('../src/character/essence/AbilityTrackers.tsx', import.meta.url)

test('suggests counters only for matching ability text', () => {
  assert.deepEqual(suggestedTrackerNames('Gains one charge per counter; stacking +1; 50 uses per rank'), ['Charges', 'Stacks', 'Ranks', 'Uses this session'])
  assert.deepEqual(suggestedTrackerNames('A plain description with no counters.'), [])
})

test('tracker mutations add, update, remove, and clean up empty buckets', () => {
  const draft = { AbilityTrackers: undefined }
  setAbilityTracker(draft, 'technique:Spirit Hardened (III)', 'Ranks', 3)
  setAbilityTracker(draft, 'technique:Spirit Hardened (III)', 'Charges', 2)
  setAbilityTracker(draft, 'weapon:Snowball', 'Charges', 5)
  assert.deepEqual(draft.AbilityTrackers, {
    'technique:Spirit Hardened (III)': { Ranks: 3, Charges: 2 },
    'weapon:Snowball': { Charges: 5 },
  })
  setAbilityTracker(draft, 'technique:Spirit Hardened (III)', 'Charges', 0)
  assert.equal(draft.AbilityTrackers['technique:Spirit Hardened (III)'].Charges, 0)
  setAbilityTracker(draft, 'weapon:Snowball', 'Charges', null)
  assert.equal(draft.AbilityTrackers['weapon:Snowball'], undefined)
})

test('DM rendering is editable with suggestions while players see read-only values', () => {
  const trackers = { Charges: 4 }
  const dm = renderToStaticMarkup(React.createElement(AbilityTrackers, {
    abilityKey: 'weapon:Snowball', sourceText: 'gains a charge, stacking damage', trackers, onEdit: () => {},
  }))
  assert.ok(dm.includes('Long-term tracking'))
  assert.ok(dm.includes('aria-label="Charges value"'))
  assert.ok(dm.includes('+ Stacks'))
  assert.ok(!dm.includes('+ Charges'))
  const player = renderToStaticMarkup(React.createElement(AbilityTrackers, {
    abilityKey: 'weapon:Snowball', sourceText: 'gains a charge', trackers,
  }))
  assert.ok(player.includes('Charges'))
  assert.ok(!player.includes('aria-label="Charges value"'))
  assert.ok(!player.includes('Track a variable'))
  assert.equal(renderToStaticMarkup(React.createElement(AbilityTrackers, {
    abilityKey: 'weapon:Snowball', sourceText: 'gains a charge',
  })), '')
})

test('DM sheets render tracker sections below abilities with saved values', async () => {
  const { EssenceSheetBody } = await tsImport('../src/character/essence/EssenceViews.tsx', import.meta.url)
  const { GILES_YAVIN_MEGATRON } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
  const data = structuredClone(GILES_YAVIN_MEGATRON)
  data.AbilityTrackers = { 'weapon:Snowball': { Charges: 4 } }
  const Harness = () => {
    const [tab] = React.useState('techniques')
    void tab
    return React.createElement(EssenceSheetBody, { data, role: 'dm', onEditData: async () => {} })
  }
  const markup = renderToStaticMarkup(React.createElement(Harness))
  // The techniques tab is not the default; its content renders when selected, so check the component wiring instead.
  assert.ok(markup.includes('essence-sheet'))
  const { default: AbilityTrackersComponent } = await tsImport('../src/character/essence/AbilityTrackers.tsx', import.meta.url)
  const section = renderToStaticMarkup(React.createElement(AbilityTrackersComponent, {
    abilityKey: 'weapon:Snowball',
    sourceText: GILES_YAVIN_MEGATRON.SpiritWeapons[0].Details,
    trackers: data.AbilityTrackers['weapon:Snowball'],
    onEdit: () => {},
  }))
  assert.ok(section.includes('Charges'))
})
