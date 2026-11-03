import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'
import { applySharingToggle, eventLogInput, eventRecipients, SHARING_LOCK_MS, visibleEntryFor } from './event-log.mjs'

const now = new Date('2026-11-03T12:00:00Z')

test('turning sharing on locks it for a week; turning off waits for the lock', () => {
  const on = applySharingToggle(null, true, now)
  assert.equal(on.ok, true)
  assert.equal(on.next.Sharing, true)
  assert.equal(on.next.LockedUntil.getTime(), now.getTime() + SHARING_LOCK_MS)

  const again = applySharingToggle(on.next, true, new Date(now.getTime() + 1000))
  assert.equal(again.next.LockedUntil.getTime(), on.next.LockedUntil.getTime(), 'repeating on keeps the original lock')

  const early = applySharingToggle(on.next, false, new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000))
  assert.equal(early.ok, false)
  assert.equal(early.lockedUntil.getTime(), on.next.LockedUntil.getTime())

  const late = applySharingToggle(on.next, false, new Date(now.getTime() + SHARING_LOCK_MS + 1))
  assert.deepEqual(late, { ok: true, next: { Sharing: false, LockedUntil: null } })

  assert.deepEqual(applySharingToggle(null, false, now), { ok: true, next: { Sharing: false, LockedUntil: null } }, 'off when never on is fine')
  assert.deepEqual(applySharingToggle({ Sharing: false, LockedUntil: new Date(now.getTime() + 1000) }, false, now).ok, true, 'a stale lock on a non-sharer does not bind')
})

const entry = {
  _id: 'mongo', Id: 'e1', DMId: 'dm', CampaignName: 'Ashen Vale', Title: 'Night raid', Description: 'Torches', Skin: { skin: 'rust' }, Source: 'manual', CreatedAt: '2026-11-03T12:00:00Z',
  Targets: [
    { CharacterId: 'c1', CharacterName: 'Aria', OwnerId: 'p1', Effects: [{ type: 'dm-points', amount: 5, Summary: '+5 universal points' }] },
    { CharacterId: 'c2', CharacterName: 'Bram', OwnerId: 'p2', Effects: [] },
    { CharacterId: 'c3', CharacterName: 'Cass', OwnerId: 'p3', Effects: [], Error: 'Save failed.' },
  ],
  AcknowledgedBy: ['dm', 'p2'],
}

test('the DM sees the whole entry with acknowledgement counts', () => {
  const seen = visibleEntryFor({ Id: 'dm', Role: 'dm' }, entry)
  assert.equal(seen.Targets.length, 3)
  assert.equal(seen.Acknowledgements, 2)
  assert.equal(seen.Unread, false)
  assert.equal('AcknowledgedBy' in seen, false)
  assert.equal('_id' in seen, false)
  assert.equal('GenerationCost' in visibleEntryFor({ Id: 'dm', Role: 'dm' }, { ...entry, GenerationCost: { TotalTokens: 1 } }), false, 'seed bookkeeping never reaches a client')
  assert.equal(visibleEntryFor({ Id: 'other-dm', Role: 'dm' }, entry), null, 'another DM sees nothing')
  assert.equal(visibleEntryFor({ Id: 'x', Role: 'player', SecondaryOwner: true }, entry).Targets.length, 3)
})

test('players see their own targets, and other sharers only when they share too', () => {
  const p1 = { Id: 'p1', Role: 'player' }
  const alone = visibleEntryFor(p1, entry)
  assert.deepEqual(alone.Targets.map((target) => target.CharacterId), ['c1'])
  assert.equal(alone.Unread, true)
  assert.equal('AcknowledgedBy' in alone, false)

  const sharers = new Set(['p1', 'p2'])
  assert.deepEqual(visibleEntryFor(p1, entry, sharers).Targets.map((target) => target.CharacterId), ['c1', 'c2'], 'sharers see each other, not p3')
  assert.deepEqual(visibleEntryFor({ Id: 'p3', Role: 'player' }, entry, sharers).Targets.map((target) => target.CharacterId), ['c3'], 'a non-sharer never sees the pool')
  assert.equal(visibleEntryFor({ Id: 'p2', Role: 'player' }, entry, sharers).Unread, false)
  assert.equal(visibleEntryFor({ Id: 'p9', Role: 'player' }, entry, new Set(['p9', 'p1'])), null, 'sharing does not reveal events that never touched you')
})

test('recipients are the DM and each distinct owner', () => {
  assert.deepEqual(eventRecipients({ ...entry, Targets: [...entry.Targets, { CharacterId: 'c4', OwnerId: 'p1', Effects: [] }] }), ['dm', 'p1', 'p2', 'p3'])
})

test('the event schema bounds titles, descriptions, skins, and targets', () => {
  const valid = { CampaignName: 'Ashen Vale', Title: 'Raid', Description: 'x'.repeat(20_000), Skin: { skin: 'rust', accent: '#aa3311' }, Source: 'manual', Targets: [{ CharacterId: 'c1', Effects: [{ type: 'dm-points', amount: 5, Summary: '+5' }] }] }
  assert.equal(eventLogInput.safeParse(valid).success, true)
  assert.equal(eventLogInput.safeParse({ ...valid, Description: 'x'.repeat(20_001) }).success, false)
  assert.equal(eventLogInput.safeParse({ ...valid, Skin: { skin: 'neon' } }).success, false)
  assert.equal(eventLogInput.safeParse({ ...valid, Skin: { skin: 'rust', accent: 'red' } }).success, false)
  assert.equal(eventLogInput.safeParse({ ...valid, Skin: { skin: 'rust', banner: { DataUrl: 'https://x', Palette: {}, UpdatedAt: '' } } }).success, false)
  assert.equal(eventLogInput.safeParse({ ...valid, Targets: [] }).success, false)
  assert.equal(eventLogInput.safeParse({ ...valid, Title: '' }).success, false)
})

test('DMs record events, players see their slice, and sharing pools lock for a week', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_events_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    const password = 'test-password-1234'
    await db.collection('users').insertMany([
      { Id: 'dm-1', Username: 'dmone', UsernameKey: 'dmone', Role: 'dm', PasswordHash: await hashPassword(password) },
      { Id: 'p-1', Username: 'playerone', UsernameKey: 'playerone', Role: 'player', CreatedBy: 'dm-1', PasswordHash: await hashPassword(password) },
      { Id: 'p-2', Username: 'playertwo', UsernameKey: 'playertwo', Role: 'player', CreatedBy: 'dm-1', PasswordHash: await hashPassword(password) },
      { Id: 'p-3', Username: 'playerthree', UsernameKey: 'playerthree', Role: 'player', CreatedBy: 'dm-1', PasswordHash: await hashPassword(password) },
    ])
    const stamp = new Date().toISOString()
    const character = (Id, OwnerId, Name) => ({ Id, Name, OwnerId, OwnerName: OwnerId, DMId: 'dm-1', DMName: 'dmone', CampaignName: 'Ashen Vale', SystemId: 'default', Tags: [], Version: 1, CreatedAt: stamp, UpdatedAt: stamp })
    await db.collection('characters').insertMany([character('c-1', 'p-1', 'Aria'), character('c-2', 'p-2', 'Bram'), character('c-3', 'p-3', 'Cass'), { ...character('c-x', 'p-1', 'Elsewhere'), DMId: 'dm-9', CampaignName: 'Other' }])
    server = createApp(db, { key: 'event-log-test-key-with-at-least-32-bytes' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const login = async (username) => (await call('/auth/login', 'POST', { username, password })).cookie
    const [dm, p1, p2, p3] = await Promise.all(['dmone', 'playerone', 'playertwo', 'playerthree'].map(login))

    const payload = {
      CampaignName: 'Ashen Vale', Title: 'Night raid', Description: 'Torches on the ridge.', Skin: { skin: 'rust', accent: '#aa3311' }, Source: 'manual',
      Targets: [
        { CharacterId: 'c-1', Effects: [{ type: 'add-xp', amount: 10, Summary: '+10 XP' }] },
        { CharacterId: 'c-2', Effects: [{ type: 'add-xp', amount: 5, Summary: '+5 XP' }] },
      ],
    }
    assert.equal((await call('/event-log', 'POST', payload, p1)).status, 403, 'players cannot record events')
    assert.equal((await call('/event-log', 'POST', { ...payload, Targets: [{ CharacterId: 'c-x', Effects: [] }] }, dm)).status, 403, 'targets must be the DM\'s own campaign characters')
    const created = await call('/event-log', 'POST', payload, dm)
    assert.equal(created.status, 201)
    assert.equal(created.data.Targets.length, 2)
    assert.equal(created.data.Targets[0].OwnerId, 'p-1')
    assert.equal(created.data.Unread, false)

    const dmList = await call('/event-log?campaign=Ashen%20Vale', 'GET', undefined, dm)
    assert.equal(dmList.data.entries.length, 1)
    assert.equal(dmList.data.entries[0].Acknowledgements, 1)

    const p1List = await call('/event-log', 'GET', undefined, p1)
    assert.equal(p1List.data.unread, 1)
    assert.deepEqual(p1List.data.entries[0].Targets.map((target) => target.CharacterId), ['c-1'], 'a non-sharer sees only their own character')
    assert.equal((await call('/event-log', 'GET', undefined, p3)).data.entries.length, 0, 'untargeted players see nothing')

    // p1 and p2 join the pool; p1 then sees p2's slice, while p3 (not sharing) would not.
    assert.equal((await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: true }, dm)).status, 403)
    assert.equal((await call('/event-log/sharing', 'PUT', { campaign: 'Nowhere', sharing: true }, p1)).status, 404)
    const joined = await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: true }, p1)
    assert.equal(joined.status, 200)
    assert.ok(new Date(joined.data.lockedUntil).getTime() > Date.now() + SHARING_LOCK_MS - 60_000)
    await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: true }, p2)
    assert.deepEqual((await call('/event-log', 'GET', undefined, p1)).data.entries[0].Targets.map((target) => target.CharacterId), ['c-1', 'c-2'])
    const status = await call('/event-log/sharing?campaign=Ashen%20Vale', 'GET', undefined, p1)
    assert.equal(status.data.sharing, true)
    assert.deepEqual(status.data.sharers.map((row) => row.Username).sort(), ['playerone', 'playertwo'])
    assert.deepEqual((await call('/event-log/sharing?campaign=Ashen%20Vale', 'GET', undefined, p3)).data, { sharing: false, lockedUntil: null, sharers: [] }, 'outsiders do not learn who shares')

    const leave = await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: false }, p1)
    assert.equal(leave.status, 409)
    assert.match(leave.data.error, /Sharing stays on until/)
    await db.collection('eventSharing').updateOne({ UserId: 'p-2' }, { $set: { LockedUntil: new Date(Date.now() - 1000) } })
    assert.equal((await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: false }, p2)).status, 200, 'the lock lifts after a week')
    assert.deepEqual((await call('/event-log', 'GET', undefined, p1)).data.entries[0].Targets.map((target) => target.CharacterId), ['c-1'], 'a departed sharer drops out of view')

    const id = created.data.Id
    assert.equal((await call(`/event-log/${id}/ack`, 'POST', {}, p3)).status, 404)
    assert.equal((await call(`/event-log/${id}/ack`, 'POST', {}, p1)).status, 200)
    assert.equal((await call('/event-log', 'GET', undefined, p1)).data.unread, 0)
    assert.equal((await call('/event-log', 'GET', undefined, dm)).data.entries[0].Acknowledgements, 2)
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
