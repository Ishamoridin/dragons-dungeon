// Seeds the campaign event log from the Markdown session journal in docs/journal.
//
//   node scripts/seed-journal.mjs --dry-run   print the entries, write nothing
//   node scripts/seed-journal.mjs             upsert into the configured database
//
// Each `## [Sxx.y] Title` block in a session file becomes one event-log entry shaped exactly like the ones
// POST /api/event-log writes, so the Events page and Timeline render them unchanged. Ids are derived from the
// scene id, so re-running updates text in place rather than duplicating. Entries carry a `GenerationCost`
// field (estimated tokens and credits per line) that no screen renders.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { eventLogInput } from '../server/event-log.mjs'

export const JOURNAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/journal/welcome-to-the-sprawl')
export const CAMPAIGN_NAME = 'Welcome to the Sprawl'

// Which character record each "Present:" name belongs to. Vinnie (who became Hotwire through the story) and Gym
// are different characters by the same player, Ishamoridin; Vinnie has no record of his own, so his scenes are
// filed under Gym's record for ownership while keeping Vinnie's or Hotwire's name on the entry. Crash Vandal has
// no record and is text-only.
export const CHARACTER_ALIASES = {
  Vinnie: 'Giles Yavin Megatron', Hotwire: 'Giles Yavin Megatron', Gym: 'Giles Yavin Megatron',
  Sylas: 'Sylas Enders', Glitz: 'Glitz',
}

// How a name in the journal should read on the entry when it is not the record's own name.
export const DISPLAY_NAMES = { Vinnie: 'Vinnie (Hollow)', Hotwire: 'Hotwire (InduDrake)' }

// Cost estimate basis. The real billing of the generating session is not observable from inside it, so the
// field records the assumption it was computed under: roughly four characters per token, at a nominal output
// rate expressed in credits per million tokens.
export const COST_BASIS = { CharsPerToken: 4, CreditsPerMillionTokens: 15 }

const NAMESPACE = 'dragons-dungeon:journal'

// RFC 4122 version-5 style id from a stable name, so the same scene always maps to the same entry.
export function stableId(name) {
  const hash = createHash('sha1').update(`${NAMESPACE}\n${name}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function estimateGenerationCost(text) {
  const lines = text.split('\n')
  const perLine = lines.map((line, index) => {
    const tokens = Math.ceil(line.length / COST_BASIS.CharsPerToken)
    return { Line: index + 1, Tokens: tokens, Credits: Number((tokens * COST_BASIS.CreditsPerMillionTokens / 1_000_000).toFixed(6)) }
  })
  const totalTokens = perLine.reduce((sum, line) => sum + line.Tokens, 0)
  return {
    Basis: `estimate: ~${COST_BASIS.CharsPerToken} chars/token at ${COST_BASIS.CreditsPerMillionTokens} credits per million output tokens; not actual billing`,
    TotalTokens: totalTokens,
    TotalCredits: Number((totalTokens * COST_BASIS.CreditsPerMillionTokens / 1_000_000).toFixed(6)),
    Lines: perLine,
  }
}

// Parses one session file into scene objects.
export function parseSessionFile(markdown, fileName) {
  const sessionTitle = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? fileName
  const scenes = []
  const blocks = markdown.split(/^## \[/m).slice(1)
  for (const block of blocks) {
    const header = /^(S\d+\.\d+)\]\s+(.+)$/m.exec(block)
    if (!header) throw new Error(`${fileName}: scene header missing an id`)
    const [, id, title] = header
    const meta = (key) => new RegExp(`^- ${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim() ?? ''
    const campaignTime = meta('Campaign time')
    if (!campaignTime) throw new Error(`${fileName} ${id}: missing campaign time`)
    const present = meta('Present').split(',').map((name) => name.trim()).filter(Boolean)
    const location = meta('Location')
    const afterMeta = block.replace(/^.+\n(?:- [^\n]+\n)+/, '')
    const [narrative, notes = ''] = afterMeta.split(/^### Table notes\s*$/m)
    const tableNotes = notes.split('\n').map((line) => line.replace(/^- /, '').trim()).filter(Boolean)
    scenes.push({ Id: id, Title: title.trim(), CampaignTime: campaignTime, Present: present, Location: location, Narrative: narrative.trim(), TableNotes: tableNotes, Session: sessionTitle, File: fileName })
  }
  return scenes
}

export function parseJournal(dir = JOURNAL_DIR) {
  const files = readdirSync(dir).filter((name) => /^\d{2}-.*\.md$/.test(name)).sort()
  return files.flatMap((name) => parseSessionFile(readFileSync(path.join(dir, name), 'utf8'), name))
}

// Journal times carry no zone; they are read as UTC so the in-game clock does not drift with the seeding machine.
export const campaignTimeIso = (text) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`).toISOString()

export function describeScene(scene) {
  const parts = []
  if (scene.Location) parts.push(`*${scene.Location}*`)
  parts.push(scene.Narrative)
  if (scene.TableNotes.length) parts.push(`---\n**Table notes**\n${scene.TableNotes.map((note) => `- ${note}`).join('\n')}`)
  return parts.join('\n\n')
}

// Turns scenes into eventLog documents. `characters` maps record name -> { Id, Name, OwnerId, DMId };
// `dm` is the owning DM user.
export function buildEntries(scenes, { characters, dm, seedStart = new Date() }) {
  return scenes.map((scene, index) => {
    const targets = []
    for (const name of scene.Present) {
      const record = characters[CHARACTER_ALIASES[name]]
      if (!record || targets.some((target) => target.CharacterId === record.Id)) continue
      targets.push({ CharacterId: record.Id, CharacterName: DISPLAY_NAMES[name] ?? record.Alias ?? record.Name, OwnerId: record.OwnerId, Effects: [] })
    }
    const description = describeScene(scene)
    const input = {
      CampaignName: CAMPAIGN_NAME, Title: scene.Title, Description: description, Skin: { skin: 'basalt' }, Source: 'manual',
      CampaignTime: campaignTimeIso(scene.CampaignTime),
      Targets: targets.map(({ CharacterId, Effects }) => ({ CharacterId, Effects })),
    }
    eventLogInput.parse(input) // Same validation the API applies.
    return {
      Id: stableId(scene.Id), DMId: dm.Id, DMName: dm.Username, CampaignName: CAMPAIGN_NAME,
      Title: input.Title, Description: description, Skin: input.Skin, Source: 'manual', CampaignTime: input.CampaignTime,
      CreatedAt: new Date(seedStart.getTime() + index * 1000).toISOString(), CreatedBy: dm.Id,
      Targets: targets,
      AcknowledgedBy: [...new Set([dm.Id, ...targets.map((target) => target.OwnerId)])],
      Journal: { Scene: scene.Id, Session: scene.Session, File: scene.File },
      GenerationCost: estimateGenerationCost(description),
    }
  })
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const scenes = parseJournal()
  if (dryRun) {
    const fake = {
      dm: { Id: 'dm', Username: 'dm' },
      characters: Object.fromEntries([...new Set(Object.values(CHARACTER_ALIASES))].map((name) => [name, { Id: `dry-${name}`, Name: name, OwnerId: `owner-${name}` }])),
    }
    for (const entry of buildEntries(scenes, fake)) {
      console.log(`${entry.Journal.Scene}  ${entry.CampaignTime}  ${entry.Title}  (${entry.Description.length} chars, ~${entry.GenerationCost.TotalTokens} tokens)`)
    }
    console.log(`${scenes.length} entries; nothing written.`)
    return
  }
  await import('dotenv/config')
  const { connectDatabase } = await import('../server/database.mjs')
  const { client, database: db } = await connectDatabase()
  try {
    const rows = await db.collection('characters').find({ CampaignName: CAMPAIGN_NAME, Name: { $not: /\(Deleted\)/ } }, { projection: { Id: 1, Name: 1, OwnerId: 1, DMId: 1, Essence: { Alias: 1 } } }).toArray()
    const characters = Object.fromEntries(rows.map((row) => [row.Name, { Id: row.Id, Name: row.Name, Alias: row.Essence?.Alias, OwnerId: row.OwnerId, DMId: row.DMId }]))
    const missing = [...new Set(Object.values(CHARACTER_ALIASES))].filter((name) => !characters[name])
    if (missing.length) console.warn(`No character record for: ${missing.join(', ')} (they will appear in text only).`)
    const dmId = rows[0]?.DMId
    if (!dmId) throw new Error(`No characters found in campaign "${CAMPAIGN_NAME}"; cannot determine the DM.`)
    const dm = await db.collection('users').findOne({ Id: dmId }, { projection: { Id: 1, Username: 1 } })
    if (!dm) throw new Error(`DM user ${dmId} not found.`)
    const entries = buildEntries(scenes, { characters, dm })
    const eventLog = db.collection('eventLog')
    let inserted = 0, updated = 0
    for (const entry of entries) {
      const { CreatedAt, ...rest } = entry
      const result = await eventLog.updateOne({ Id: entry.Id }, { $set: rest, $setOnInsert: { CreatedAt } }, { upsert: true })
      if (result.upsertedCount) inserted++
      else if (result.modifiedCount) updated++
    }
    console.log(`${entries.length} scenes: ${inserted} inserted, ${updated} updated, ${entries.length - inserted - updated} unchanged.`)
  } finally {
    await client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exit(1) })
}
