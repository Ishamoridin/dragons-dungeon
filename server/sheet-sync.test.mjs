import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { connectDatabase } from './database.mjs'
import { initializeDatabase } from './app.mjs'
import { createSheetSync, SHEET_ACTOR } from './sheet-sync.mjs'

// A compact Essence workbook with the cells the importer reads, built from A1 assignments.
function sheet(name, cells) {
  const rows = []
  for (const [ref, value] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref)
    let col = 0
    for (const ch of match[1]) col = col * 26 + ch.charCodeAt(0) - 64
    ;(rows[Number(match[2]) - 1] ??= [])[col - 1] = value
  }
  return { name, rows: Array.from(rows, (row) => (row ? Array.from(row, (value) => value ?? null) : [])) }
}
function workbook({ occult = 12, changelog = null } = {}) {
  const sheets = [
    sheet('Character Sheet', {
      F2: 'Essence: The Spirit Journey', E10: 'Ishamoridin', J10: 'Ox King Goku', M10: 'Character Name:', O10: 'Giles Yavin Megatron', E12: 35, J12: 'Spirit Body', O12: 'Half-Construct',
      C22: 'Intelligence', E22: 12, H22: 'Strength', J22: 12, M22: 'Presence', O22: 12, C23: 'Wisdom', E23: 12, H23: 'Constitution', J23: 12, M23: 'Manipulation', O23: 0,
      C24: 'Resolve', E24: 12, H24: 'Agility', J24: 12, M24: 'Composure', O24: 6, C25: 'Reiryoku Control', E25: 12, H25: 'Reiatsu Release', J25: 12, M25: 'Reishi Manipulation', O25: 15,
      C40: 'Occult (Wis/Rei)', E40: occult, Z35: 181, S57: 20, S58: 5100, F57: 2355, J57: 1375, N57: 765, J59: 799, J63: 15,
      E74: 'Snowball - Overrun', E77: 100, E78: 50, D91: 'Determination', F91: 50000, N91: 'None',
    }),
    sheet('Essences', { F12: 'Zodiac Font (Weasel - Ambition)', C32: 'Fire (T)', D32: 50000 }),
    sheet('Other Notes', { E1: 'Zodiac of Ambition - Passive', A2: 'Passive text', Q1: 'Zodiac of Ambition - Active', M2: 'Active text' }),
  ]
  if (changelog) sheets.push(sheet('Changelog', Object.fromEntries(changelog.map((line, index) => [`A${index + 1}`, line]))))
  return { title: 'Gym', sheets }
}

// Fake Sheets client: serves whichever workbook the test points it at and records writes.
function fakeSheets(initial, { canWrite = false } = {}) {
  const state = { workbook: initial, writes: [], reads: 0 }
  return {
    state,
    canWrite,
    serviceAccountEmail: canWrite ? 'bot@example.iam.gserviceaccount.com' : null,
    async readWorkbook() { state.reads++; return structuredClone(state.workbook) },
    async writeCells(id, updates) { state.writes.push({ id, updates }); return { updated: updates.length } },
  }
}

const dm = { Id: 'dm:test', Username: 'testdm', UsernameKey: 'testdm', Role: 'dm' }
const player = { Id: 'player:test', Username: 'testplayer', UsernameKey: 'testplayer', Role: 'player', CreatedBy: dm.Id }
const url = 'https://docs.google.com/spreadsheets/d/1dYL7y9jH5w-ECIm_k4j0UYaN1ELpbD02mAPVlhgOdik/edit#gid=977556575'

test('import creates a linked Essence character and later syncs follow the sheet-wins rule', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_sheet_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  try {
    await initializeDatabase(db)
    await db.collection('users').insertMany([{ ...dm }, { ...player }])
    const sheets = fakeSheets(workbook())
    const sync = createSheetSync(db, { sheets })

    // Full first sweep: matches the built-in Essence system by campaign and links the record.
    const imported = await sync.importCharacter({ url, campaignName: 'Welcome to the Sprawl', owner: player, dm, actor: dm })
    assert.equal(imported.system.Id, 'essence')
    assert.equal(imported.system.created, false)
    assert.equal(imported.record.Name, 'Giles Yavin Megatron')
    assert.equal(imported.record.OwnerId, player.Id)
    assert.equal(imported.record.Essence.Skills.occult, 12)
    assert.equal(imported.record.Essence.Zodiac.Name, 'Weasel')
    assert.equal(imported.record.SheetSource.SpreadsheetId, '1dYL7y9jH5w-ECIm_k4j0UYaN1ELpbD02mAPVlhgOdik')
    assert.equal(imported.record.SheetSource.ChangelogMarker, null)
    assert.match(imported.warnings.join(' '), /no Changelog tab/)

    // Unchanged sheet, unchanged app: nothing happens beyond a timestamp.
    const quiet = await sync.syncById(imported.record.Id)
    assert.equal(quiet.changed, false)
    assert.equal(quiet.pushed, 0)

    // The sheet moved: its value wins even though the app also changed the same field, and app-only data survives.
    await db.collection('characters').updateOne({ Id: imported.record.Id }, { $set: { 'Essence.Skills.occult': 9, 'Essence.DevelopmentLog': [{ Id: 'log-1', Target: 'Occult' }] } })
    sheets.state.workbook = workbook({ occult: 14 })
    const pulled = await sync.syncById(imported.record.Id)
    assert.equal(pulled.changed, true)
    assert.equal(pulled.record.Essence.Skills.occult, 14)
    assert.deepEqual(pulled.record.Essence.DevelopmentLog, [{ Id: 'log-1', Target: 'Occult' }])
    const history = await db.collection('changeHistory').find({ TargetId: imported.record.Id }).sort({ CreatedAt: -1 }).toArray()
    assert.equal(history[0].ActorName, SHEET_ACTOR.Username)

    // Only the app moved, but the host cannot write: nothing is pushed and the user is told why.
    await db.collection('characters').updateOne({ Id: imported.record.Id }, { $set: { 'Essence.Skills.occult': 15 } })
    const readOnly = await sync.syncById(imported.record.Id)
    assert.equal(readOnly.pushed, 0)
    assert.match(readOnly.warnings.join(' '), /no Google service account/)
    assert.equal(sheets.state.writes.length, 0)

    // With a writable client the app's change reaches the exact cell.
    const writable = fakeSheets(workbook({ occult: 14 }), { canWrite: true })
    const writingSync = createSheetSync(db, { sheets: writable })
    const pushed = await writingSync.syncById(imported.record.Id)
    assert.equal(pushed.pushed, 1)
    assert.deepEqual(writable.state.writes[0].updates, [{ sheet: 'Character Sheet', cell: 'E40', value: 15 }])

    // A Changelog tab lets the daily check skip the comparison until its last entry changes.
    writable.state.workbook = workbook({ occult: 15, changelog: ['Date | Change', '2026-11-02 | Raised Occult'] })
    const marked = await writingSync.syncById(imported.record.Id)
    assert.equal(marked.record.SheetSource.ChangelogMarker, '2:2026-11-02 | Raised Occult')
    const readsBefore = writable.state.reads
    const skipped = await writingSync.syncById(imported.record.Id)
    assert.equal(skipped.skipped, true)
    assert.equal(writable.state.reads, readsBefore + 1)

    // Refresh from Settings only touches what the caller can see.
    const summary = await writingSync.syncAccessible(player)
    assert.equal(summary.checked, 1)
    assert.equal((await writingSync.syncAccessible({ Id: 'someone-else', Role: 'player' })).checked, 0)
  } finally {
    try { await db.dropDatabase() } finally { await client.close() }
  }
})

test('an unknown ruleset creates a new system named after the workbook', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_sheet_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  try {
    await initializeDatabase(db)
    const sheets = fakeSheets({ title: 'Frontier', sheets: [sheet('Sheet1', { B2: 'Frontier Tales', C5: 'Player name:', D5: 'Sam', C6: 'Character Name:', D6: 'Jessa Crowe' })] })
    const sync = createSheetSync(db, { sheets })
    const imported = await sync.importCharacter({ url, campaignName: 'Dustwater Run', owner: dm, dm, actor: dm })
    assert.equal(imported.system.created, true)
    assert.equal(imported.system.Name, 'Frontier Tales')
    assert.equal(imported.system.Ruleset, 'private')
    assert.equal(imported.record.Name, 'Jessa Crowe')
    assert.equal(imported.record.Essence, undefined)
    const stored = await db.collection('systems').findOne({ Id: imported.system.Id })
    assert.deepEqual(stored.Data.CampaignNames, ['Dustwater Run'])
    assert.match(imported.warnings.join(' '), /blank character/)
  } finally {
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
