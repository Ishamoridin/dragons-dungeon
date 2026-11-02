import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { canSeeChange, createRealtime, describeChange } from './realtime.mjs'
import { announceChange, revisionEvents } from './character-history.mjs'

const dm = { Id: 'dm-1', Role: 'dm', Username: 'dm' }
const otherDm = { Id: 'dm-2', Role: 'dm', Username: 'other' }
const player = { Id: 'p-1', Role: 'player', Username: 'p1' }
const stranger = { Id: 'p-2', Role: 'player', Username: 'p2' }
const character = { Id: 'c-1', OwnerId: 'p-1', DMId: 'dm-1', Version: 3 }

test('describeChange names the write without carrying the record body', () => {
  const event = describeChange({ kind: 'characters', before: null, after: { ...character, Essence: { secret: true } }, actor: dm })
  assert.equal(event.action, 'create')
  assert.equal(event.id, 'c-1')
  assert.equal(event.version, 3)
  assert.equal(event.actorId, 'dm-1')
  assert.deepEqual(Object.keys(event.record), ['Id', 'OwnerId', 'DMId'])
  assert.equal(describeChange({ kind: 'characters', before: character, after: null, actor: dm }).action, 'delete')
  assert.equal(describeChange({ kind: 'characters', before: character, after: character, actor: dm }).action, 'update')
})

test('changes only reach users who can see the record', () => {
  const event = describeChange({ kind: 'characters', before: character, after: character, actor: dm })
  assert.equal(canSeeChange(dm, event), true)
  assert.equal(canSeeChange(player, event), true)
  assert.equal(canSeeChange(otherDm, event), false)
  assert.equal(canSeeChange(stranger, event), false)
  assert.equal(canSeeChange({ ...stranger, SecondaryOwner: true }, event), true)
  const resource = describeChange({ kind: 'systems', before: null, after: { Id: 's-1', OwnerId: 'dm-1', Version: 1 }, actor: dm })
  assert.equal(canSeeChange(dm, resource), true)
  assert.equal(canSeeChange(otherDm, resource), false)
  assert.equal(canSeeChange(player, resource), true)
  assert.equal(canSeeChange(null, resource), false)
})

test('authenticated sockets receive announced writes; others are refused', async () => {
  const realtime = createRealtime()
  const onChange = (change) => realtime.publish(describeChange(change))
  revisionEvents.on('change', onChange)
  const server = createServer((req, res) => { res.statusCode = 404; res.end() })
  realtime.attach(server, { authenticate: async (req) => (req.headers.cookie === 'dd_session=dm' ? dm : req.headers.cookie === 'dd_session=p2' ? stranger : null) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `ws://127.0.0.1:${server.address().port}/api/events`
  try {
    const refused = new WebSocket(url)
    const [error] = await once(refused, 'error')
    assert.match(error.message, /401/)

    const dmSocket = new WebSocket(url, { headers: { cookie: 'dd_session=dm' } })
    const strangerSocket = new WebSocket(url, { headers: { cookie: 'dd_session=p2' } })
    const dmMessages = []
    const strangerMessages = []
    dmSocket.on('message', (data) => dmMessages.push(JSON.parse(String(data))))
    strangerSocket.on('message', (data) => strangerMessages.push(JSON.parse(String(data))))
    await Promise.all([once(dmSocket, 'message'), once(strangerSocket, 'message')])
    assert.equal(dmMessages[0].type, 'hello')

    const delivered = once(dmSocket, 'message')
    announceChange({ kind: 'characters', before: character, after: { ...character, Version: 4 }, actor: player })
    await delivered
    const change = dmMessages.find((message) => message.type === 'change')
    assert.deepEqual(change, { type: 'change', kind: 'characters', id: 'c-1', action: 'update', version: 4, actorId: 'p-1' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(strangerMessages.filter((message) => message.type === 'change').length, 0)
    dmSocket.close(); strangerSocket.close()
  } finally {
    revisionEvents.off('change', onChange)
    realtime.close()
    server.closeAllConnections?.()
    server.close()
  }
})
