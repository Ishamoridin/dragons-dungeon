import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'

test('Atlas account, session, character, and owned-resource CRUD', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    await db.collection('users').insertOne({ Id: 'dm-test', Username: 'testdm', UsernameKey: 'testdm', Role: 'dm', PasswordHash: await hashPassword('test-password-1234') })
    server = createApp(db, { key: 'test-session-key-with-at-least-32-bytes' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    assert.equal((await call('/characters')).status, 401)
    assert.equal((await call('/auth/login', 'POST', { username: 'testdm', password: 'bad-password' })).status, 401)
    const login = await call('/auth/login', 'POST', { username: 'testdm', password: 'test-password-1234' })
    assert.equal(login.status, 200)
    assert.equal(login.data.PasswordHash, undefined)
    const dmCookie = login.cookie
    const player = await call('/accounts', 'POST', { Username: 'testplayer', Password: 'player-password-1234', Role: 'player' }, dmCookie)
    assert.equal(player.status, 201)
    const stored = await db.collection('users').findOne({ Id: player.data.Id })
    assert.match(stored.PasswordHash, /^\$argon2id\$/)
    assert.equal(stored.Password, undefined)
    const playerLogin = await call('/auth/login', 'POST', { username: 'testplayer', password: 'player-password-1234' })
    const playerCookie = playerLogin.cookie
    assert.equal((await call('/accounts', 'POST', { Username: 'intruder', Password: 'a-valid-password', Role: 'dm' }, playerCookie)).status, 403)
    const created = await call('/characters', 'POST', { data: { Name: 'Test hero', CampaignName: 'Test campaign' }, ownerId: player.data.Id }, dmCookie)
    assert.equal(created.status, 201)
    assert.equal((await call(`/characters/${created.data.Id}`, 'GET', undefined, playerCookie)).status, 200)
    const update = { data: { ...created.data, Name: 'Updated hero' }, expectedUpdatedAt: created.data.UpdatedAt }
    assert.equal((await call(`/characters/${created.data.Id}`, 'PUT', update, playerCookie)).status, 200)
    assert.equal((await call(`/characters/${created.data.Id}`, 'PUT', update, playerCookie)).status, 409)
    const outsider = await call('/accounts', 'POST', { Username: 'otherdm', Password: 'other-password-1234', Role: 'dm' }, dmCookie)
    const otherLogin = await call('/auth/login', 'POST', { username: outsider.data.Username, password: 'other-password-1234' })
    assert.equal((await call(`/characters/${created.data.Id}`, 'GET', undefined, otherLogin.cookie)).status, 404)
    assert.equal((await call('/resources/campaigns/test', 'PUT', { data: { Name: 'Test campaign', NPCs: [{ Name: 'NPC' }] }, version: 0 }, playerCookie)).status, 403)
    for (const kind of ['campaigns', 'items', 'techniques', 'development']) {
      const saved = await call(`/resources/${kind}/test`, 'PUT', { data: { Name: 'Test entity' }, version: 0 }, dmCookie)
      assert.equal(saved.status, 200)
      assert.equal((await call(`/resources/${kind}`, 'GET', undefined, dmCookie)).data.length, 1)
      assert.equal((await call(`/resources/${kind}`, 'GET', undefined, otherLogin.cookie)).data.length, 0)
      assert.equal((await call(`/resources/${kind}/test`, 'PUT', { data: { Name: 'Updated entity' }, version: 1 }, dmCookie)).status, 200)
      assert.equal((await call(`/resources/${kind}/test`, 'DELETE', { version: 2 }, dmCookie)).status, 200)
    }
    assert.equal((await call(`/characters/${created.data.Id}/trash`, 'POST', {}, dmCookie)).status, 200)
    assert.equal((await call('/characters', 'GET', undefined, dmCookie)).data.length, 0)
    assert.equal((await call(`/characters/${created.data.Id}/restore`, 'POST', {}, dmCookie)).status, 200)
    assert.equal((await call('/characters', 'GET', undefined, dmCookie)).data.length, 1)
    assert.equal((await call('/accounts/' + player.data.Id, 'PATCH', { Password: 'changed-password-1234' }, dmCookie)).status, 200)
    assert.equal((await call('/auth/me', 'GET', undefined, playerCookie)).status, 401)
    assert.equal((await call('/accounts/' + player.data.Id, 'DELETE', {}, dmCookie)).status, 200)
    assert.equal(await db.collection('characters').countDocuments({ OwnerId: player.data.Id }), 0)
    assert.equal((await call('/auth/logout', 'POST', {}, dmCookie)).status, 200)
    assert.equal((await call('/auth/me', 'GET', undefined, dmCookie)).status, 401)
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})