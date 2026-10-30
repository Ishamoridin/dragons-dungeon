import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tsImport } from 'tsx/esm/api'

const { InventoryPanel, ArmourPanel } = await tsImport('../src/character/essence/EssenceInventory.tsx', import.meta.url)
const { GILES_YAVIN_MEGATRON: data } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)

test('burden counts carried inventory only, never equipped armour', () => {
  const render = (inventory) => renderToStaticMarkup(React.createElement(InventoryPanel, { data: { ...data, Inventory: inventory }, maxBurden: 48 }))
  assert.match(render([]), /Current burden 0/)
  assert.match(render([{ Name: 'Rope', Quantity: 1, Size: 1, Burden: 3 }]), /Current burden 3/)
})

test('equipment tooltips include complete stats and armour adjustments', () => {
  const html = renderToStaticMarkup(React.createElement(ArmourPanel, { data }))
  for (const text of ['Armour 25 (20 base, +5 modifier)', 'Dodge -2 · Defense +2', 'Athletics -2 · Max Reiryoku +10', 'Burden 4']) assert.ok(html.includes(text))
  const other = { ...data, Armour: [{ ...data.Armour[0], Slot: 'Unknown slot' }] }
  const fallback = renderToStaticMarkup(React.createElement(ArmourPanel, { data: other }))
  assert.ok(fallback.includes('title="Rush-Plate Half-Helm'))
  assert.ok(fallback.includes('Armour 20'))
})