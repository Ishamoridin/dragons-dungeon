import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { canAccessCharacter, hashPassword, publicUser, sessionDigest, verifyPassword } from './security.mjs'
import { recordConflict, saveRevision, undoLatest } from './character-history.mjs'
import { resolveCopies } from '../src/character/RevisionMerge.mjs'
import { mountGoogleAuth } from './google-auth.mjs'

const username = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/)
const password = z.string().min(12).max(256)
const accountInput = z.object({ Username: username, Password: password, Role: z.enum(['player', 'dm']) }).strict()
const loginInput = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) }).strict()
const registrationInput = z.object({ email: z.string().trim().toLowerCase().email().max(254), username, password, role: z.enum(['player', 'dm']).default('player') }).strict()
const accountUpdate = z.object({ Username: username.optional(), Password: password.optional(), PreferredSkin: z.enum(['basalt', 'tideglass', 'wildwood', 'moonstone', 'matrix', 'sao', 'startrek']).optional(), CurrentPassword: z.string().max(256).optional() }).strict()
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
    ...[...resourceKinds].map((kind) => db.collection(kind).createIndex({ OwnerId: 1, Id: 1 }, { unique: true })),
  ])
}

export function createApp(db, { key, origin = 'http://localhost:5173', secureCookies = false, crossSiteCookies = false, staticDir, google, googleProvider } = {}) {
  if (!key || Buffer.byteLength(key) < 32) throw new Error('ENCRYPTION_KEY must contain at least 32 bytes for session protection.')
  const app = express()
  app.disable('x-powered-by')
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
  const users = db.collection('users')
  const sessions = db.collection('sessions')
  const characters = db.collection('characters')
  const cookieName = secureCookies ? '__Host-dd_session' : 'dd_session'
  // Cross-site cookies require SameSite=None with Secure for an API hosted apart from the frontend.
  const cookieOptions = { httpOnly: true, secure: secureCookies || crossSiteCookies, sameSite: crossSiteCookies ? 'none' : 'strict', path: '/' }
  const digestFor = (req) => {
    const raw = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    return raw ? sessionDigest(raw, key) : null
  }
  const findCurrentUser = async (req) => {
    const Digest = digestFor(req)
    const session = Digest && await sessions.findOne({ Digest, ExpiresAt: { $gt: new Date() } })
    return session && await users.findOne({ Id: session.UserId })
  }
  const authenticate = async (req, res, next) => {
    const user = await findCurrentUser(req)
    if (!user) return next(fail(401, 'Please sign in.'))
    req.user = user
    next()
  }
  const dmOnly = (req, res, next) => req.user.Role === 'dm' ? next() : next(fail(403, 'DM access required.'))
  const ownedCharacter = async (req) => {
    const record = await characters.findOne({ Id: req.params.id })
    if (!record || !canAccessCharacter(record, req.user)) throw fail(404, 'Character not found.')
    return record
  }
  const issueSession = async (req, res, user) => {
    const oldDigest = digestFor(req)
    if (oldDigest) await sessions.deleteOne({ Digest: oldDigest })
    const token = randomBytes(32).toString('base64url')
    const ExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await sessions.insertOne({ Digest: sessionDigest(token, key), UserId: user.Id, ExpiresAt })
    res.cookie(cookieName, token, { ...cookieOptions, expires: ExpiresAt })
  }
  mountGoogleAuth(app, db, { key, origin, secureCookies, google, providerOverride: googleProvider, issueSession, findCurrentUser })

  app.post('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many registration attempts. Please try again later.' } }), async (req, res) => {
    const input = registrationInput.parse(req.body)
    const user = {
      Id: randomUUID(), Username: input.username, UsernameKey: input.username.toLowerCase(),
      Email: input.email, EmailVerified: false, Role: input.role,
      PasswordHash: await hashPassword(input.password), CreatedAt: new Date().toISOString(),
    }
    await users.insertOne(user)
    res.status(201).json(publicUser(user))
  })
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
    if (Digest) await sessions.deleteOne({ Digest })
    res.clearCookie(cookieName, cookieOptions).json({ ok: true })
  })
  app.use('/api', authenticate)
  app.get('/api/auth/me', (req, res) => res.json(publicUser(req.user)))
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
    if (input.Password) await sessions.deleteMany({ UserId: target.Id })
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
    const scope = req.user.Role === 'dm' ? { DMId: req.user.Id } : { OwnerId: req.user.Id }
    const rows = await characters.find(scope).sort({ UpdatedAt: -1 }).toArray()
    res.json(rows.map(clean).filter((record) => req.query.deleted === 'true' ? req.user.Role === 'dm' && record.Name.endsWith(' (Deleted)') : !record.Name.endsWith(' (Deleted)')))
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
      if (['default', 'frontier', 'essence'].includes(id)) throw fail(400, 'Built-in system IDs are reserved.')
      if (input.data.Id !== id) throw fail(400, 'System ID must match its record.')
    }
    const collection = db.collection(kind)
    const record = { Id: id, OwnerId: req.user.Id, Data: input.data, Version: input.version + 1, UpdatedAt: new Date().toISOString() }
    const current = await collection.findOne({ Id: id, OwnerId: req.user.Id })
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
    const current = await db.collection(req.params.kind).findOne({ Id: req.params.id, OwnerId: req.user.Id, Version: version })
    if (!current) throw fail(409, 'Record changed or is not accessible.')
    await saveRevision(db, { kind: req.params.kind, before: current, after: null, actor: req.user })
    res.json({ ok: true })
  })
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }))
  if (staticDir) {
    app.use(express.static(staticDir, { index: 'index.html' }))
    // Single-page app fallback so deep links resolve when Express hosts the frontend.
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => res.sendFile('index.html', { root: staticDir }))
  }
  app.use((error, req, res, next) => {
    const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : error.status ?? 500
    res.status(status).json({ error: error instanceof z.ZodError ? 'Invalid or missing fields.' : error.code === 11000 ? 'Username or email is already in use.' : status >= 500 ? 'Unable to complete the request.' : error.message })
  })
  return app
}

const dummyHash = await hashPassword(randomBytes(32).toString('hex'))