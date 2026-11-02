import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { cellToIndex, columnLetters, createSheetsClient, indexToCell, parseWorkbook, serviceAccountFromEnv, spreadsheetIdFromUrl, unzip } from './google-sheets.mjs'

// Tiny zip writer (store or deflate) so the reader can be tested without fixtures on disk.
function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ -1) >>> 0
}
function zip(files, { deflate = false } = {}) {
  const locals = [], centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8')
    const data = deflate ? deflateRawSync(raw) : raw
    const nameBytes = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

const workbookFiles = {
  'xl/workbook.xml': '<workbook><sheets><sheet name="Character Sheet" sheetId="1" r:id="rId1"/><sheet name="Items &amp; Gear" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Player name:</t></si><si><r><t>Isha</t></r><r><t>moridin</t></r></si><si><t>Tom &amp; Jerry</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" s="3"/><c r="C1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c></row><row r="3"><c r="B3"><f>SUM(1,2)</f><v>3</v></c><c r="C3" t="b"><v>1</v></c><c r="AB3" t="inlineStr"><is><t>inline</t></is></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12.5</v></c><c r="C2" t="str"><v>x &lt; y</v></c></row></sheetData></worksheet>',
}

test('spreadsheet ids are read from links or accepted bare', () => {
  const id = '1dYL7y9jH5w-ECIm_k4j0UYaN1ELpbD02mAPVlhgOdik'
  assert.equal(spreadsheetIdFromUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?pli=1&gid=977556575#gid=977556575`), id)
  assert.equal(spreadsheetIdFromUrl(` ${id} `), id)
  assert.throws(() => spreadsheetIdFromUrl('https://example.com/not-a-sheet'), /Google Sheets link/)
  assert.throws(() => spreadsheetIdFromUrl(''), /Google Sheets link/)
})

test('A1 references convert both ways', () => {
  assert.deepEqual(cellToIndex('A1'), { row: 0, col: 0 })
  assert.deepEqual(cellToIndex('AB5'), { row: 4, col: 27 })
  assert.equal(columnLetters(27), 'AB')
  assert.equal(indexToCell(4, 27), 'AB5')
  assert.equal(indexToCell(0, 701), 'ZZ1')
  assert.throws(() => cellToIndex('5A'), /Invalid cell reference/)
})

test('zip entries are read whether stored or deflated', () => {
  for (const deflate of [false, true]) {
    const entries = unzip(zip({ 'a.txt': 'hello', 'dir/b.txt': 'world'.repeat(50) }, { deflate }))
    assert.equal(entries.get('a.txt').toString(), 'hello')
    assert.equal(entries.get('dir/b.txt').toString(), 'world'.repeat(50))
  }
  assert.throws(() => unzip(Buffer.from('<html>not a zip</html>')), /not a spreadsheet file/)
})

test('xlsx cached values become dense rows with shared, rich, inline, boolean, and numeric cells', () => {
  const workbook = parseWorkbook(zip(workbookFiles, { deflate: true }))
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ['Character Sheet', 'Items & Gear'])
  const [first, second] = workbook.sheets
  assert.deepEqual(first.rows[0], [null, null, 'Player name:', null, 'Ishamoridin'])
  assert.deepEqual(first.rows[1], [])
  assert.equal(first.rows[2][1], 3)
  assert.equal(first.rows[2][2], true)
  assert.equal(first.rows[2][27], 'inline')
  assert.deepEqual(second.rows[1], ['Tom & Jerry', 12.5, 'x < y'])
})

test('without a service account the public export is used and sharing errors are explained', async () => {
  const xlsx = zip(workbookFiles)
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.includes('private')) return new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    if (url.includes('missing')) return new Response('', { status: 404 })
    return new Response(xlsx, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } })
  }
  const client = createSheetsClient({ env: {}, fetchImpl })
  assert.equal(client.canWrite, false)
  const workbook = await client.readWorkbook('1dYL7y9jH5w-ECIm_k4j0UYaN1ELpbD02mAPVlhgOdik')
  assert.equal(workbook.sheets[0].rows[0][2], 'Player name:')
  assert.match(calls[0], /export\?format=xlsx$/)
  await assert.rejects(client.readWorkbook('private-sheet-0000000000000'), /not link-readable/)
  await assert.rejects(client.readWorkbook('missing-sheet-0000000000000'), /could not be found/)
  await assert.rejects(client.writeCells('x', [{ sheet: 'S', cell: 'A1', value: 1 }]), /GOOGLE_SERVICE_ACCOUNT_JSON/)
})

test('with a service account the Sheets API reads every tab and writes cells', async () => {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init })
    assert.equal(init.headers.Authorization, 'Bearer test-token')
    if (url.includes('values:batchGet')) return Response.json({ valueRanges: [{ values: [['Player name:', '', 'Ishamoridin'], [], [1, true]] }, { values: [] }] })
    if (url.includes('values:batchUpdate')) return Response.json({ totalUpdatedCells: 2 })
    return Response.json({ properties: { title: 'Gym' }, sheets: [{ properties: { title: "Character Sheet", sheetId: 977556575 } }, { properties: { title: "Bob's Tab", sheetId: 5 } }] })
  }
  const client = createSheetsClient({ env: {}, fetchImpl, tokenProvider: async () => 'test-token' })
  assert.equal(client.canWrite, true)
  const workbook = await client.readWorkbook('abc')
  assert.equal(workbook.title, 'Gym')
  assert.deepEqual(workbook.sheets.map((sheet) => [sheet.name, sheet.gid]), [['Character Sheet', 977556575], ["Bob's Tab", 5]])
  assert.deepEqual(workbook.sheets[0].rows, [['Player name:', null, 'Ishamoridin'], [], [1, true]])
  assert.match(decodeURIComponent(requests[1].url), /ranges='Character Sheet'&ranges='Bob''s Tab'/)
  const result = await client.writeCells('abc', [{ sheet: "Bob's Tab", cell: 'E10', value: 'Gym' }, { sheet: 'Character Sheet', cell: 'E12', value: 36 }])
  assert.equal(result.updated, 2)
  const body = JSON.parse(requests[2].init.body)
  assert.equal(body.valueInputOption, 'USER_ENTERED')
  assert.deepEqual(body.data, [{ range: "'Bob''s Tab'!E10", values: [['Gym']] }, { range: "'Character Sheet'!E12", values: [[36]] }])
})

test('service account env accepts raw or base64 JSON and rejects junk', () => {
  const json = JSON.stringify({ client_email: 'bot@example.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' })
  assert.equal(serviceAccountFromEnv({}), null)
  assert.equal(serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: json }).email, 'bot@example.iam.gserviceaccount.com')
  assert.equal(serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString('base64') }).email, 'bot@example.iam.gserviceaccount.com')
  assert.throws(() => serviceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"nope":1}' }), /service account key file/)
})
