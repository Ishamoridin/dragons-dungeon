import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { hashPassword } from './security.mjs'
import { rollDice, rollInput, rollRecipients, visibleRollFor, MAX_DICE, naturalD20, applyReaction, reactionInput } from './dice.mjs'

// A deterministic rng: returns the queued values in order, or the midpoint when the queue runs dry.
const rig = (...values) => (sides) => values.length ? values.shift() : Math.ceil(sides / 2)

test('formulas roll, add modifiers, and follow arithmetic with parentheses', () => {
  const basic = rollDice('1d20+7', rig(13))
  assert.equal(basic.total, 20)
  assert.equal(basic.maxTotal, 27)
  assert.deepEqual(basic.rolls, [{ sides: 20, results: [13] }])

  const fire = rollDice('(1d200+500)*4', rig(150))
  assert.equal(fire.total, (150 + 500) * 4)
  assert.equal(fire.maxTotal, (200 + 500) * 4)

  const many = rollDice('3d6 + 2d10 - 4', rig(1, 2, 3, 9, 10))
  assert.equal(many.total, 1 + 2 + 3 + 9 + 10 - 4)
  assert.equal(many.maxTotal, 18 + 20 - 4)
  assert.deepEqual(many.rolls.map((group) => group.sides), [6, 10])

  assert.equal(rollDice('1d20/2', rig(7)).total, 3.5)
  assert.equal(rollDice('-1d6+10', rig(4)).total, 6)
  assert.equal(rollDice('2D8', rig(8, 8)).total, 16, 'an uppercase D works')
})

test('bad formulas are refused with a dice error', () => {
  for (const formula of ['', '5+5', '1d1', 'd0', `${MAX_DICE + 1}d6`, '1d20+', '(1d6', '1d6)', '1d6+bogus', '1d6/0', '1d99999']) {
    assert.throws(() => rollDice(formula, rig()), (error) => error.dice === true, `"${formula}" should be refused`)
  }
})

test('the roll schema bounds every field and fills defaults', () => {
  const valid = { CampaignName: 'Ashen Vale', Formula: '1d20+7' }
  const parsed = rollInput.parse(valid)
  assert.equal(parsed.Secret, false)
  assert.equal(parsed.Label, '')
  assert.deepEqual(parsed.Tokens, [])
  assert.equal(rollInput.safeParse({ ...valid, Formula: 'x'.repeat(301) }).success, false)
  assert.equal(rollInput.safeParse({ ...valid, Label: 'x'.repeat(121) }).success, false)
  assert.equal(rollInput.safeParse({ ...valid, Tokens: [{ Name: 'Brawl', Value: Infinity }] }).success, false)
  assert.equal(rollInput.safeParse({ ...valid, Extra: true }).success, false)
})

const roll = { _id: 'mongo', Id: 'r1', DMId: 'dm', RollerId: 'p1', CampaignName: 'Ashen Vale', Total: 18, Secret: false }

test('the DM and the roller always see a roll; the pool sees shared rolls only', () => {
  assert.equal(visibleRollFor({ Id: 'dm', Role: 'dm' }, roll).Id, 'r1')
  assert.equal('_id' in visibleRollFor({ Id: 'dm', Role: 'dm' }, roll), false)
  assert.equal(visibleRollFor({ Id: 'other-dm', Role: 'dm' }, roll), null)
  assert.equal(visibleRollFor({ Id: 'p1', Role: 'player' }, roll).Id, 'r1')
  assert.equal(visibleRollFor({ Id: 'p2', Role: 'player' }, roll), null, 'a non-sharer sees nothing')
  assert.equal(visibleRollFor({ Id: 'p2', Role: 'player' }, roll, new Set(['p1', 'p2'])).Id, 'r1', 'both in the pool: visible')
  assert.equal(visibleRollFor({ Id: 'p2', Role: 'player' }, roll, new Set(['p2'])), null, 'the roller must share too')
  assert.equal(visibleRollFor({ Id: 'p2', Role: 'player', SecondaryOwner: true }, roll).Id, 'r1')
})

test('secret rolls stay between the DM and the roller even inside the pool', () => {
  const secret = { ...roll, Secret: true }
  const pool = new Set(['p1', 'p2'])
  assert.equal(visibleRollFor({ Id: 'p2', Role: 'player' }, secret, pool), null)
  assert.equal(visibleRollFor({ Id: 'p1', Role: 'player' }, secret, pool).Id, 'r1')
  assert.deepEqual(rollRecipients(secret, pool), ['dm', 'p1'])
})

test('recipients are the DM, the roller, and the pool when the roller shares', () => {
  assert.deepEqual(rollRecipients(roll), ['dm', 'p1'])
  assert.deepEqual(rollRecipients(roll, new Set(['p1', 'p2', 'p3'])), ['dm', 'p1', 'p2', 'p3'])
  assert.deepEqual(rollRecipients(roll, new Set(['p2', 'p3'])), ['dm', 'p1'], 'a non-sharing roller stays private')
  assert.deepEqual(rollRecipients({ ...roll, RollerId: 'dm' }, new Set(['p2'])), ['dm'], 'a DM outside the pool rolls to themselves')
})

test('only a plain single d20 counts as a natural roll', () => {
  assert.equal(naturalD20([{ sides: 20, results: [20] }]), 20)
  assert.equal(naturalD20([{ sides: 20, results: [1] }]), 1)
  assert.equal(naturalD20([{ sides: 20, results: [12] }]), 12)
  assert.equal(naturalD20([{ sides: 20, results: [20, 20] }]), null, 'two d20s are not a natural')
  assert.equal(naturalD20([{ sides: 6, results: [6] }]), null)
  assert.equal(naturalD20([{ sides: 20, results: [20] }, { sides: 6, results: [6] }]), null)
})

test('reactions fit the natural, never the roller, and replace a previous one', () => {
  const now = new Date('2026-11-03T12:00:00Z')
  const nat20 = { ...roll, Rolls: [{ sides: 20, results: [20] }] }
  const nat1 = { ...roll, Rolls: [{ sides: 20, results: [1] }] }
  const plain = { ...roll, Rolls: [{ sides: 20, results: [12] }] }
  const viewer = { Id: 'p2', Username: 'playertwo' }

  const cheered = applyReaction(nat20, viewer, 'celebrate', now)
  assert.equal(cheered.ok, true)
  assert.deepEqual(cheered.reactions, [{ UserId: 'p2', Username: 'playertwo', Reaction: 'celebrate', CreatedAt: now.toISOString() }])

  const replaced = applyReaction({ ...nat20, Reactions: cheered.reactions }, viewer, 'envy', now)
  assert.equal(replaced.reactions.length, 1)
  assert.equal(replaced.reactions[0].Reaction, 'envy')

  const second = applyReaction({ ...nat20, Reactions: cheered.reactions }, { Id: 'dm', Username: 'dmone' }, 'lucky', now)
  assert.equal(second.reactions.length, 2, 'different users stack')

  assert.equal(applyReaction(nat20, viewer, 'laugh', now).ok, false, 'a natural 1 reaction does not fit a 20')
  assert.equal(applyReaction(nat1, viewer, 'commiserate', now).ok, true)
  assert.equal(applyReaction(nat1, viewer, 'celebrate', now).ok, false)
  assert.equal(applyReaction(plain, viewer, 'celebrate', now).ok, false, 'an ordinary roll takes no reactions')
  assert.equal(applyReaction(nat20, { Id: 'p1', Username: 'playerone' }, 'celebrate', now).ok, false, 'no self-reactions')

  assert.equal(reactionInput.safeParse({ reaction: 'celebrate' }).success, true)
  assert.equal(reactionInput.safeParse({ reaction: 'wave' }).success, false)
})

test('rolls are stored, scoped by campaign and pool, and naturals take reactions', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const { client } = await connectDatabase()
  const db = client.db(`dd_rolls_${randomUUID().replaceAll('-', '').slice(0, 24)}`)
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
    await db.collection('characters').insertMany([character('c-1', 'p-1', 'Aria'), character('c-2', 'p-2', 'Bram'), character('c-3', 'p-3', 'Cass')])
    server = createApp(db, { key: 'dice-roll-test-key-with-at-least-32-bytes' }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}/api`
    const call = async (path, method = 'GET', body, cookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json() , cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const login = async (username) => (await call('/auth/login', 'POST', { username, password })).cookie
    const [dm, p1, p2, p3] = await Promise.all(['dmone', 'playerone', 'playertwo', 'playerthree'].map(login))

    const payload = { CampaignName: 'Ashen Vale', Command: '/r Brawl Melee Attack', Formula: '1d20+7', Label: 'Melee Attack', Tokens: [{ Name: 'Brawl', Value: 7 }], CharacterId: 'c-1', Secret: false }
    const created = await call('/rolls', 'POST', payload, p1)
    assert.equal(created.status, 201)
    assert.equal(created.data.CharacterName, 'Aria')
    assert.equal(created.data.DMId, 'dm-1')
    assert.ok(created.data.Total >= 8 && created.data.Total <= 27, 'a d20 plus 7 lands between 8 and 27')
    assert.equal(created.data.MaxTotal, 27)
    assert.equal(created.data.Rolls[0].sides, 20)

    assert.equal((await call('/rolls', 'POST', { ...payload, CharacterId: 'c-2' }, p1)).status, 403, 'you can only roll as your own character')
    assert.equal((await call('/rolls', 'POST', { ...payload, Formula: '5+5' }, p1)).status, 400, 'a formula needs dice')
    assert.equal((await call('/rolls', 'POST', { ...payload, CampaignName: 'Nowhere', CharacterId: undefined }, p1)).status, 404, 'players roll only in their campaigns')

    assert.equal((await call('/rolls?campaign=Ashen%20Vale', 'GET', undefined, dm)).data.rolls.length, 1, 'the DM sees the roll')
    assert.equal((await call('/rolls', 'GET', undefined, p2)).data.rolls.length, 0, 'outside the pool nothing is shared')

    await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: true }, p1)
    await call('/event-log/sharing', 'PUT', { campaign: 'Ashen Vale', sharing: true }, p2)
    assert.equal((await call('/rolls', 'GET', undefined, p2)).data.rolls.length, 1, 'pool members see shared rolls')
    assert.equal((await call('/rolls', 'GET', undefined, p3)).data.rolls.length, 0, 'non-sharers still see nothing')

    const secret = await call('/rolls', 'POST', { ...payload, Secret: true, Label: 'Sneak' }, p1)
    assert.equal(secret.status, 201)
    assert.equal((await call('/rolls', 'GET', undefined, p2)).data.rolls.length, 1, 'secret rolls stay off the pool')
    assert.equal((await call('/rolls', 'GET', undefined, dm)).data.rolls.length, 2, 'the DM sees secrets')

    // Force the first roll into a natural 20, then react to it.
    await db.collection('rollLog').updateOne({ Id: created.data.Id }, { $set: { Rolls: [{ sides: 20, results: [20] }], Total: 27 } })
    assert.equal((await call(`/rolls/${created.data.Id}/react`, 'POST', { reaction: 'laugh' }, p2)).status, 400, 'a natural 20 is nothing to laugh at')
    assert.equal((await call(`/rolls/${created.data.Id}/react`, 'POST', { reaction: 'celebrate' }, p1)).status, 400, 'no reacting to your own roll')
    assert.equal((await call(`/rolls/${created.data.Id}/react`, 'POST', { reaction: 'celebrate' }, p3)).status, 404, 'invisible rolls cannot be reacted to')
    const cheered = await call(`/rolls/${created.data.Id}/react`, 'POST', { reaction: 'celebrate' }, p2)
    assert.equal(cheered.status, 200)
    assert.deepEqual(cheered.data.reactions.map((entry) => [entry.Username, entry.Reaction]), [['playertwo', 'celebrate']])
    const luck = await call(`/rolls/${created.data.Id}/react`, 'POST', { reaction: 'lucky' }, dm)
    assert.equal(luck.data.reactions.length, 2, 'the DM piles on')
    const listed = (await call('/rolls?campaign=Ashen%20Vale', 'GET', undefined, p1)).data.rolls.find((entry) => entry.Id === created.data.Id)
    assert.equal(listed.Reactions.length, 2, 'reactions ride along with the log')
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
    try { await db.dropDatabase() } finally { await client.close() }
  }
})
