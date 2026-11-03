import { createHash, randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { createSheetsClient, editUrl, spreadsheetIdFromUrl } from './google-sheets.mjs'
import { announceChange, saveRevision } from './character-history.mjs'

// Keeps characters that were imported from a Google Sheets workbook in step with it.
//
// Rules (chosen by the DM on 2026-11-02):
//  - The first import is a full sweep of every tab. Later checks (daily, or when someone presses Refresh) read the
//    workbook's Changelog tab when it has one and only re-sweep when its last entry changed; without a Changelog tab
//    the whole mapped character is compared instead.
//  - The sheet wins. When the workbook changed since the last sync, its values replace the app's for every mapped
//    field, even if the app also changed. App-only fields (development log, temporary bars, ...) survive.
//  - When only the app changed and the host can write (service account configured), the changed cells are pushed
//    back to the workbook.
//  - Revisions made on the sheet's behalf are recorded under a dedicated actor so history and undo stay honest.

export const SHEET_ACTOR = Object.freeze({ Id: 'system:google-sheets', Username: 'Google Sheets', Role: 'dm' })
export const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

const fail = (status, message) => Object.assign(new Error(message), { status })
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const withoutMongoId = (document) => { const { _id, ...rest } = document; return rest }
const isDeleted = (record) => typeof record.Name === 'string' && record.Name.endsWith(' (Deleted)')

// The mapping and system definitions live in TypeScript shared with the frontend; load them through tsx on demand so
// plain `node --test` runs (which do not preload tsx) can still import this module.
let modulesPromise = null
function modules() {
  modulesPromise ??= Promise.all([
    tsImport('../src/character/essence/EssenceWorkbook.ts', import.meta.url),
    tsImport('../src/character/StatSystems.ts', import.meta.url),
    tsImport('../src/character/CharacterSheetDatabase.ts', import.meta.url),
    tsImport('../src/character/essence/EssenceSystem.ts', import.meta.url),
  ]).then(([workbook, systems, sheets, essence]) => ({
    detectWorkbookSystem: workbook.detectWorkbookSystem,
    importEssenceFromWorkbook: workbook.importEssenceFromWorkbook,
    essenceCellUpdates: workbook.essenceCellUpdates,
    changelogMarker: workbook.changelogMarker,
    APP_ONLY_ESSENCE_FIELDS: workbook.APP_ONLY_ESSENCE_FIELDS,
    STAT_SYSTEMS: systems.STAT_SYSTEMS,
    placeholderAttributes: sheets.placeholderAttributes,
    placeholderGrowth: sheets.placeholderGrowth,
    spiritWeaponLabel: essence.spiritWeaponLabel,
  }))
  return modulesPromise
}

// The part of an Essence block that the workbook owns; app-only fields are left out so they never trigger a push.
export function mappedEssence(essence, appOnlyFields) {
  const copy = { ...essence }
  for (const field of appOnlyFields) delete copy[field]
  return copy
}

function tagsFor(essence) {
  return [essence.Race, essence.Zodiac?.Name ? `Zodiac of ${essence.Zodiac.Name}` : null].filter(Boolean)
}

export function createSheetSync(db, { sheets = createSheetsClient(), now = () => new Date(), log = console } = {}) {
  const characters = db.collection('characters')
  const systems = db.collection('systems')
  let timer = null
  let running = null

  async function ownedSystems(dm) {
    const { STAT_SYSTEMS } = await modules()
    const stored = await systems.find({ OwnerId: dm.Id }).toArray()
    const storedById = new Map(stored.map((row) => [row.Id, row]))
    // A stored record overrides a built-in with the same Id, as the console's mergeSystems does.
    const builtIns = STAT_SYSTEMS.filter((system) => !system.Hidden && !storedById.has(system.Id)).map((system) => ({ Data: system, builtIn: true }))
    return [...builtIns, ...stored.map((row) => ({ ...row, builtIn: false }))]
  }

  // The campaign is read from the workbook's "Campaign:" cell. A workbook without one still imports when the DM has a
  // single matching system with a single campaign; otherwise the DM is told what to add to the sheet.
  async function matchOrCreateSystem({ dm, detection, campaignName, actor }) {
    const candidates = (await ownedSystems(dm)).filter((entry) => entry.Data.Ruleset === detection.ruleset)
    const titleKey = detection.title.trim().toLowerCase()
    const match = (campaignName ? candidates.find((entry) => entry.Data.CampaignNames.includes(campaignName)) : null)
      ?? candidates.find((entry) => entry.Data.Name.trim().toLowerCase() === titleKey)
      ?? candidates[0]
    if (!campaignName) {
      if (match && match.Data.CampaignNames.length === 1) return { ...match.Data, created: false, campaignName: match.Data.CampaignNames[0] }
      const options = match ? ` Campaigns of the ${match.Data.Name} system: ${match.Data.CampaignNames.join(', ')}.` : ''
      throw fail(400, `The workbook does not say which campaign the character belongs to. Add a cell labelled "Campaign:" with the campaign name in the next cell.${options}`)
    }
    if (match) {
      if (!match.Data.CampaignNames.includes(campaignName)) {
        if (match.builtIn) throw fail(400, `"${campaignName}" is not a campaign of the ${match.Data.Name} system. Pick one of: ${match.Data.CampaignNames.join(', ')}.`)
        const after = { ...withoutMongoId(match), Data: { ...match.Data, CampaignNames: [...match.Data.CampaignNames, campaignName] }, Version: (match.Version ?? 0) + 1, UpdatedAt: now().toISOString() }
        await saveRevision(db, { kind: 'systems', before: match, after, actor })
        return { ...after.Data, created: false, campaignName }
      }
      return { ...match.Data, created: false, campaignName }
    }
    const name = (detection.title.trim() || 'Imported system').slice(0, 80)
    const taken = new Set((await ownedSystems(dm)).map((entry) => entry.Data.Name.trim().toLowerCase()))
    const Name = taken.has(name.toLowerCase()) ? `${name.slice(0, 60)} (imported ${now().toISOString().slice(0, 10)})` : name
    const data = { Id: `system-${randomUUID()}`, Name, description: `Imported from the Google Sheets workbook "${detection.fullTitle?.trim() || detection.title.trim() || 'untitled'}".`.slice(0, 2000), CampaignNames: [campaignName], Ruleset: detection.ruleset }
    const record = { Id: data.Id, OwnerId: dm.Id, Data: data, Version: 1, UpdatedAt: now().toISOString() }
    await saveRevision(db, { kind: 'systems', before: null, after: record, actor })
    return { ...data, created: true, campaignName }
  }

  function sourceFor(spreadsheetId, workbook, title, essenceForPrint, marker, stamp, appOnlyFields) {
    return {
      Provider: 'google-sheets', SpreadsheetId: spreadsheetId, Url: editUrl(spreadsheetId), Title: workbook.title ?? title, SyncedAt: stamp,
      Fingerprint: essenceForPrint ? fingerprint(mappedEssence(essenceForPrint, appOnlyFields)) : '',
      ChangelogMarker: marker,
    }
  }

  // Builds and stores a new character from a workbook link: the full first sweep.
  async function importCharacter({ url, campaignName: requestedCampaign, owner, dm, actor }) {
    const m = await modules()
    const spreadsheetId = spreadsheetIdFromUrl(url)
    const workbook = await sheets.readWorkbook(spreadsheetId)
    const detection = m.detectWorkbookSystem(workbook)
    if (!detection.ruleset) throw fail(400, 'That workbook does not look like a character sheet this app understands. The first tab should hold the system title, attributes, and skills.')
    const { campaignName, ...system } = await matchOrCreateSystem({ dm, detection, campaignName: (requestedCampaign ?? detection.campaignName ?? '').trim().slice(0, 100), actor })
    const warnings = [...detection.warnings]
    const stamp = now().toISOString()
    const marker = m.changelogMarker(workbook)
    if (marker === null) warnings.push('The workbook has no Changelog tab, so daily checks compare the whole sheet. Add a tab named "Changelog" and note each change on a new row to make checks cheaper.')
    let data
    if (detection.ruleset === 'essence') {
      const imported = m.importEssenceFromWorkbook(workbook)
      warnings.push(...imported.warnings)
      data = {
        SystemId: system.Id, Essence: imported.essence, Name: imported.name, Level: 0, XP: 0, CampaignName: campaignName,
        Tags: tagsFor(imported.essence), PlayerClass: { Name: m.spiritWeaponLabel(imported.essence) || 'Spirit Weapon', AttributeGrowth: m.placeholderGrowth() },
        Attributes: m.placeholderAttributes(), Skills: [],
        SheetSource: sourceFor(spreadsheetId, workbook, detection.fullTitle, imported.essence, marker, stamp, m.APP_ONLY_ESSENCE_FIELDS),
      }
    } else {
      warnings.push('Only Essence workbooks import attributes, skills, and powers; a blank character was created for this system.')
      data = {
        SystemId: system.Id, Name: detection.characterName || detection.title || 'Imported character', Level: 1, XP: 0, CampaignName: campaignName, Tags: [],
        PlayerClass: { Name: 'Imported', AttributeGrowth: m.placeholderGrowth() }, Attributes: m.placeholderAttributes(), Skills: [],
        SheetSource: sourceFor(spreadsheetId, workbook, detection.fullTitle, null, marker, stamp, m.APP_ONLY_ESSENCE_FIELDS),
      }
    }
    const record = { ...data, Id: randomUUID(), OwnerId: owner.Id, OwnerName: owner.Username, DMId: dm.Id, DMName: dm.Username, CreatedAt: stamp, UpdatedAt: stamp, Version: 1 }
    await saveRevision(db, { kind: 'characters', before: null, after: record, actor })
    return { record: withoutMongoId(record), system: { Id: system.Id, Name: system.Name, Ruleset: system.Ruleset, created: system.created }, warnings }
  }

  // Marks sync metadata without creating a revision, so players mid-edit do not hit version conflicts.
  async function touch(record, patch) {
    await characters.updateOne({ Id: record.Id, Version: record.Version }, { $set: Object.fromEntries(Object.entries(patch).map(([key, value]) => [`SheetSource.${key}`, value])) })
    const updated = { ...record, SheetSource: { ...record.SheetSource, ...patch } }
    announceChange({ kind: 'characters', before: record, after: updated, actor: SHEET_ACTOR })
    return updated
  }

  // Reconciles one stored character with its workbook. Returns the latest record and what happened.
  async function sync(record, { push = true } = {}) {
    const m = await modules()
    const source = record.SheetSource
    if (!source || source.Provider !== 'google-sheets') throw fail(400, 'This character is not linked to a Google Sheet.')
    const stamp = now().toISOString()
    if (!record.Essence) {
      const next = await touch(record, { SyncedAt: stamp, LastError: null, LastErrorAt: null })
      return { record: withoutMongoId(next), changed: false, pushed: 0, skipped: true, warnings: ['Only Essence characters sync their stats with the workbook.'] }
    }
    const workbook = await sheets.readWorkbook(source.SpreadsheetId)
    const marker = m.changelogMarker(workbook)
    const appMapped = mappedEssence(record.Essence, m.APP_ONLY_ESSENCE_FIELDS)
    const appPrint = fingerprint(appMapped)
    const appChanged = appPrint !== source.Fingerprint
    const warnings = []

    // Cheap path: a Changelog tab whose last entry is unchanged means the sheet has not moved since the last sync.
    if (marker !== null && source.ChangelogMarker !== undefined && marker === source.ChangelogMarker && !appChanged) {
      const next = await touch(record, { SyncedAt: stamp, LastError: null, LastErrorAt: null })
      return { record: withoutMongoId(next), changed: false, pushed: 0, skipped: true, warnings }
    }

    const imported = m.importEssenceFromWorkbook(workbook)
    warnings.push(...imported.warnings)
    const sheetPrint = fingerprint(mappedEssence(imported.essence, m.APP_ONLY_ESSENCE_FIELDS))

    if (sheetPrint !== source.Fingerprint && sheetPrint !== appPrint) {
      // The workbook moved: it wins, keeping only the app-owned fields from the current record.
      const kept = Object.fromEntries(m.APP_ONLY_ESSENCE_FIELDS.filter((field) => record.Essence[field] !== undefined).map((field) => [field, record.Essence[field]]))
      const essence = { ...imported.essence, ...kept }
      const after = {
        ...withoutMongoId(record), Essence: essence, Name: imported.name || record.Name, Tags: tagsFor(essence),
        PlayerClass: { ...record.PlayerClass, Name: essence.SpiritWeaponCategory || record.PlayerClass?.Name },
        SheetSource: { ...source, Title: workbook.title ?? source.Title, SyncedAt: stamp, Fingerprint: sheetPrint, ChangelogMarker: marker, LastError: null, LastErrorAt: null },
        Version: (record.Version ?? 0) + 1, UpdatedAt: new Date(Math.max(now().getTime(), Date.parse(record.UpdatedAt) + 1)).toISOString(),
      }
      await saveRevision(db, { kind: 'characters', before: record, after, actor: SHEET_ACTOR })
      return { record: after, changed: true, pushed: 0, skipped: false, warnings }
    }

    let pushed = 0
    if (appChanged && push) {
      // Only the app moved. Push when the host can write; otherwise leave the fingerprint so the next writable sync pushes.
      if (!sheets.canWrite) {
        warnings.push('The API host has no Google service account, so app changes were not written back to the sheet.')
        const next = await touch(record, { SyncedAt: stamp, ChangelogMarker: marker, LastError: null, LastErrorAt: null })
        return { record: withoutMongoId(next), changed: false, pushed: 0, skipped: false, warnings }
      }
      const updates = m.essenceCellUpdates(workbook, appMapped)
      if (updates.length) {
        await sheets.writeCells(source.SpreadsheetId, updates)
        pushed = updates.length
      }
    }
    const next = await touch(record, { SyncedAt: stamp, ChangelogMarker: marker, Fingerprint: pushed || sheetPrint === appPrint ? appPrint : source.Fingerprint, LastError: null, LastErrorAt: null })
    return { record: withoutMongoId(next), changed: false, pushed, skipped: false, warnings }
  }

  async function syncById(id, options) {
    const record = await characters.findOne({ Id: id })
    if (!record) throw fail(404, 'Character not found.')
    try {
      return await sync(record, options)
    } catch (error) {
      await characters.updateOne({ Id: id }, { $set: { 'SheetSource.LastError': String(error.message ?? error).slice(0, 500), 'SheetSource.LastErrorAt': now().toISOString() } }).catch(() => {})
      throw error
    }
  }

  // Called after the app saves a linked character so its edits reach the sheet promptly. Never throws.
  function afterSave(record) {
    if (!record?.SheetSource || !sheets.canWrite) return
    syncById(record.Id).catch((error) => log.warn?.(`Sheet sync for ${record.Id} failed: ${error.message}`))
  }

  async function syncMany(filter) {
    const linked = await characters.find({ 'SheetSource.Provider': 'google-sheets', ...filter }).toArray()
    const summary = { checked: 0, changed: 0, pushed: 0, skipped: 0, failed: 0, errors: [] }
    for (const record of linked) {
      if (isDeleted(record)) continue
      summary.checked++
      try {
        const result = await syncById(record.Id)
        if (result.changed) summary.changed++
        if (result.skipped) summary.skipped++
        summary.pushed += result.pushed
      } catch (error) {
        summary.failed++
        summary.errors.push(`${record.Name}: ${error.message}`)
        log.warn?.(`Sheet sync for ${record.Name} (${record.Id}) failed: ${error.message}`)
      }
    }
    return summary
  }

  // Everything linked (the daily poll), or just what one user can see (the Refresh button in Settings).
  const pollAll = () => syncMany({})
  const syncAccessible = (user) => syncMany(user.SecondaryOwner ? {} : user.Role === 'dm' ? { DMId: user.Id } : { OwnerId: user.Id })

  function start(intervalMs = DEFAULT_SYNC_INTERVAL_MS) {
    if (timer) return
    const tick = () => { if (!running) running = pollAll().catch(() => {}).finally(() => { running = null }) }
    timer = setInterval(tick, Math.max(60_000, intervalMs))
    timer.unref?.()
    setTimeout(tick, 15_000).unref?.()
  }
  function stop() { if (timer) clearInterval(timer); timer = null }

  return { sheets, importCharacter, sync, syncById, afterSave, pollAll, syncAccessible, start, stop, matchOrCreateSystem }
}
