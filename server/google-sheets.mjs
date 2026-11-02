import { inflateRawSync } from 'node:zlib'
import { JWT } from 'google-auth-library'

// Google Sheets access for the character importer and two-way sync.
//
// Two transports share one result shape ({ title, sheets: [{ name, gid, rows }] }):
//  - With a service account configured (GOOGLE_SERVICE_ACCOUNT_JSON) the Sheets API is used for both reading and
//    writing. The sheet must be shared with the service account's email as Editor.
//  - Without one, link-readable sheets are downloaded through the public xlsx export and parsed here, which needs
//    no credentials but cannot write back.

const fail = (status, message) => Object.assign(new Error(message), { status })
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

// Accepts a full Google Sheets URL or a bare spreadsheet id.
export function spreadsheetIdFromUrl(input) {
  const text = String(input ?? '').trim()
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(text)?.[1]
  if (fromUrl) return fromUrl
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return text
  throw fail(400, 'Enter a Google Sheets link such as https://docs.google.com/spreadsheets/d/<id>/edit.')
}

export const exportUrl = (id) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=xlsx`
export const editUrl = (id) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`

// A1 helpers shared with the workbook mapping.
export function columnIndex(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}
export function columnLetters(index) {
  let n = index + 1
  let out = ''
  while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26) }
  return out
}
export function cellToIndex(ref) {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim())
  if (!match) throw new Error(`Invalid cell reference: ${ref}`)
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) }
}
export const indexToCell = (row, col) => `${columnLetters(col)}${row + 1}`

// ---- Minimal zip reader (store + deflate), enough for xlsx packages. ----
export function unzip(buffer) {
  const EOCD = 0x06054b50
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw fail(400, 'The download was not a spreadsheet file.')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw fail(400, 'The spreadsheet file is corrupt.')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(dataStart, dataStart + compressedSize)
    if (method === 0) entries.set(name, data)
    else if (method === 8) entries.set(name, inflateRawSync(data))
    else throw fail(400, `Unsupported compression method ${method} in the spreadsheet file.`)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

// ---- xlsx parsing: cached cell values only (formulas are evaluated by Sheets before export). ----
const unescapeXml = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const textRuns = (xml) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

export function parseWorkbook(buffer) {
  const files = unzip(buffer)
  const read = (name) => {
    const file = files.get(name)
    if (!file) throw fail(400, `The spreadsheet file is missing ${name}.`)
    return file.toString('utf8')
  }
  const shared = []
  const sst = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  for (const item of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(item[1]))
  const relationships = Object.fromEntries([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)].map((rel) => [
    /\sId="([^"]+)"/.exec(rel[0])?.[1], /\sTarget="([^"]+)"/.exec(rel[0])?.[1],
  ]))
  const sheets = [...read('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)].map((tag) => {
    const name = unescapeXml(/\sname="([^"]*)"/.exec(tag[0])?.[1] ?? '')
    const target = relationships[/\sr:id="([^"]+)"/.exec(tag[0])?.[1]] ?? ''
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    return { name, rows: parseSheetXml(read(path), shared) }
  })
  return { title: undefined, sheets }
}

function parseSheetXml(xml, shared) {
  const rows = []
  for (const cell of xml.matchAll(/<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, letters, rowNumber, attributes, inner = ''] = cell
    const type = /\st="([^"]+)"/.exec(attributes)?.[1]
    let value
    if (type === 'inlineStr') value = textRuns(inner)
    else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      if (raw === undefined) continue
      if (type === 's') value = shared[Number(raw)] ?? ''
      else if (type === 'b') value = raw === '1'
      else if (type === 'str' || type === 'e') value = unescapeXml(raw)
      else value = Number(raw)
    }
    if (value === '' || value === undefined) continue
    const row = Number(rowNumber) - 1
    ;(rows[row] ??= [])[columnIndex(letters)] = value
  }
  // Dense arrays (no holes) so consumers can index freely.
  return Array.from(rows, (row) => (row ? Array.from(row, (value) => value ?? null) : []))
}

// ---- Service account ----
export function serviceAccountFromEnv(env = process.env) {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return null
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const account = JSON.parse(json)
    if (!account.client_email || !account.private_key) throw new Error('missing fields')
    return { email: account.client_email, key: account.private_key }
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be the service account key file as JSON (optionally base64 encoded).')
  }
}

function jwtTokenProvider(account) {
  const client = new JWT({ email: account.email, key: account.key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return async () => {
    const { token } = await client.getAccessToken()
    if (!token) throw fail(502, 'Google did not issue an access token for the service account.')
    return token
  }
}

export function createSheetsClient({ env = process.env, fetchImpl = globalThis.fetch, tokenProvider } = {}) {
  const account = serviceAccountFromEnv(env)
  const getToken = tokenProvider ?? (account ? jwtTokenProvider(account) : null)

  const apiCall = async (path, init = {}) => {
    const token = await getToken()
    const response = await fetchImpl(`${SHEETS_API}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
    const body = await response.json().catch(() => ({}))
    if (response.ok) return body
    const reason = body?.error?.message ?? `HTTP ${response.status}`
    if (response.status === 403) throw fail(403, `Google Sheets refused access (${reason}). Share the sheet with ${account?.email ?? 'the service account'} as an Editor.`)
    if (response.status === 404) throw fail(404, 'That spreadsheet could not be found.')
    throw fail(502, `Google Sheets request failed (${reason}).`)
  }

  const readViaApi = async (id) => {
    const meta = await apiCall(`${encodeURIComponent(id)}?fields=properties.title,sheets.properties(title,sheetId)`)
    const tabs = (meta.sheets ?? []).map((sheet) => sheet.properties)
    const ranges = tabs.map((tab) => `ranges=${encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`)}`).join('&')
    const values = await apiCall(`${encodeURIComponent(id)}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`)
    return {
      title: meta.properties?.title,
      sheets: tabs.map((tab, index) => ({ name: tab.title, gid: tab.sheetId, rows: (values.valueRanges?.[index]?.values ?? []).map((row) => row.map((value) => (value === '' ? null : value))) })),
    }
  }

  const readViaExport = async (id) => {
    const response = await fetchImpl(exportUrl(id), { redirect: 'follow' })
    if (response.status === 404) throw fail(404, 'That spreadsheet could not be found.')
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !/spreadsheetml|octet-stream|zip/.test(contentType)) {
      throw fail(403, 'That spreadsheet is not link-readable. Share it as "Anyone with the link can view", or configure a service account and share it with that account.')
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_WORKBOOK_BYTES) throw fail(413, 'That spreadsheet is too large to import.')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_WORKBOOK_BYTES) throw fail(413, 'That spreadsheet is too large to import.')
    return parseWorkbook(buffer)
  }

  return {
    canWrite: Boolean(getToken),
    serviceAccountEmail: account?.email ?? null,
    readWorkbook: (id) => (getToken ? readViaApi(id) : readViaExport(id)),
    // updates: [{ sheet, cell, value }] -> written with USER_ENTERED so numbers stay numbers.
    async writeCells(id, updates) {
      if (!getToken) throw fail(501, 'Writing back to Google Sheets needs GOOGLE_SERVICE_ACCOUNT_JSON configured on the API host.')
      if (!updates.length) return { updated: 0 }
      const data = updates.map(({ sheet, cell, value }) => ({ range: `'${sheet.replace(/'/g, "''")}'!${cell}`, values: [[value ?? '']] }))
      const result = await apiCall(`${encodeURIComponent(id)}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) })
      return { updated: result.totalUpdatedCells ?? updates.length }
    },
  }
}
