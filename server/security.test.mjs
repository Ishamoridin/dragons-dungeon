import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessCharacter, hashPassword, publicUser, sessionDigest, verifyPassword } from './security.mjs'

test('passwords are salted Argon2id hashes and only the correct password verifies', async () => {
  const hash = await hashPassword('a-test-password')
  assert.match(hash, /^\$argon2id\$/)
  assert.notEqual(hash, await hashPassword('a-test-password'))
  assert.equal(await verifyPassword(hash, 'a-test-password'), true)
  assert.equal(await verifyPassword(hash, 'wrong-password'), false)
})

test('character access is limited to the owner or assigned DM', () => {
  const record = { OwnerId: 'player-1', DMId: 'dm-1' }
  assert.equal(canAccessCharacter(record, { Id: 'player-1', Role: 'player' }), true)
  assert.equal(canAccessCharacter(record, { Id: 'player-2', Role: 'player' }), false)
  assert.equal(canAccessCharacter(record, { Id: 'dm-1', Role: 'dm' }), true)
  assert.equal(canAccessCharacter(record, { Id: 'dm-2', Role: 'dm' }), false)
})

test('public account data excludes password hashes and sessions depend on the key', () => {
  assert.equal(publicUser({ Id: '1', Username: 'test', Role: 'player', PasswordHash: 'secret' }).PasswordHash, undefined)
  assert.notEqual(sessionDigest('token', 'key-one'), sessionDigest('token', 'key-two'))
})