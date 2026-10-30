import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'
import { mergeCopies, resolveCopies } from '../src/character/RevisionMerge.mjs'

test('three-way merge preserves independent edits and resolves conflicting fields individually', () => {
  const base = { Name: 'Hero', Version: 1, stats: { hp: 10, strength: 2, agility: 3 }, items: ['A'], note: 'old' }
  const local = { ...base, Version: 2, stats: { hp: 7, strength: 4, agility: 3 }, items: ['B'] }
  const server = { ...base, Version: 3, stats: { hp: 8, strength: 2, agility: 5 }, items: ['C'], note: 'new' }
  const diff = mergeCopies(base, local, server)
  assert.deepEqual(diff.differences.map((entry) => entry.Path.join('.')), ['stats.hp', 'items'])
  assert.deepEqual(resolveCopies(base, local, server, ['local', 'server']), { ...server, stats: { hp: 7, strength: 4, agility: 5 } })
  assert.throws(() => resolveCopies(base, local, server, ['local']), /every differing field/)
})

test('three-way merge handles additions, removals, nulls, and immutable metadata', () => {
  const base = { Id: 'real', stats: { hp: 10 }, note: 'old' }
  const local = { Id: 'forged', stats: null, added: 5 }
  const server = { Id: 'real', stats: { hp: 8 }, note: 'server' }
  const result = resolveCopies(base, local, server, ['local', 'local'])
  assert.deepEqual(result, { Id: 'real', stats: null, added: 5 })
})

test('saved versions, safe undo, and field-by-field DM resolution on Atlas', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_hist_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    const PasswordHash = await hashPassword('test-password-1234')
    await db.collection('users').insertMany([
      { Id: 'dm', Username: 'testdm', UsernameKey: 'testdm', Role: 'dm', PasswordHash },
      { Id: 'player', Username: 'testplayer', UsernameKey: 'testplayer', Role: 'player', CreatedBy: 'dm', PasswordHash },
      { Id: 'outsider', Username: 'otherdm', UsernameKey: 'otherdm', Role: 'dm', PasswordHash },
    ])
    server = createApp(db, { key: 'test-history-session-key-with-32-bytes' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const login = async (username) => (await call('/auth/login', 'POST', { username, password: 'test-password-1234' })).cookie
    const dm = await login('testdm'), player = await login('testplayer'), other = await login('otherdm')
    const original = { Id: 'hero', Name: 'Hero', DMId: 'dm', OwnerId: 'player', CampaignName: 'Campaign', Version: 1, CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString(), Essence: { hp: 10, strength: 2, agility: 3 } }
    await db.collection('characters').insertOne({ ...original })
    const save = (data, version, cookie) => call('/characters/hero', 'PUT', { data, expectedVersion: version, base: original }, cookie)
    const first = await save({ ...original, Essence: { ...original.Essence, hp: 8, agility: 5 } }, 1, player)
    assert.equal(first.status, 200)
    assert.equal(first.data.Version, 2)
    const conflictResult = await save({ ...original, Essence: { ...original.Essence, hp: 7, strength: 4 } }, 1, dm)
    assert.equal(conflictResult.status, 409)
    assert.equal((await call('/conflicts', 'GET', undefined, player)).status, 403)
    assert.equal((await call('/conflicts', 'GET', undefined, other)).data.length, 0)
    const conflicts = (await call('/conflicts', 'GET', undefined, dm)).data
    assert.equal(conflicts.length, 1)
    const id = conflicts[0].Id
    assert.equal((await call(`/conflicts/${id}/resolve`, 'POST', { expectedVersion: 1, choices: ['local'] }, dm)).status, 409)
    const merged = await call(`/conflicts/${id}/resolve`, 'POST', { expectedVersion: 2, choices: ['local'] }, dm)
    assert.equal(merged.status, 200)
    assert.equal(merged.data.record.Version, 3)
    assert.deepEqual(merged.data.record.Essence, { hp: 7, strength: 4, agility: 5 })
    assert.equal((await call('/conflicts', 'GET', undefined, dm)).data.length, 0)
    assert.equal((await call('/history/undo', 'POST', {}, player)).status, 409)
    const undo = await call('/history/undo', 'POST', {}, dm)
    assert.equal(undo.status, 200)
    assert.equal(undo.data.record.Version, 4)
    assert.deepEqual(undo.data.record.Essence, first.data.Essence)
    assert.equal((await call(`/conflicts/${id}/resolve`, 'POST', { expectedVersion: 4, choices: ['local'] }, dm)).status, 404)
    assert.equal((await call('/resources/items/hat', 'PUT', { data: { Name: 'Hat', Armour: 10 }, version: 0 }, dm)).status, 200)
    assert.equal((await call('/resources/items/hat', 'PUT', { data: { Name: 'Hat', Armour: 15 }, version: 1 }, dm)).status, 200)
    assert.equal((await call('/history/undo', 'POST', {}, dm)).data.record.Data.Armour, 10)
    assert.equal((await call('/resources/items/hat', 'DELETE', { version: 3 }, dm)).status, 200)
    assert.equal((await call('/history/undo', 'POST', {}, dm)).data.record.Data.Armour, 10)
    const history = await db.collection('changeHistory').find({ Kind: 'characters' }).toArray()
    assert.equal(history.length, 2)
    await db.collection('characters').insertOne({ ...original, Id: 'race' })
    const concurrent = await Promise.all([
      call('/characters/race', 'PUT', { data: { ...original, Name: 'DM edit' }, expectedVersion: 1, base: original }, dm),
      call('/characters/race', 'PUT', { data: { ...original, Name: 'Player edit' }, expectedVersion: 1, base: original }, player),
    ])
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409])
    assert.equal(await db.collection('conflicts').countDocuments({ TargetId: 'race', Resolved: false }), 1)
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})