import assert from 'node:assert/strict'
import test from 'node:test'
import { tsImport } from 'tsx/esm/api'

const { allTutorialGuides, detectTutorialGuide } = await tsImport('../src/character/TutorialMode.tsx', import.meta.url)

const probe = (selectors, tab = '') => ({ has: (selector) => selectors.includes(selector), selectedTab: () => tab })

test('every guide has a unique id, a title, and at least two steps', () => {
  const guides = allTutorialGuides()
  assert.ok(guides.length >= 18)
  assert.equal(new Set(guides.map((entry) => entry.Id)).size, guides.length)
  for (const entry of guides) {
    assert.ok(entry.Title.length > 0)
    assert.ok(entry.Intro.length > 0)
    assert.ok(entry.Steps.length >= 1)
  }
})

test('detects each screen and selected tab', () => {
  assert.equal(detectTutorialGuide(probe(['.login-shell'])).Id, 'login')
  assert.equal(detectTutorialGuide(probe(['.dm-console-shell'], 'Timeline')).Id, 'dm:timeline')
  assert.equal(detectTutorialGuide(probe(['.dm-console-shell'], 'Unknown tab')).Id, 'dm:overview')
  assert.equal(detectTutorialGuide(probe(['.essence-sheet', '.sheet-shell'], 'Equipment and Inventory')).Id, 'player:equipment')
  assert.equal(detectTutorialGuide(probe(['.sheet-shell'])).Id, 'legacy')
  assert.equal(detectTutorialGuide(probe([])).Id, 'general')
})

test('open dialogs take priority over the underlying screen', () => {
  assert.equal(detectTutorialGuide(probe(['.dm-console-shell', '.technique-modal'], 'Players')).Id, 'dialog:technique')
  assert.equal(detectTutorialGuide(probe(['.essence-sheet', '.essence-combat-head'], 'Basic Info and Injuries')).Id, 'dialog:combat')
  assert.equal(detectTutorialGuide(probe(['.login-shell', '.register-modal'])).Id, 'dialog:register')
  assert.equal(detectTutorialGuide(probe(['.dm-console-shell', '.settings-menu-panel'], 'Players')).Id, 'dialog:settings')
})
