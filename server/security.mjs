import { argon2id, argon2Verify } from 'hash-wasm'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

export const hashPassword = (password) => argon2id({ password, salt: randomBytes(16), parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32, outputType: 'encoded' })

export async function verifyPassword(hash, password) {
  try {
    return await argon2Verify({ hash, password })
  } catch {
    return false
  }
}

export const sessionDigest = (token, key) => createHmac('sha256', key).update(token).digest('hex')

// Sealed packets carry a whole pending request (such as a registration) inside an emailed link, so nothing has to be
// stored until the link is opened. AES-256-GCM authenticates as well as encrypts: a tampered or foreign token opens to null.
const PACKET_VERSION = 1
const packetKey = (key) => createHash('sha256').update(key).digest()

export function sealPacket(payload, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', packetKey(key), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify({ v: PACKET_VERSION, ...payload }), 'utf8'), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
}

export function openPacket(token, key) {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16) return null
    const decipher = createDecipheriv('aes-256-gcm', packetKey(key), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(raw.length - 16))
    const text = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8')
    const payload = JSON.parse(text)
    if (!payload || typeof payload !== 'object' || payload.v !== PACKET_VERSION) return null
    const { v, ...rest } = payload
    return rest
  } catch {
    return null
  }
}

export function canAccessCharacter(record, user) {
  if (user.SecondaryOwner) return true
  return user.Role === 'dm' ? record.DMId === user.Id : record.OwnerId === user.Id
}

export function publicUser(user) {
  return { Id: user.Id, Username: user.Username, Role: user.Role, PreferredSkin: user.PreferredSkin ?? 'basalt', Email: user.Email, GoogleLinked: Boolean(user.GoogleSub), SecondaryOwner: Boolean(user.SecondaryOwner) }
}