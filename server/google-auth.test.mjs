import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword, sessionDigest } from './security.mjs'

test('Google OAuth state, persistent sessions, account modes, and explicit linking', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_oauth_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
  let server
  const key = 'oauth-test-key-with-at-least-32-bytes'
  const requests = new Map()
  const provider = {
    authorizationUrl({ state, nonce, challenge }) {
      requests.set(state, { nonce, challenge })
      return `https://accounts.google.test/authorize?state=${state}`
    },
    async identity({ code, verifier, nonce }) {
      assert.ok([...requests.values()].some((request) => request.nonce === nonce && request.challenge === createHash('sha256').update(verifier).digest('base64url')))
      if (code === 'invalid-identity') throw new Error('Rejected nonce or token')
      return code === 'existing-email'
        ? { subject: 'google-existing-password-account', email: 'password@example.com' }
        : { subject: 'google-test-subject', email: 'google@example.com' }
    },
  }
  try {
    await initializeDatabase(db)
    server = createApp(db, { key, googleProvider: provider }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, redirect: 'manual', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const text = await response.text()
      let data
      try { data = JSON.parse(text) } catch {}
      return { status: response.status, location: response.headers.get('location'), cookies: response.headers.getSetCookie(), data }
    }
    const oauthCookie = (response) => response.cookies.find((cookie) => cookie.startsWith('dd_google='))?.split(';')[0]
    const sessionCookie = (response) => response.cookies.find((cookie) => cookie.startsWith('dd_session='))?.split(';')[0]
    const stateOf = (response) => new URL(response.location).searchParams.get('state')
    assert.equal((await call('/auth/providers')).data.google, true)
    assert.equal((await call('/auth/google/start?role=admin')).status, 400)
    const start = await call('/auth/google/start?role=dm')
    const state = stateOf(start)
    const cookie = oauthCookie(start)
    const stored = await db.collection('oauthStates').findOne({ Digest: sessionDigest(state, key) })
    assert.equal(stored.Role, 'dm')
    assert.equal(stored.State, undefined)
    assert.match(start.cookies[0], /HttpOnly/)
    assert.match(start.cookies[0], /SameSite=Lax/)
    assert.match((await call(`/auth/google/callback?state=${state}&code=new-user`)).location, /google_state/)
    assert.match((await call('/auth/google/callback?state=wrong&code=new-user', 'GET', undefined, cookie)).location, /google_state/)
    const callback = await call(`/auth/google/callback?state=${state}&code=new-user`, 'GET', undefined, cookie)
    assert.equal(callback.location, 'http://localhost:5173/')
    const persistent = sessionCookie(callback)
    assert.ok(persistent)
    assert.match(callback.cookies.find((entry) => entry.startsWith('dd_session=')), /HttpOnly/)
    const account = (await call('/auth/me', 'GET', undefined, persistent)).data
    assert.equal(account.Role, 'dm')
    assert.equal(account.GoogleLinked, true)
    assert.equal(account.GoogleSub, undefined)
    const session = await db.collection('sessions').findOne({ UserId: account.Id })
    assert.ok(session.ExpiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000)
    assert.match((await call(`/auth/google/callback?state=${state}&code=new-user`, 'GET', undefined, cookie)).location, /google_state/)
    const again = await call('/auth/google/start?role=player')
    const repeat = await call(`/auth/google/callback?state=${stateOf(again)}&code=new-user`, 'GET', undefined, oauthCookie(again))
    assert.equal((await call('/auth/me', 'GET', undefined, sessionCookie(repeat))).data.Role, 'dm')
    assert.equal(await db.collection('users').countDocuments({ GoogleSub: 'google-test-subject' }), 1)
    const invalid = await call('/auth/google/start')
    assert.match((await call(`/auth/google/callback?state=${stateOf(invalid)}&code=invalid-identity`, 'GET', undefined, oauthCookie(invalid))).location, /google_failed/)
    await db.collection('users').insertOne({ Id: 'password-user', Username: 'passworduser', UsernameKey: 'passworduser', Email: 'password@example.com', Role: 'player', PasswordHash: await hashPassword('password-account-1234') })
    const collision = await call('/auth/google/start')
    assert.match((await call(`/auth/google/callback?state=${stateOf(collision)}&code=existing-email`, 'GET', undefined, oauthCookie(collision))).location, /google_account_exists/)
    assert.equal((await db.collection('users').findOne({ Id: 'password-user' })).GoogleSub, undefined)
    const passwordLogin = await call('/auth/login', 'POST', { username: 'passworduser', password: 'password-account-1234' })
    const link = await call('/auth/google/start?link=1', 'GET', undefined, sessionCookie(passwordLogin))
    const linked = await call(`/auth/google/callback?state=${stateOf(link)}&code=existing-email`, 'GET', undefined, oauthCookie(link))
    const linkedAccount = (await call('/auth/me', 'GET', undefined, sessionCookie(linked))).data
    assert.equal(linkedAccount.Id, 'password-user')
    assert.equal(linkedAccount.GoogleLinked, true)
    assert.equal(linkedAccount.Role, 'player')
    assert.match((await call('/auth/google/start?link=1')).location, /signin_required/)
    await call('/auth/logout', 'POST', {}, persistent)
    assert.equal((await call('/auth/me', 'GET', undefined, persistent)).status, 401)
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})