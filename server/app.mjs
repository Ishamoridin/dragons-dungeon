import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canAccessCharacter, hashPassword, publicUser, sessionDigest, verifyPassword } from './security.mjs'
import { recordConflict, revisionEvents, saveRevision, undoLatest } from './character-history.mjs'
import { createRealtime, describeChange } from './realtime.mjs'
import { resolveCopies } from '../src/character/RevisionMerge.mjs'
import { mountGoogleAuth } from './google-auth.mjs'
import { createSheetSync } from './sheet-sync.mjs'
import { createMailer, emailChangeEmail, registrationEmail } from './mailer.mjs'

const username = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/)
const password = z.string().min(12).max(256)
const accountInput = z.object({ Username: username, Password: password, Role: z.enum(['player', 'dm']) }).strict()
const loginInput = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) }).strict()
const registrationInput = z.object({ email: z.string().trim().toLowerCase().email().max(254), username, password, role: z.enum(['player', 'dm']).default('player') }).strict()
const accountUpdate = z.object({ Username: username.optional(), Password: password.optional(), PreferredSkin: z.enum(['basalt', 'tideglass', 'wildwood', 'moonstone', 'matrix', 'sao', 'startrek', 'stone', 'moonsilver', 'steel', 'arcane', 'rust']).optional(), CurrentPassword: z.string().max(256).optional() }).strict()
const resourceKinds = new Set(['campaigns', 'items', 'techniques', 'development', 'systems'])
const systemData = z.object({
  Id: z.string().min(1).max(100),
  Name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000),
  CampaignNames: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  Ruleset: z.enum(['private', 'essence']),
}).strict()
const clean = (document) => { if (!document) return null; const { _id, ...value } = document; return value }
const fail = (status, message) => Object.assign(new Error(message), { status })

function safeData(value, depth = 0) {
  if (depth > 40) throw fail(400, 'Data is nested too deeply.')
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(key)) throw fail(400, 'Invalid data field.')
      safeData(nested, depth + 1)
    }
  }
}

// A session ends after this long without a request; the cookie still auto-logs the user into a new session.
export const SESSION_IDLE_MS = 30 * 60 * 1000
// How often an active session has its last-activity time written (avoids a write on every request).
const ACTIVITY_TOUCH_MS = 60 * 1000

// Closes the logs of sessions whose users never came back: run periodically from the server entry point.
export async function sweepIdleSessionLogs(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - SESSION_IDLE_MS)
  const idle = await db.collection('sessionLogs').find({ EndedAt: null, LastSeenAt: { $lt: cutoff } }, { projection: { SessionDigest: 1, LastSeenAt: 1 } }).toArray()
  for (const log of idle) {
    await db.collection('sessionLogs').updateOne({ _id: log._id, EndedAt: null }, { $set: { EndedAt: new Date(new Date(log.LastSeenAt).getTime() + SESSION_IDLE_MS), EndReason: 'inactivity' } })
  }
  return idle.length
}
export async function initializeDatabase(db) {
  await Promise.all([
    db.collection('users').createIndex({ UsernameKey: 1 }, { unique: true }),
    db.collection('users').createIndex({ Email: 1 }, { unique: true, partialFilterExpression: { Email: { $type: 'string' } } }),
    db.collection('users').createIndex({ GoogleSub: 1 }, { unique: true, partialFilterExpression: { GoogleSub: { $type: 'string' } } }),
    db.collection('oauthStates').createIndex({ Digest: 1 }, { unique: true }),
    db.collection('oauthStates').createIndex({ ExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('users').createIndex({ Id: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ Digest: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ ExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('characters').createIndex({ Id: 1 }, { unique: true }),
    db.collection('characters').createIndex({ OwnerId: 1, DMId: 1 }),
    db.collection('changeHistory').createIndex({ ActorId: 1, Undone: 1, CreatedAt: -1 }),
    db.collection('conflicts').createIndex({ DMId: 1, Resolved: 1 }),
    // Pending registrations and email changes expire on their own.
    db.collection('registrations').createIndex({ TokenDigest: 1 }, { unique: true }),
    db.collection('registrations').createIndex({ ExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('emailChanges').createIndex({ UserId: 1 }, { unique: true }),
    db.collection('emailChanges').createIndex({ ExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    // One activity log per session, kept after the session ends.
    db.collection('sessionLogs').createIndex({ SessionDigest: 1 }, { unique: true }),
    db.collection('sessionLogs').createIndex({ UserId: 1, StartedAt: -1 }),
    ...[...resourceKinds].map((kind) => db.collection(kind).createIndex({ OwnerId: 1, Id: 1 }, { unique: true })),
  ])
}

export function createApp(db, { key, origin = 'http://localhost:5173', secureCookies = false, crossSiteCookies = false, staticDir, google, googleProvider, sheetSync, mailer, appUrl } = {}) {
  if (!key || Buffer.byteLength(key) < 32) throw new Error('ENCRYPTION_KEY must contain at least 32 bytes for session protection.')
  // Google Sheets import and sync; tests inject a fake, index.mjs shares one instance with the background poller.
  const sheets = sheetSync ?? createSheetSync(db)
  // Registration links and email-change codes; disabled (preview only) until RESEND_API_KEY is configured.
  const mail = mailer ?? createMailer()
  // Where emailed links should open the app; the Pages deployment lives under a sub-path, so this is not always the origin.
  const appLink = (appUrl || `${origin}/`).replace(/\/?$/, '/')
  const app = express()
  app.disable('x-powered-by')
  // Hosts such as Render, Railway, and Fly.io sit behind a reverse proxy; trusting the first hop lets
  // express-rate-limit and secure-cookie detection read the real client IP/protocol from X-Forwarded-* headers.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '2mb' }))
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const requestOrigin = req.get('origin')
    if (requestOrigin === origin) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Access-Control-Allow-Credentials', 'true')
      res.set('Vary', 'Origin')
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE')
        res.set('Access-Control-Allow-Headers', 'Content-Type')
        res.set('Access-Control-Max-Age', '600')
        return res.sendStatus(204)
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = new Set([origin, `${secureCookies ? 'https' : 'http'}://${req.get('host')}`])
      if (!requestOrigin || !allowed.has(requestOrigin)) return next(fail(403, 'Request origin is not allowed.'))
    }
    next()
  })
  // Unauthenticated probe for hosting health checks; it only answers once the database connection and app wiring succeeded.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
  const users = db.collection('users')
  const sessions = db.collection('sessions')
  const characters = db.collection('characters')
  const cookieName = secureCookies ? '__Host-dd_session' : 'dd_session'
  // Cross-site cookies require SameSite=None with Secure for an API hosted apart from the frontend.
  const cookieOptions = { httpOnly: true, secure: secureCookies || crossSiteCookies, sameSite: crossSiteCookies ? 'none' : 'strict', path: '/' }
  const digestFor = (req) => {
    // A session rotated during this request (idle timeout) replaces the cookie's digest for later handlers.
    if (req.sessionDigest) return req.sessionDigest
    const raw = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    return raw ? sessionDigest(raw, key) : null
  }
  const findCurrentUser = async (req) => {
    const Digest = digestFor(req)
    const session = Digest && await sessions.findOne({ Digest, ExpiresAt: { $gt: new Date() } })
    return session && await users.findOne({ Id: session.UserId })
  }
  // Live updates over WebSocket at /api/events; index.mjs attaches it to the listening server.
  const realtime = createRealtime()
  const onChange = (change) => realtime.publish(describeChange(change))
  revisionEvents.on('change', onChange)
  app.attachRealtime = (server) => realtime.attach(server, { authenticate: findCurrentUser })
  app.closeRealtime = () => { revisionEvents.off('change', onChange); realtime.close() }
  // Sessions time out after 30 minutes without activity. The cookie itself lives on for auto-login: when the user
  // returns, the idle session's log is closed and a fresh token, session, and log start, keeping the open screen.
  const authenticate = async (req, res, next) => {
    const Digest = digestFor(req)
    const now = new Date()
    const session = Digest && await sessions.findOne({ Digest, ExpiresAt: { $gt: now } })
    const user = session && await users.findOne({ Id: session.UserId })
    if (!user) return next(fail(401, 'Please sign in.'))
    const lastActivity = new Date(session.LastActivityAt ?? session.CreatedAt ?? now).getTime()
    const idleFor = now.getTime() - lastActivity
    if (idleFor > SESSION_IDLE_MS) {
      await endSessionLog({ SessionDigest: Digest }, 'inactivity', new Date(lastActivity + SESSION_IDLE_MS))
      await issueSession(req, res, user, { Screen: session.Screen ?? null })
    } else if (idleFor > ACTIVITY_TOUCH_MS) {
      await sessions.updateOne({ Digest }, { $set: { LastActivityAt: now } })
      await sessionLogs.updateOne({ SessionDigest: Digest }, { $set: { LastSeenAt: now } })
    }
    req.user = user
    next()
  }
  const dmOnly = (req, res, next) => req.user.Role === 'dm' ? next() : next(fail(403, 'DM access required.'))
  const ownedCharacter = async (req) => {
    const record = await characters.findOne({ Id: req.params.id })
    if (!record || !canAccessCharacter(record, req.user)) throw fail(404, 'Character not found.')
    return record
  }
  const issueSession = async (req, res, user, { Screen = null } = {}) => {
    const oldDigest = digestFor(req)
    if (oldDigest) { await sessions.deleteOne({ Digest: oldDigest }); await endSessionLog({ SessionDigest: oldDigest }, 'replaced') }
    const token = randomBytes(32).toString('base64url')
    const now = new Date()
    const ExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const Digest = sessionDigest(token, key)
    await sessions.insertOne({ Digest, UserId: user.Id, CreatedAt: now, LastActivityAt: now, ExpiresAt, ...(Screen ? { Screen } : {}) })
    // Every session keeps an activity log; the client appends to it and it is finalised when the session ends.
    await sessionLogs.insertOne({ SessionDigest: Digest, UserId: user.Id, Username: user.Username, Role: user.Role, StartedAt: now, LastSeenAt: now, EndedAt: null, EndReason: null, Events: [] })
    req.sessionDigest = Digest
    res.cookie(cookieName, token, { ...cookieOptions, expires: ExpiresAt })
  }
  const sessionLogs = db.collection('sessionLogs')
  const activityEvent = z.object({ t: z.string().max(40), kind: z.string().min(1).max(40), detail: z.string().max(300).optional() }).strict()
  const activityBatch = z.object({ events: z.array(activityEvent).max(200).default([]), reason: z.string().max(40).optional() })
  async function appendActivity(digest, events, reason) {
    if (!digest) return
    const now = new Date()
    const update = { $set: { LastSeenAt: now, ...(reason ? { LastFlushReason: reason } : {}) } }
    if (events.length) update.$push = { Events: { $each: events.map((event) => ({ ...event, at: now })), $slice: -5000 } }
    await sessionLogs.updateOne({ SessionDigest: digest }, update)
  }
  const endSessionLog = (filter, reason, endedAt = new Date()) => sessionLogs.updateMany({ ...filter, EndedAt: null }, { $set: { EndedAt: endedAt, EndReason: reason } })
  mountGoogleAuth(app, db, { key, origin, appUrl: appLink, secureCookies, google, providerOverride: googleProvider, issueSession, findCurrentUser })

  app.post('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many registration attempts. Please try again later.' } }), async (req, res) => {
    const input = registrationInput.parse(req.body)
    const usernameKey = input.username.toLowerCase()
    if (await users.findOne({ $or: [{ UsernameKey: usernameKey }, { Email: input.email }] })) throw fail(409, 'Username or email is already in use.')
    // The account is only created when the emailed link is opened; until then the request waits here for 24 hours.
    const token = randomBytes(32).toString('base64url')
    const registration = {
      TokenDigest: sessionDigest(token, key), Username: input.username, UsernameKey: usernameKey, Email: input.email, Role: input.role,
      PasswordHash: await hashPassword(input.password), CreatedAt: new Date().toISOString(), ExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }
    await db.collection('registrations').deleteMany({ $or: [{ UsernameKey: usernameKey }, { Email: input.email }] })
    await db.collection('registrations').insertOne(registration)
    const link = `${appLink}?register=${token}`
    const { delivered } = await mail.send({ to: input.email, ...registrationEmail({ username: input.username, link }) })
    // Without an email provider the link is handed back so the flow can still be completed (development, tests).
    res.status(202).json({ ok: true, email: input.email, delivered, ...(delivered ? {} : { previewLink: link }) })
  })
  app.post('/api/auth/register/complete', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const { token } = z.object({ token: z.string().min(16).max(128) }).strict().parse(req.body)
    const registration = await db.collection('registrations').findOne({ TokenDigest: sessionDigest(token, key) })
    if (!registration || new Date(registration.ExpiresAt).getTime() < Date.now()) throw fail(410, 'This registration link has expired or was already used. Register again to get a new one.')
    if (await users.findOne({ $or: [{ UsernameKey: registration.UsernameKey }, { Email: registration.Email }] })) {
      await db.collection('registrations').deleteOne({ _id: registration._id })
      throw fail(409, 'Username or email is already in use.')
    }
    const user = {
      Id: randomUUID(), Username: registration.Username, UsernameKey: registration.UsernameKey,
      Email: registration.Email, EmailVerified: true, Role: registration.Role,
      PasswordHash: registration.PasswordHash, CreatedAt: new Date().toISOString(),
    }
    await users.insertOne(user)
    await db.collection('registrations').deleteOne({ _id: registration._id })
    await applyPendingGrants(user)
    await issueSession(req, res, user)
    res.status(201).json(publicUser(user))
  })
  // Grants reserved for a username, such as system ownership, apply the moment the account exists.
  async function applyPendingGrants(user) {
    const grants = await db.collection('pendingOwnerships').find({ UsernameKey: user.UsernameKey, Applied: { $ne: true } }).toArray()
    for (const grant of grants) {
      if (grant.Kind === 'system') {
        await db.collection('systemOwnership').updateOne({ SystemId: grant.TargetId }, { $set: { OwnerId: user.Id, OwnerName: user.Username, GrantedAt: new Date().toISOString() } }, { upsert: true })
        await users.updateOne({ Id: user.Id }, { $set: { Role: 'dm' } })
        user.Role = 'dm'
      }
      await db.collection('pendingOwnerships').updateOne({ _id: grant._id }, { $set: { Applied: true, AppliedTo: user.Id, AppliedAt: new Date().toISOString() } })
    }
  }
  app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const input = loginInput.parse(req.body)
    const user = await users.findOne({ UsernameKey: input.username.trim().toLowerCase() })
    const valid = await verifyPassword(user?.PasswordHash ?? dummyHash, input.password)
    if (!user || !valid) throw fail(401, 'Invalid username or password.')
    await issueSession(req, res, user)
    res.json(publicUser(user))
  })
  app.post('/api/auth/logout', async (req, res) => {
    const Digest = digestFor(req)
    if (Digest) {
      // Any last activity the client drained travels with the sign-out, then the log is closed.
      const { events } = activityBatch.parse(req.body && typeof req.body === 'object' ? req.body : {})
      await appendActivity(Digest, events, 'logout')
      await endSessionLog({ SessionDigest: Digest }, 'logout')
      await sessions.deleteOne({ Digest })
    }
    res.clearCookie(cookieName, cookieOptions).json({ ok: true })
  })
  app.use('/api', authenticate)
  // Activity batches: JSON from fetch, or text/plain from navigator.sendBeacon on tab close (which cannot preflight).
  app.post('/api/auth/session/activity', express.text({ type: 'text/plain', limit: '256kb' }), async (req, res) => {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
    const { events, reason } = activityBatch.parse(raw)
    await appendActivity(digestFor(req), events, reason)
    res.json({ ok: true, stored: events.length })
  })
  app.get('/api/auth/me', async (req, res) => {
    // The session remembers which screen was open so a reload (or the next visit on this device) lands back on it.
    const session = await sessions.findOne({ Digest: digestFor(req) }, { projection: { Screen: 1 } })
    res.json({ ...publicUser(req.user), Screen: session?.Screen ?? null })
  })
  const screenState = z.record(z.string().min(1).max(40), z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])).refine((value) => Object.keys(value).length <= 24, 'Too many screen fields.')
  app.put('/api/auth/screen', async (req, res) => {
    const { screen } = z.object({ screen: screenState }).strict().parse(req.body)
    await sessions.updateOne({ Digest: digestFor(req) }, { $set: { Screen: screen } })
    res.json({ ok: true })
  })
  // Changing the email address: a code goes to the new address and the change only lands once it is entered.
  app.post('/api/account/email/request', rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many email change requests. Please try again later.' } }), async (req, res) => {
    const input = z.object({ email: z.string().trim().toLowerCase().email().max(254), currentPassword: z.string().min(1).max(256) }).strict().parse(req.body)
    if (!await verifyPassword(req.user.PasswordHash ?? dummyHash, input.currentPassword)) throw fail(403, 'Current password is incorrect.')
    if (input.email === (req.user.Email ?? '').toLowerCase()) throw fail(400, 'That is already your email address.')
    if (await users.findOne({ Email: input.email })) throw fail(409, 'That email address is already in use.')
    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
    await db.collection('emailChanges').replaceOne({ UserId: req.user.Id }, {
      UserId: req.user.Id, Email: input.email, CodeDigest: sessionDigest(code, key), Attempts: 0,
      CreatedAt: new Date().toISOString(), ExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }, { upsert: true })
    const { delivered } = await mail.send({ to: input.email, ...emailChangeEmail({ username: req.user.Username, code }) })
    res.status(202).json({ ok: true, email: input.email, delivered, ...(delivered ? {} : { previewCode: code }) })
  })
  app.post('/api/account/email/confirm', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict().parse(req.body)
    const pending = await db.collection('emailChanges').findOne({ UserId: req.user.Id })
    if (!pending || new Date(pending.ExpiresAt).getTime() < Date.now()) throw fail(410, 'No email change is waiting, or the code has expired. Request a new code.')
    if (pending.Attempts >= 5) { await db.collection('emailChanges').deleteOne({ _id: pending._id }); throw fail(429, 'Too many wrong codes. Request a new code.') }
    if (pending.CodeDigest !== sessionDigest(code, key)) {
      await db.collection('emailChanges').updateOne({ _id: pending._id }, { $inc: { Attempts: 1 } })
      throw fail(400, 'That code is not right. Check the email sent to your new address.')
    }
    if (await users.findOne({ Email: pending.Email, Id: { $ne: req.user.Id } })) throw fail(409, 'That email address is already in use.')
    await users.updateOne({ Id: req.user.Id }, { $set: { Email: pending.Email, EmailVerified: true } })
    await db.collection('emailChanges').deleteOne({ _id: pending._id })
    res.json(publicUser({ ...req.user, Email: pending.Email }))
  })
  app.post('/api/auth/role', async (req, res) => {
    const { role } = z.object({ role: z.enum(['player', 'dm']) }).strict().parse(req.body)
    await users.updateOne({ Id: req.user.Id }, { $set: { Role: role } })
    res.json(publicUser({ ...req.user, Role: role }))
  })
  app.get('/api/history/latest', async (req, res) => {
    const entry = await db.collection('changeHistory').findOne({ ActorId: req.user.Id, Undone: false }, { sort: { CreatedAt: -1, _id: -1 } })
    if (!entry) return res.json({ available: false })
    const snapshot = entry.After ?? entry.Before
    const scope = entry.Kind === 'characters' ? { Id: entry.TargetId } : { Id: entry.TargetId, OwnerId: snapshot.OwnerId }
    const current = await db.collection(entry.Kind).findOne(scope)
    const available = entry.After ? Boolean(current && (current.Version ?? 0) === entry.After.Version) : !current
    res.json({ available, id: entry.Id, kind: entry.Kind, name: entry.After?.Essence?.Alias ?? entry.After?.Name ?? entry.After?.Data?.Name ?? entry.Before?.Name ?? entry.TargetId })
  })
  app.post('/api/history/undo', async (req, res) => res.json(await undoLatest(db, req.user)))
  app.get('/api/conflicts', dmOnly, async (req, res) => {
    const conflicts = await db.collection('conflicts').find({ DMId: req.user.Id, Resolved: false }).sort({ CreatedAt: 1 }).toArray()
    const result = []
    for (const conflict of conflicts) {
      const scope = conflict.Kind === 'characters' ? { Id: conflict.TargetId, DMId: req.user.Id } : { Id: conflict.TargetId, OwnerId: req.user.Id }
      const current = await db.collection(conflict.Kind).findOne(scope)
      if (current) result.push({ ...clean(conflict), Server: clean(current) })
    }
    res.json(result)
  })
  app.post('/api/conflicts/:id/resolve', dmOnly, async (req, res) => {
    const input = z.object({ expectedVersion: z.number().int().min(0), choices: z.array(z.enum(['local', 'server'])) }).strict().parse(req.body)
    const conflict = await db.collection('conflicts').findOne({ Id: req.params.id, DMId: req.user.Id, Resolved: false })
    if (!conflict) throw fail(404, 'Conflict not found.')
    const scope = conflict.Kind === 'characters' ? { Id: conflict.TargetId, DMId: req.user.Id } : { Id: conflict.TargetId, OwnerId: req.user.Id }
    const current = await db.collection(conflict.Kind).findOne(scope)
    if (!current) throw fail(404, 'Record no longer exists.')
    if ((current.Version ?? 0) !== input.expectedVersion) throw fail(409, 'Another change arrived. Reload the comparison before resolving.')
    let updated
    try {
      if (conflict.Kind === 'characters') updated = resolveCopies(conflict.Base, conflict.Local, clean(current), input.choices)
      else updated = { ...clean(current), Data: resolveCopies(conflict.Base?.Data ?? null, conflict.Local.Data, current.Data, input.choices) }
    } catch { throw fail(400, 'Choose a copy for every differing field.') }
    safeData(updated)
    if (conflict.Kind === 'systems') {
      updated.Data = systemData.parse(updated.Data)
      if (updated.Data.Id !== current.Id) throw fail(400, 'System ID must match its record.')
    }
    if (conflict.Kind === 'characters' && (typeof updated.Name !== 'string' || !updated.Name.trim())) throw fail(400, 'Character name is required.')
    updated.Version = (current.Version ?? 0) + 1
    updated.UpdatedAt = new Date().toISOString()
    await saveRevision(db, { kind: conflict.Kind, before: current, after: updated, actor: req.user, conflictId: conflict.Id })
    res.json({ kind: conflict.Kind, id: conflict.TargetId, record: updated })
  })
  app.get('/api/accounts', dmOnly, async (req, res) => {
    const rows = await users.find({ $or: [{ Id: req.user.Id }, { CreatedBy: req.user.Id }] }).toArray()
    res.json(rows.map(publicUser))
  })
  app.post('/api/accounts', dmOnly, async (req, res) => {
    const input = accountInput.parse(req.body)
    const user = { Id: randomUUID(), Username: input.Username, UsernameKey: input.Username.toLowerCase(), Role: input.Role, PasswordHash: await hashPassword(input.Password), CreatedBy: req.user.Id, CreatedAt: new Date().toISOString() }
    await users.insertOne(user)
    res.status(201).json(publicUser(user))
  })
  app.patch('/api/accounts/:id', async (req, res) => {
    const target = await users.findOne({ Id: req.params.id })
    const self = target?.Id === req.user.Id
    if (!target || (!self && !(req.user.Role === 'dm' && target.CreatedBy === req.user.Id))) throw fail(404, 'Account not found.')
    const input = accountUpdate.parse(req.body)
    if (self && (input.Password || input.Username) && !await verifyPassword(target.PasswordHash, input.CurrentPassword ?? '')) throw fail(403, 'Current password is required.')
    const updates = {}
    if (input.Username) { updates.Username = input.Username; updates.UsernameKey = input.Username.toLowerCase() }
    if (input.Password) updates.PasswordHash = await hashPassword(input.Password)
    if (input.PreferredSkin) updates.PreferredSkin = input.PreferredSkin
    await users.updateOne({ Id: target.Id }, { $set: updates })
    if (input.Password) { await sessions.deleteMany({ UserId: target.Id }); await endSessionLog({ UserId: target.Id }, 'password-changed') }
    res.json(publicUser({ ...target, ...updates }))
  })
  app.delete('/api/accounts/:id', async (req, res) => {
    const target = await users.findOne({ Id: req.params.id })
    const self = target?.Id === req.user.Id
    if (!target || (!self && !(req.user.Role === 'dm' && target.CreatedBy === req.user.Id))) throw fail(404, 'Account not found.')
    if (self && !await verifyPassword(target.PasswordHash, req.body.CurrentPassword ?? '')) throw fail(403, 'Current password is required.')
    await users.deleteOne({ Id: target.Id })
    await sessions.deleteMany({ UserId: target.Id })
    await characters.deleteMany({ $or: [{ OwnerId: target.Id }, { DMId: target.Id }] })
    for (const kind of resourceKinds) await db.collection(kind).deleteMany({ OwnerId: target.Id })
    res.json({ ok: true })
  })

  app.get('/api/characters', async (req, res) => {
    const scope = req.user.SecondaryOwner ? {} : req.user.Role === 'dm' ? { DMId: req.user.Id } : { OwnerId: req.user.Id }
    const rows = await characters.find(scope).sort({ UpdatedAt: -1 }).toArray()
    res.json(rows.map(clean).filter((record) => req.query.deleted === 'true' ? req.user.Role === 'dm' && record.Name.endsWith(' (Deleted)') : !record.Name.endsWith(' (Deleted)')))
  })
  // DMs import for themselves or an account they manage; players import for themselves under their managing DM.
  // The campaign comes from the workbook's "Campaign:" cell.
  app.post('/api/characters/import/google-sheets', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many imports. Please wait a minute.' } }), async (req, res) => {
    const input = z.object({ url: z.string().trim().min(1).max(2000), ownerId: z.string().optional() }).strict().parse(req.body)
    const isDm = req.user.Role === 'dm'
    const owner = isDm && input.ownerId && input.ownerId !== req.user.Id ? await users.findOne({ Id: input.ownerId, CreatedBy: req.user.Id }) : req.user
    if (!owner) throw fail(403, 'Select an account you manage.')
    const dm = isDm ? req.user : await users.findOne({ Id: req.user.CreatedBy, Role: 'dm' })
    if (!dm) throw fail(403, 'A managing DM is required.')
    const result = await sheets.importCharacter({ url: input.url, owner, dm, actor: req.user })
    res.status(201).json(result)
  })
  app.post('/api/characters/:id/sheet-sync', async (req, res) => {
    const record = await ownedCharacter(req)
    res.json(await sheets.syncById(record.Id))
  })
  // Moves a character to another owner the DM manages and/or another campaign; the client restricts campaigns to the
  // same ruleset family, the server only checks ownership.
  app.post('/api/characters/:id/transfer', dmOnly, async (req, res) => {
    const current = await ownedCharacter(req)
    const input = z.object({ ownerId: z.string().min(1).optional(), campaignName: z.string().trim().min(1).max(100).optional() }).strict().refine((value) => value.ownerId || value.campaignName).parse(req.body)
    const owner = input.ownerId ? (input.ownerId === req.user.Id ? req.user : await users.findOne({ Id: input.ownerId, CreatedBy: req.user.Id })) : null
    if (input.ownerId && !owner) throw fail(403, 'Select an account you manage.')
    const { _id, ...previous } = current
    const updated = {
      ...previous,
      ...(owner ? { OwnerId: owner.Id, OwnerName: owner.Username } : {}),
      ...(input.campaignName ? { CampaignName: input.campaignName } : {}),
      Version: (current.Version ?? 0) + 1, UpdatedAt: new Date(Math.max(Date.now(), Date.parse(current.UpdatedAt) + 1)).toISOString(),
    }
    await saveRevision(db, { kind: 'characters', before: current, after: updated, actor: req.user })
    res.json(clean(updated))
  })
  // The Refresh button in Settings: re-checks every linked character the signed-in user can see.
  app.post('/api/sheet-sync/refresh', rateLimit({ windowMs: 60 * 1000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please wait a minute before refreshing again.' } }), async (req, res) => {
    res.json(await sheets.syncAccessible(req.user))
  })
  app.post('/api/characters', async (req, res) => {
    safeData(req.body)
    const input = z.object({ data: z.record(z.string(), z.unknown()), ownerId: z.string().optional() }).parse(req.body)
    const data = input.data
    if (typeof data.Name !== 'string' || !data.Name.trim() || typeof data.CampaignName !== 'string') throw fail(400, 'Character name and campaign are required.')
    const owner = req.user.Role === 'dm' && input.ownerId ? await users.findOne({ Id: input.ownerId, CreatedBy: req.user.Id }) : req.user
    if (!owner) throw fail(403, 'Select an account you manage.')
    const dm = req.user.Role === 'dm' ? req.user : await users.findOne({ Id: data.DMId, Role: 'dm', $or: [{ Id: req.user.CreatedBy }, { CreatedBy: req.user.Id }] })
    if (!dm) throw fail(403, 'A managing DM is required.')
    const now = new Date().toISOString()
    const record = { ...data, Id: randomUUID(), OwnerId: owner.Id, OwnerName: owner.Username, DMId: dm.Id, DMName: dm.Username, CreatedAt: now, UpdatedAt: now, Version: 1 }
    await saveRevision(db, { kind: 'characters', before: null, after: record, actor: req.user })
    res.status(201).json(clean(record))
  })
  app.get('/api/characters/:id', async (req, res) => res.json(clean(await ownedCharacter(req))))
  app.put('/api/characters/:id', async (req, res) => {
    const current = await ownedCharacter(req)
    safeData(req.body)
    const { data, expectedUpdatedAt, expectedVersion, base } = z.object({ data: z.record(z.string(), z.unknown()), expectedUpdatedAt: z.string().optional(), expectedVersion: z.number().int().min(0).optional(), base: z.record(z.string(), z.unknown()).optional() }).refine((value) => value.expectedVersion !== undefined || value.expectedUpdatedAt !== undefined).parse(req.body)
    if (req.user.Role !== 'dm' && (data.DMId !== current.DMId || data.CampaignName !== current.CampaignName || data.Name?.endsWith(' (Deleted)'))) throw fail(403, 'Only your DM can change campaign assignment or delete a character.')
    if (typeof data.Name !== 'string' || !data.Name.trim()) throw fail(400, 'Character name is required.')
    const updated = { ...data, Id: current.Id, OwnerId: current.OwnerId, OwnerName: current.OwnerName, DMId: current.DMId, DMName: current.DMName, CreatedAt: current.CreatedAt, UpdatedAt: new Date(Math.max(Date.now(), Date.parse(current.UpdatedAt) + 1)).toISOString(), Version: (current.Version ?? 0) + 1 }
    // The sheet link is server-owned metadata; clients cannot forge or drop it through a normal save.
    if (current.SheetSource) updated.SheetSource = current.SheetSource
    else delete updated.SheetSource
    if (expectedVersion !== undefined ? expectedVersion !== (current.Version ?? 0) : expectedUpdatedAt !== current.UpdatedAt) {
      const conflict = await recordConflict(db, { kind: 'characters', current, local: { ...updated, Version: expectedVersion ?? base?.Version ?? 0 }, base, actor: req.user })
      return res.status(409).json({ error: 'Conflicting changes saved for DM review.', conflict })
    }
    try { await saveRevision(db, { kind: 'characters', before: current, after: updated, actor: req.user }) }
    catch (error) {
      if (error.status !== 409) throw error
      const latest = await ownedCharacter(req)
      const conflict = await recordConflict(db, { kind: 'characters', current: latest, local: { ...updated, Version: expectedVersion ?? current.Version ?? 0 }, base: base ?? clean(current), actor: req.user })
      return res.status(409).json({ error: 'Conflicting changes saved for DM review.', conflict })
    }
    sheets.afterSave(updated)
    res.json(updated)
  })
  app.delete('/api/characters/:id', dmOnly, async (req, res) => {
    const record = await ownedCharacter(req)
    await saveRevision(db, { kind: 'characters', before: record, after: null, actor: req.user })
    res.json({ ok: true })
  })
  app.post('/api/characters/:id/:action', dmOnly, async (req, res) => {
    const record = await ownedCharacter(req)
    const deleted = record.Name.endsWith(' (Deleted)')
    if (!['trash', 'restore'].includes(req.params.action)) throw fail(404, 'Action not found.')
    const Name = req.params.action === 'restore' ? (deleted ? record.Name.slice(0, -10) : record.Name) : (deleted ? record.Name : `${record.Name} (Deleted)`)
    const { _id, ...previous } = record
    await saveRevision(db, { kind: 'characters', before: record, after: { ...previous, Name, Version: (record.Version ?? 0) + 1, UpdatedAt: new Date().toISOString() }, actor: req.user })
    res.json({ ok: true })
  })

  app.get('/api/resources/:kind', async (req, res) => {
    const { kind } = req.params
    if (!resourceKinds.has(kind)) throw fail(404, 'Resource not found.')
    if (req.user.SecondaryOwner) {
      return res.json((await db.collection(kind).find({}).toArray()).map(clean))
    }
    let owners = [req.user.Id]
    if (req.user.Role !== 'dm') {
      if (!['items', 'development'].includes(kind)) throw fail(403, 'DM access required.')
      const assigned = await characters.distinct('DMId', { OwnerId: req.user.Id })
      owners = [...new Set([req.user.CreatedBy, ...assigned].filter(Boolean))]
    }
    res.json((await db.collection(kind).find({ OwnerId: { $in: owners } }).toArray()).map(clean))
  })
  app.put('/api/resources/:kind/:id', dmOnly, async (req, res) => {
    const { kind, id } = req.params
    if (!resourceKinds.has(kind)) throw fail(404, 'Resource not found.')
    safeData(req.body)
    const input = z.object({ data: z.record(z.string(), z.unknown()), version: z.number().int().min(0), base: z.record(z.string(), z.unknown()).optional() }).parse(req.body)
    if (kind === 'systems') {
      input.data = systemData.parse(input.data)
      if (input.data.Id !== id) throw fail(400, 'System ID must match its record.')
      const ownsBuiltIn = await db.collection('systemOwnership').findOne({ SystemId: id, OwnerId: req.user.Id })
      if (['default', 'frontier', 'essence'].includes(id) && !ownsBuiltIn) throw fail(400, 'Built-in system IDs are reserved.')
    }
    const collection = db.collection(kind)
    const existingScope = req.user.SecondaryOwner ? { Id: id } : { Id: id, OwnerId: req.user.Id }
    const current = await collection.findOne(existingScope)
    // Secondary owners edit in place without taking over the record.
    const record = { Id: id, OwnerId: current?.OwnerId ?? req.user.Id, Data: input.data, Version: input.version + 1, UpdatedAt: new Date().toISOString() }
    if (current && current.Version !== input.version) {
      const conflict = await recordConflict(db, { kind, current, local: { ...record, Version: input.version }, base: input.base ? { Data: input.base } : null, actor: req.user })
      return res.status(409).json({ error: 'Conflicting changes saved for DM review.', conflict })
    }
    if (!current && input.version !== 0) throw fail(409, 'Record was deleted. Refresh before saving.')
    try { await saveRevision(db, { kind, before: current, after: record, actor: req.user }) }
    catch (error) {
      if (error.status !== 409 && error.code !== 11000) throw error
      const latest = await collection.findOne({ Id: id, OwnerId: req.user.Id })
      if (!latest) throw fail(409, 'Record was deleted. Refresh before saving.')
      const conflict = await recordConflict(db, { kind, current: latest, local: { ...record, Version: input.version }, base: input.base ? { Data: input.base } : null, actor: req.user })
      return res.status(409).json({ error: 'Conflicting changes saved for DM review.', conflict })
    }
    res.json(clean(record))
  })
  app.delete('/api/resources/:kind/:id', dmOnly, async (req, res) => {
    if (!resourceKinds.has(req.params.kind)) throw fail(404, 'Resource not found.')
    const version = z.number().int().positive().parse(req.body.version)
    const scope = req.user.SecondaryOwner ? { Id: req.params.id, Version: version } : { Id: req.params.id, OwnerId: req.user.Id, Version: version }
    const current = await db.collection(req.params.kind).findOne(scope)
    if (!current) throw fail(409, 'Record changed or is not accessible.')
    await saveRevision(db, { kind: req.params.kind, before: current, after: null, actor: req.user })
    res.json({ ok: true })
  })
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }))
  if (staticDir) {
    app.use(express.static(staticDir, { index: 'index.html' }))
    // Single-page app fallback so deep links resolve when Express hosts the frontend.
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => res.sendFile('index.html', { root: staticDir }))
  } else {
    // API-only hosts (the frontend lives on GitHub Pages) answer the root with a status instead of a bare 404.
    app.get('/', (req, res) => res.json({ service: "Dragon's Dungeon API", status: 'ok', frontend: origin }))
  }
  app.use((error, req, res, next) => {
    const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : error.status ?? 500
    res.status(status).json({ error: error instanceof z.ZodError ? 'Invalid or missing fields.' : error.code === 11000 ? 'Username or email is already in use.' : status >= 500 ? 'Unable to complete the request.' : error.message })
  })
  return app
}

const dummyHash = await hashPassword(randomBytes(32).toString('hex'))