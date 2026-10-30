import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { tsImport } from 'tsx/esm/api'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const script = (name) => readFileSync(new URL(`../browser-extension/roll20-bridge/${name}`, import.meta.url), 'utf8')

function background(tabs = []) {
  let handler
  const sent = []
  vm.runInNewContext(script('background.js'), {
    URL,
    chrome: {
      runtime: { onMessage: { addListener: (listener) => { handler = listener } } },
      tabs: {
        query: async () => tabs,
        sendMessage: async (id, message) => { sent.push({ id, ...message }); return { submitted: id !== 3, reason: 'Draft kept.' } },
      },
    },
  })
  return { sent, handler }
}

const sender = { url: 'http://localhost:5173/', frameId: 0, tab: { id: 8 } }
const request = { type: 'dragons-dungeon:roll20', requestId: 'test-request', command: '/roll 1d20-2.5' }

test('routes a d20 roll to each editor tab and counts actual submissions', async () => {
  const bridge = background([{ id: 1 }, { id: 2 }, { id: 3 }])
  const result = await new Promise((resolve) => bridge.handler(request, sender, resolve))
  assert.equal(result.sent, 2)
  assert.deepEqual(bridge.sent.map((entry) => entry.id), [1, 2, 3])
  assert.equal(bridge.sent[0].command, '/roll 1d20-2.5')
  const duplicate = await new Promise((resolve) => bridge.handler(request, sender, resolve))
  assert.equal(duplicate.sent, 0)
  assert.equal(bridge.sent.length, 3)
})

test('rejects other origins, subframes, and arbitrary chat commands', () => {
  const bridge = background([{ id: 1 }])
  let replied = false
  const reply = () => { replied = true }
  bridge.handler(request, { ...sender, url: 'https://untrusted.example/' }, reply)
  bridge.handler(request, { ...sender, frameId: 1 }, reply)
  bridge.handler({ ...request, command: '/w gm arbitrary message' }, sender, reply)
  assert.equal(replied, false)
  assert.equal(bridge.sent.length, 0)
})

test('reports no open Roll20 editor rather than claiming a roll occurred', async () => {
  const bridge = background()
  const result = await new Promise((resolve) => bridge.handler(request, sender, resolve))
  assert.equal(result.sent, 0)
  assert.match(result.reason, /No open Roll20/)
})

function editor(draft = '', ready = true) {
  let handler
  let clicked = false
  class TextArea {
    constructor() { this.content = draft }
    get value() { return this.content }
    set value(next) { this.content = next }
    dispatchEvent() {}
  }
  const input = new TextArea()
  const button = { disabled: false, click: () => { clicked = true } }
  vm.runInNewContext(script('roll20.js'), {
    HTMLTextAreaElement: TextArea,
    Event: class {},
    document: { querySelector: (selector) => ready ? selector.includes('textarea') ? input : button : null },
    chrome: { runtime: { id: 'test-extension', onMessage: { addListener: (listener) => { handler = listener } } } },
  })
  const invoke = () => {
    let response
    handler({ type: 'dragons-dungeon:submit-roll', command: '/roll 1d20+399' }, { id: 'test-extension' }, (value) => { response = value })
    return response
  }
  return { invoke, input, clicked: () => clicked }
}

test('uses Roll20 chat controls for submission without overwriting existing drafts', () => {
  const empty = editor()
  assert.equal(empty.invoke().submitted, true)
  assert.equal(empty.input.value, '/roll 1d20+399')
  assert.equal(empty.clicked(), true)
  const busy = editor('Unfinished message')
  assert.equal(busy.invoke().submitted, false)
  assert.equal(busy.input.value, 'Unfinished message')
  assert.equal(busy.clicked(), false)
  assert.equal(editor('', false).invoke().submitted, false)
})

test('summary uses the requested row order and eight correct d20 commands', async () => {
  const { EssenceMiniSheet } = await tsImport('../src/character/essence/EssenceViews.tsx', import.meta.url)
  const { GILES_YAVIN_MEGATRON: data } = await tsImport('../src/character/essence/EssenceCharacters.ts', import.meta.url)
  const { d20Roll, toChatCommand } = await tsImport('../src/character/essence/Roll20.ts', import.meta.url)
  const markup = renderToStaticMarkup(React.createElement(EssenceMiniSheet, { data, name: 'Gym' }))
  const combat = markup.slice(markup.indexOf('aria-label="Combat statistics"'))
  const labels = ['Defense', 'Dodge', 'Armour', 'Ranged', 'Weaponry', 'Brawl', 'Initiative', 'Reiatsu-Mod', 'Reishi-Mod']
  const positions = labels.map((label) => combat.indexOf(`<span>${label}</span>`))
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])))
  assert.equal((combat.match(/class="roll-button essence-combat-roll"/g) ?? []).length, 8)
  assert.doesNotMatch(combat, /aria-label="Roll Gym Initiative"/)
  assert.ok(combat.includes('/roll 1d20+399'))
  assert.ok(combat.includes('/roll 1d20-2.5'))
  assert.ok(combat.includes('/roll 1d20+19.5'))
  const updated = structuredClone(data)
  updated.SheetBonuses.armour += 1
  assert.ok(renderToStaticMarkup(React.createElement(EssenceMiniSheet, { data: updated, name: 'Gym' })).includes('/roll 1d20+400'))
  assert.equal(toChatCommand(d20Roll('Gym', 'Zero', 0)), '/roll 1d20+0')
})