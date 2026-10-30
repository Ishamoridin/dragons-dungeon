import { OAuth2Client } from 'google-auth-library'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import { sessionDigest } from './security.mjs'

export function googleProvider(config) {
  const client = new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri })
  return {
    authorizationUrl({ state, nonce, challenge }) {
      return client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], access_type: 'online', prompt: 'select_account', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })
    },
    async identity({ code, verifier, nonce }) {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier })
      if (!tokens.id_token) throw new Error('Google did not return an identity token.')
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId })
      const payload = ticket.getPayload()
      if (!payload?.sub || !payload.email_verified || payload.nonce !== nonce) throw new Error('Google identity validation failed.')
      return { subject: payload.sub, email: payload.email }
    },
  }
}

export function mountGoogleAuth(app, db, { key, origin, secureCookies, google, providerOverride, issueSession, findCurrentUser }) {
  const enabled = Boolean(providerOverride || (google?.clientId && google?.clientSecret))
  const provider = providerOverride ?? (enabled ? googleProvider(google) : null)
  const states = db.collection('oauthStates')
  const users = db.collection('users')
  const cookieName = secureCookies ? '__Secure-dd_google' : 'dd_google'
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/api/auth/google' }
  const redirect = (res, code) => res.redirect(`${origin}/?authError=${code}`)

  app.get('/api/auth/providers', (req, res) => res.json({ google: enabled }))
  app.get('/api/auth/google/start', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many Google sign-in attempts. Try again later.' } }), async (req, res) => {
    if (!provider) return redirect(res, 'google_not_configured')
    const role = req.query.role ?? 'player'
    if (!['player', 'dm'].includes(role)) return res.status(400).json({ error: 'Invalid account mode.' })
    const linking = req.query.link === '1'
    const current = linking ? await findCurrentUser(req) : null
    if (linking && !current) return redirect(res, 'signin_required')
    const state = randomBytes(32).toString('base64url')
    const nonce = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await states.insertOne({ Digest: sessionDigest(state, key), Nonce: nonce, Verifier: verifier, Role: role, LinkUserId: current?.Id ?? null, ExpiresAt: expires })
    res.cookie(cookieName, state, { ...cookieOptions, expires })
    res.redirect(provider.authorizationUrl({ state, nonce, challenge }))
  })
  app.get('/api/auth/google/callback', async (req, res) => {
    if (!provider) return redirect(res, 'google_not_configured')
    const state = req.query.state
    const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    res.clearCookie(cookieName, cookieOptions)
    if (typeof state !== 'string' || state.length > 128 || !cookie || cookie.length > 128) return redirect(res, 'google_state')
    const digest = sessionDigest(state, key)
    if (!timingSafeEqual(Buffer.from(digest), Buffer.from(sessionDigest(cookie, key)))) return redirect(res, 'google_state')
    const pending = await states.findOneAndDelete({ Digest: digest, ExpiresAt: { $gt: new Date() } })
    if (!pending) return redirect(res, 'google_state')
    if (req.query.error) return redirect(res, 'google_cancelled')
    if (typeof req.query.code !== 'string' || req.query.code.length > 4096) return redirect(res, 'google_failed')
    try {
      const identity = await provider.identity({ code: req.query.code, verifier: pending.Verifier, nonce: pending.Nonce })
      const subject = z.string().min(1).max(255).parse(identity.subject)
      const email = z.string().email().max(254).parse(identity.email).toLowerCase()
      let user = await users.findOne({ GoogleSub: subject })
      if (pending.LinkUserId) {
        if (user && user.Id !== pending.LinkUserId) return redirect(res, 'google_already_linked')
        user = await users.findOne({ Id: pending.LinkUserId })
        if (!user) return redirect(res, 'signin_required')
        const updates = { GoogleSub: subject, GoogleEmail: email }
        if (!user.Email) { updates.Email = email; updates.EmailVerified = true }
        else if (user.Email === email) updates.EmailVerified = true
        await users.updateOne({ Id: user.Id }, { $set: updates })
        user = { ...user, ...updates }
      } else if (!user) {
        if (await users.findOne({ Email: email })) return redirect(res, 'google_account_exists')
        const id = randomUUID()
        user = { Id: id, Username: `google-${id}`, UsernameKey: `google-${id}`, Email: email, EmailVerified: true, GoogleSub: subject, GoogleEmail: email, Role: pending.Role, CreatedAt: new Date().toISOString() }
        await users.insertOne({ ...user })
      }
      await issueSession(req, res, user)
      res.redirect(`${origin}/`)
    } catch { redirect(res, 'google_failed') }
  })
}