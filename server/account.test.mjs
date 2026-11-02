import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase, sweepIdleSessionLogs } from './app.mjs'

// Captures outgoing mail so the test can follow the links and codes it contains.
function recordingMailer() {
  const sent = []
  return { sent, enabled: true, from: 'test@example.com', async send(message) { sent.push(message); return { delivered: true } } }
}

test('registration completes through an emailed link and the account dialog changes email and password', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_account_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  try {
    await initializeDatabase(db)
    const mailer = recordingMailer()
    server = createApp(db, { key: 'account-test-key-with-at-least-32-bytes!!', mailer, appUrl: 'https://play.example.com/app/' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }

    // Step 1: the request does not create the account; it emails a single-use link.
    const requested = await call('/auth/register', 'POST', { email: 'New.Player@Example.com', username: 'newplayer', password: 'a-long-password-1234', role: 'player' })
    assert.equal(requested.status, 202)
    assert.equal(requested.data.delivered, true)
    assert.equal(requested.data.previewLink, undefined, 'no preview when mail is delivered')
    assert.equal(await db.collection('users').countDocuments({ UsernameKey: 'newplayer' }), 0)
    assert.equal(mailer.sent.length, 1)
    assert.equal(mailer.sent[0].to, 'new.player@example.com')
    const link = /https:\/\/play\.example\.com\/app\/\?register=([A-Za-z0-9_-]+)/.exec(mailer.sent[0].text)
    assert.ok(link, 'the email carries the app link with the token')
    assert.equal((await call('/auth/login', 'POST', { username: 'newplayer', password: 'a-long-password-1234' })).status, 401)

    // Step 2: opening the link creates the account, marks the email verified, and signs in.
    const completed = await call('/auth/register/complete', 'POST', { token: link[1] })
    assert.equal(completed.status, 201)
    assert.equal(completed.data.Username, 'newplayer')
    assert.equal(completed.data.Email, 'new.player@example.com')
    assert.ok(completed.cookie)
    assert.equal((await db.collection('users').findOne({ UsernameKey: 'newplayer' })).EmailVerified, true)
    assert.equal((await call('/auth/me', 'GET', undefined, completed.cookie)).status, 200)
    // The session remembers the open screen across reloads on this device.
    assert.equal((await call('/auth/me', 'GET', undefined, completed.cookie)).data.Screen, null)
    assert.equal((await call('/auth/screen', 'PUT', { screen: { dmPage: 'Timeline', dmCampaign: 'Welcome to the Sprawl', sheetTab: 'essence', count: 2, flag: true } }, completed.cookie)).status, 200)
    assert.deepEqual((await call('/auth/me', 'GET', undefined, completed.cookie)).data.Screen, { dmPage: 'Timeline', dmCampaign: 'Welcome to the Sprawl', sheetTab: 'essence', count: 2, flag: true })
    assert.equal((await call('/auth/screen', 'PUT', { screen: { nested: { no: true } } }, completed.cookie)).status, 400)
    assert.equal((await call('/auth/screen', 'PUT', { screen: {} })).status, 401)
    // Session activity accumulates on the session's log and is closed by the sign-out that carries the last events.
    assert.equal((await call('/auth/session/activity', 'POST', { events: [{ t: '2026-11-02T12:00:00Z', kind: 'screen', detail: 'dmPage=Timeline' }, { t: '2026-11-02T12:00:01Z', kind: 'api', detail: 'PUT /characters/x 200' }], reason: 'interval' }, completed.cookie)).data.stored, 2)
    const beacon = await fetch(`${base}/auth/session/activity`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'http://localhost:5173', Cookie: completed.cookie }, body: JSON.stringify({ events: [{ t: '2026-11-02T12:00:02Z', kind: 'screen', detail: 'sheetTab=essence' }], reason: 'pagehide' }) })
    assert.equal(beacon.status, 200)
    const openLog = await db.collection('sessionLogs').findOne({ UserId: completed.data.Id })
    assert.equal(openLog.Events.length, 3)
    assert.equal(openLog.EndedAt, null)
    assert.equal(openLog.LastFlushReason, 'pagehide')
    assert.equal((await call('/auth/logout', 'POST', { events: [{ t: '2026-11-02T12:00:03Z', kind: 'logout' }], reason: 'logout' }, completed.cookie)).status, 200)
    const closedLog = await db.collection('sessionLogs').findOne({ UserId: completed.data.Id })
    assert.equal(closedLog.Events.length, 4)
    assert.equal(closedLog.EndReason, 'logout')
    assert.ok(closedLog.EndedAt instanceof Date)
    assert.equal((await call('/auth/me', 'GET', undefined, completed.cookie)).status, 401)
    // Sign back in for the rest of the checks.
    completed.cookie = (await call('/auth/login', 'POST', { username: 'newplayer', password: 'a-long-password-1234' })).cookie

    // Thirty idle minutes end the session: its log closes as inactivity and the next request auto-logs in to a fresh
    // token, session, and log, carrying the remembered screen along.
    await call('/auth/screen', 'PUT', { screen: { dmPage: 'Events' } }, completed.cookie)
    const staleDigest = (await db.collection('sessions').findOne({ UserId: completed.data.Id })).Digest
    await db.collection('sessions').updateOne({ Digest: staleDigest }, { $set: { LastActivityAt: new Date(Date.now() - 31 * 60 * 1000) } })
    await db.collection('sessionLogs').updateOne({ SessionDigest: staleDigest }, { $set: { LastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } })
    const returned = await call('/auth/me', 'GET', undefined, completed.cookie)
    assert.equal(returned.status, 200)
    assert.ok(returned.cookie && returned.cookie !== completed.cookie, 'a new session cookie is issued on return')
    assert.deepEqual(returned.data.Screen, { dmPage: 'Events' }, 'the open screen survives the new session')
    const idleLog = await db.collection('sessionLogs').findOne({ SessionDigest: staleDigest })
    assert.equal(idleLog.EndReason, 'inactivity')
    assert.equal(await db.collection('sessionLogs').countDocuments({ UserId: completed.data.Id, EndedAt: null }), 1, 'exactly one open log for the new session')
    assert.equal((await call('/auth/me', 'GET', undefined, completed.cookie)).status, 401, 'the old token no longer works')
    completed.cookie = returned.cookie
    // The sweeper closes logs for sessions whose users never return.
    const abandonedDigest = (await db.collection('sessions').findOne({ UserId: completed.data.Id })).Digest
    await db.collection('sessionLogs').updateOne({ SessionDigest: abandonedDigest }, { $set: { LastSeenAt: new Date(Date.now() - 40 * 60 * 1000) } })
    assert.equal(await sweepIdleSessionLogs(db), 1)
    assert.equal((await db.collection('sessionLogs').findOne({ SessionDigest: abandonedDigest })).EndReason, 'inactivity')
    completed.cookie = (await call('/auth/login', 'POST', { username: 'newplayer', password: 'a-long-password-1234' })).cookie
    // The link is single use.
    assert.equal((await call('/auth/register/complete', 'POST', { token: link[1] })).status, 410)
    // A second registration for a taken name is refused up front.
    assert.equal((await call('/auth/register', 'POST', { email: 'other@example.com', username: 'newplayer', password: 'a-long-password-1234' })).status, 409)

    // Email change: the code goes to the new address; wrong codes are counted; the right one switches the address.
    const cookie = completed.cookie
    assert.equal((await call('/account/email/request', 'POST', { email: 'fresh@example.com', currentPassword: 'wrong-password-123' }, cookie)).status, 403)
    const emailRequest = await call('/account/email/request', 'POST', { email: 'fresh@example.com', currentPassword: 'a-long-password-1234' }, cookie)
    assert.equal(emailRequest.status, 202)
    assert.equal(mailer.sent.length, 2)
    assert.equal(mailer.sent[1].to, 'fresh@example.com')
    const code = /\b(\d{6})\b/.exec(mailer.sent[1].text)[1]
    assert.equal((await call('/account/email/confirm', 'POST', { code: code === '000000' ? '000001' : '000000' }, cookie)).status, 400)
    const confirmed = await call('/account/email/confirm', 'POST', { code }, cookie)
    assert.equal(confirmed.status, 200)
    assert.equal(confirmed.data.Email, 'fresh@example.com')
    assert.equal((await call('/auth/me', 'GET', undefined, cookie)).data.Email, 'fresh@example.com')
    assert.equal((await call('/account/email/confirm', 'POST', { code }, cookie)).status, 410, 'codes are single use')

    // Password change requires the current password, then signs every session out.
    const userId = completed.data.Id
    assert.equal((await call(`/accounts/${userId}`, 'PATCH', { Password: 'another-long-password-5678', CurrentPassword: 'nope-nope-nope-1234' }, cookie)).status, 403)
    assert.equal((await call(`/accounts/${userId}`, 'PATCH', { Password: 'another-long-password-5678', CurrentPassword: 'a-long-password-1234' }, cookie)).status, 200)
    assert.equal((await call('/auth/me', 'GET', undefined, cookie)).status, 401)
    assert.equal((await call('/auth/login', 'POST', { username: 'newplayer', password: 'another-long-password-5678' })).status, 200)

    // Without a mail provider the link is returned so the flow still works.
    const silent = createApp(db, { key: 'account-test-key-with-at-least-32-bytes!!', mailer: { enabled: false, from: 'x', async send() { return { delivered: false } } } }).listen(0, '127.0.0.1')
    await once(silent, 'listening')
    try {
      const response = await fetch(`http://127.0.0.1:${silent.address().port}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'quiet@example.com', username: 'quietone', password: 'a-long-password-1234' }) })
      const data = await response.json()
      assert.equal(response.status, 202)
      assert.equal(data.delivered, false)
      assert.match(data.previewLink, /\?register=/)
    } finally { silent.closeAllConnections(); await new Promise((resolve) => silent.close(resolve)) }
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
