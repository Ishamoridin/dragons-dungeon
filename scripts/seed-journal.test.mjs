import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEntries, CHARACTER_ALIASES, estimateGenerationCost, parseJournal, parseSessionFile, stableId } from './seed-journal.mjs'

const sample = `# Session 99 — Test

## [S99.1] First scene
- Campaign time: 3500-07-01T19:00
- Present: Vinnie, Sylas, Crash Vandal
- Location: Somewhere

A paragraph.

**Outcomes**
- One thing.

### Table notes
- A note.
- Another.

## [S99.2] Second scene
- Campaign time: 3500-07-01T20:00
- Present: Gym

No notes here.
`

const context = {
  dm: { Id: 'dm-1', Username: 'Lirril' },
  characters: {
    'Giles Yavin Megatron': { Id: 'c-gym', Name: 'Giles Yavin Megatron', Alias: 'Gym', OwnerId: 'u-isham' },
    'Sylas Enders': { Id: 'c-sylas', Name: 'Sylas Enders', OwnerId: 'u-ranger' },
    Glitz: { Id: 'c-glitz', Name: 'Glitz', OwnerId: 'u-kbub' },
  },
  seedStart: new Date('2026-11-03T12:00:00Z'),
}

test('parses scene blocks with metadata, narrative and table notes', () => {
  const scenes = parseSessionFile(sample, '99-test.md')
  assert.equal(scenes.length, 2)
  assert.deepEqual(scenes[0].Present, ['Vinnie', 'Sylas', 'Crash Vandal'])
  assert.equal(scenes[0].Location, 'Somewhere')
  assert.match(scenes[0].Narrative, /^A paragraph\./)
  assert.match(scenes[0].Narrative, /One thing\.$/)
  assert.deepEqual(scenes[0].TableNotes, ['A note.', 'Another.'])
  assert.deepEqual(scenes[1].TableNotes, [])
  assert.equal(scenes[1].Narrative, 'No notes here.')
})

test('builds API-shaped entries with aliases resolved, stable ids and hidden cost', () => {
  const entries = buildEntries(parseSessionFile(sample, '99-test.md'), context)
  const [first, second] = entries
  assert.equal(first.Id, stableId('S99.1'))
  assert.equal(first.Id, buildEntries(parseSessionFile(sample, '99-test.md'), context)[0].Id, 'ids are deterministic')
  assert.deepEqual(first.Targets.map((target) => target.CharacterId), ['c-gym', 'c-sylas'], 'Vinnie files under Gym\'s record; Crash has no record')
  assert.equal(first.Targets[0].CharacterName, 'Vinnie (Hollow)', 'but keeps his own name on the entry')
  assert.equal(second.Targets[0].CharacterName, 'Gym')
  assert.deepEqual(first.AcknowledgedBy, ['dm-1', 'u-isham', 'u-ranger'])
  assert.equal(first.CampaignTime, '3500-07-01T19:00:00.000Z', 'journal times are read as UTC')
  assert.equal(first.CreatedAt, '2026-11-03T12:00:00.000Z')
  assert.equal(second.CreatedAt, '2026-11-03T12:00:01.000Z', 'later scenes get later CreatedAt')
  assert.match(first.Description, /\*Somewhere\*/)
  assert.match(first.Description, /---\n\*\*Table notes\*\*\n- A note\./)
  assert.doesNotMatch(second.Description, /Table notes/)
  assert.equal(first.GenerationCost.Lines.length, first.Description.split('\n').length)
  assert.ok(first.GenerationCost.TotalTokens > 0)
  assert.match(first.GenerationCost.Basis, /not actual billing/)
})

test('cost estimate sums its lines', () => {
  const cost = estimateGenerationCost('abcd\nabcdefgh')
  assert.deepEqual(cost.Lines.map((line) => line.Tokens), [1, 2])
  assert.equal(cost.TotalTokens, 3)
})

test('the real journal parses, validates and keeps story order', () => {
  const scenes = parseJournal()
  assert.ok(scenes.length >= 40, `expected a scene per beat, got ${scenes.length}`)
  assert.equal(new Set(scenes.map((scene) => scene.Id)).size, scenes.length, 'scene ids are unique')
  for (let index = 1; index < scenes.length; index++) {
    assert.ok(new Date(scenes[index].CampaignTime) >= new Date(scenes[index - 1].CampaignTime), `${scenes[index].Id} is out of order`)
  }
  for (const scene of scenes) {
    for (const name of scene.Present) assert.ok(name in CHARACTER_ALIASES || name === 'Crash Vandal', `${scene.Id}: unknown name ${name}`)
  }
  const entries = buildEntries(scenes, context)
  for (const entry of entries) {
    assert.ok(entry.Description.length <= 20_000, `${entry.Journal.Scene} description too long`)
    assert.ok(entry.Targets.length >= 1, `${entry.Journal.Scene} has no targets`)
  }
})
