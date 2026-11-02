import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { tsImport } from 'tsx/esm/api'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'

const { Campaign } = await tsImport('../src/character/Campaign.ts', import.meta.url)

test('timeline moves re-time and re-place pending events but never applied ones', () => {
  const campaign = new Campaign('Dustwater Run', new Date('2026-11-02T10:00:00Z'))
  const event = campaign.scheduleEvent('raid', 'Bandits', 'At the ford', new Date('2026-11-03T10:00:00Z'), [{ type: 'add-xp', characterId: 'c1', amount: 10 }])
  const later = campaign.scheduleEvent('quest', 'Caravan', 'Escort', new Date('2026-11-04T10:00:00Z'), [{ type: 'add-xp', characterId: 'c1', amount: 5 }])

  campaign.moveEvent(event.Id, new Date('2026-11-05T12:00:00Z'), 'Old Mill')
  assert.equal(event.ScheduledAt.toISOString(), '2026-11-05T12:00:00.000Z')
  assert.equal(event.Location, 'Old Mill')
  assert.deepEqual(campaign.scheduledEvents.map((item) => item.Id), [later.Id, event.Id], 'events stay sorted by time after a move')

  assert.throws(() => campaign.moveEvent(event.Id, new Date('2026-11-02T09:00:00Z'), ''), /later than campaign currentTime/)
  assert.throws(() => campaign.moveEvent('missing', new Date('2026-11-06T10:00:00Z'), ''), /not found/)

  campaign.advanceTo(new Date('2026-11-04T11:00:00Z'))
  assert.equal(later.Completed, true)
  assert.throws(() => campaign.moveEvent(later.Id, new Date('2026-11-07T10:00:00Z'), 'Old Mill'), /Applied events cannot be moved/)

  const copy = campaign.clone()
  assert.equal(copy.scheduledEvents.find((item) => item.Id === event.Id).Location, 'Old Mill', 'clones keep locations')
})

test('DMs transfer characters between managed owners and campaigns', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_transfer_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    const password = 'test-password-1234'
    await db.collection('users').insertMany([
      { Id: 'dm-1', Username: 'dmone', UsernameKey: 'dmone', Role: 'dm', PasswordHash: await hashPassword(password) },
      { Id: 'p-1', Username: 'playerone', UsernameKey: 'playerone', Role: 'player', CreatedBy: 'dm-1', PasswordHash: await hashPassword(password) },
      { Id: 'p-2', Username: 'playertwo', UsernameKey: 'playertwo', Role: 'player', CreatedBy: 'dm-1', PasswordHash: await hashPassword(password) },
      { Id: 'p-x', Username: 'stranger', UsernameKey: 'stranger', Role: 'player', CreatedBy: 'other-dm', PasswordHash: await hashPassword(password) },
    ])
    server = createApp(db, { key: 'transfer-test-key-with-at-least-32-bytes!' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const dm = (await call('/auth/login', 'POST', { username: 'dmone', password })).cookie
    const player = (await call('/auth/login', 'POST', { username: 'playerone', password })).cookie

    const created = await call('/characters', 'POST', { data: { Name: 'Jessa Crowe', CampaignName: 'Dustwater Run', Tags: [] }, ownerId: 'p-1' }, dm)
    assert.equal(created.status, 201)
    const id = created.data.Id

    // Players cannot transfer.
    assert.equal((await call(`/characters/${id}/transfer`, 'POST', { campaignName: 'Ashen Vale' }, player)).status, 403)
    // Owners must be managed by this DM.
    assert.equal((await call(`/characters/${id}/transfer`, 'POST', { ownerId: 'p-x' }, dm)).status, 403)
    // Something must change.
    assert.equal((await call(`/characters/${id}/transfer`, 'POST', {}, dm)).status, 400)

    const moved = await call(`/characters/${id}/transfer`, 'POST', { ownerId: 'p-2', campaignName: 'Ashen Vale' }, dm)
    assert.equal(moved.status, 200)
    assert.equal(moved.data.OwnerId, 'p-2')
    assert.equal(moved.data.OwnerName, 'playertwo')
    assert.equal(moved.data.CampaignName, 'Ashen Vale')
    assert.equal(moved.data.Version, created.data.Version + 1)

    // The previous owner no longer sees it; the new owner does.
    assert.equal((await call(`/characters/${id}`, 'GET', undefined, player)).status, 404)
    const two = (await call('/auth/login', 'POST', { username: 'playertwo', password })).cookie
    assert.equal((await call(`/characters/${id}`, 'GET', undefined, two)).status, 200)

    // Handing it back to the DM themselves is allowed.
    const toDm = await call(`/characters/${id}/transfer`, 'POST', { ownerId: 'dm-1' }, dm)
    assert.equal(toDm.status, 200)
    assert.equal(toDm.data.OwnerName, 'dmone')
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
