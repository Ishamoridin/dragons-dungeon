import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'

test('secondary owners span all records and reserved system ownership applies on registration', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_own_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    const PasswordHash = await hashPassword('test-password-1234')
    await db.collection('users').insertMany([
      { Id: 'dm-a', Username: 'primarydm', UsernameKey: 'primarydm', Role: 'dm', PasswordHash },
      { Id: 'owner-2', Username: 'secondary', UsernameKey: 'secondary', Role: 'dm', SecondaryOwner: true, PasswordHash },
    ])
    const now = new Date().toISOString()
    await db.collection('characters').insertOne({ Id: 'hero-a', Name: 'Hero A', OwnerId: 'dm-a', DMId: 'dm-a', CampaignName: 'Camp A', Version: 1, CreatedAt: now, UpdatedAt: now })
    await db.collection('campaigns').insertOne({ Id: 'camp-a', OwnerId: 'dm-a', Data: { Name: 'Camp A' }, Version: 1, UpdatedAt: now })
    await db.collection('pendingOwnerships').insertOne({ UsernameKey: 'lirril', Kind: 'system', TargetId: 'essence', Applied: false })
    server = createApp(db, { key: 'ownership-test-key-with-32-bytes-min!!' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const login = async (username, password = 'test-password-1234') => (await call('/auth/login', 'POST', { username, password })).cookie

    const secondary = await login('secondary')
    const sheets = await call('/characters', 'GET', undefined, secondary)
    assert.deepEqual(sheets.data.map((row) => row.Id), ['hero-a'])
    const sheet = await call('/characters/hero-a', 'GET', undefined, secondary)
    assert.equal(sheet.status, 200)
    const updated = await call('/characters/hero-a', 'PUT', { data: { ...sheet.data, Name: 'Hero A (edited)' }, expectedVersion: 1 }, secondary)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.OwnerId, 'dm-a')
    const campaigns = await call('/resources/campaigns', 'GET', undefined, secondary)
    assert.equal(campaigns.data.length, 1)
    const campaignEdit = await call('/resources/campaigns/camp-a', 'PUT', { data: { Name: 'Camp A (edited)' }, version: 1 }, secondary)
    assert.equal(campaignEdit.status, 200)
    assert.equal((await db.collection('campaigns').findOne({ Id: 'camp-a' })).OwnerId, 'dm-a')

    const registered = await call('/auth/register', 'POST', { email: 'lirril@example.com', username: 'Lirril', password: 'lirril-password-1234', role: 'player' })
    assert.equal(registered.status, 201)
    assert.equal(registered.data.Role, 'dm')
    const ownership = await db.collection('systemOwnership').findOne({ SystemId: 'essence' })
    assert.equal(ownership.OwnerId, registered.data.Id)
    assert.equal((await db.collection('pendingOwnerships').findOne({ UsernameKey: 'lirril' })).Applied, true)

    const lirril = await login('Lirril', 'lirril-password-1234')
    const essenceEdit = await call('/resources/systems/essence', 'PUT', { data: { Id: 'essence', Name: 'Essence', description: 'Lirril\u2019s ruleset.', CampaignNames: ['Welcome to the Sprawl'], Ruleset: 'essence' }, version: 0 }, lirril)
    assert.equal(essenceEdit.status, 200)
    const primary = await login('primarydm')
    const denied = await call('/resources/systems/essence', 'PUT', { data: { Id: 'essence', Name: 'Essence', description: 'Takeover.', CampaignNames: ['X'], Ruleset: 'essence' }, version: 1 }, primary)
    assert.equal(denied.status, 400)
    assert.equal((await db.collection('systems').findOne({ Id: 'essence' })).OwnerId, registered.data.Id)
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
