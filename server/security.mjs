import { argon2id, argon2Verify } from 'hash-wasm'
import { createHmac, randomBytes } from 'node:crypto'

export const hashPassword = (password) => argon2id({ password, salt: randomBytes(16), parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32, outputType: 'encoded' })

export async function verifyPassword(hash, password) {
  try {
    return await argon2Verify({ hash, password })
  } catch {
    return false
  }
}

export const sessionDigest = (token, key) => createHmac('sha256', key).update(token).digest('hex')

export function canAccessCharacter(record, user) {
  if (user.SecondaryOwner) return true
  return user.Role === 'dm' ? record.DMId === user.Id : record.OwnerId === user.Id
}

export function publicUser(user) {
  return { Id: user.Id, Username: user.Username, Role: user.Role, PreferredSkin: user.PreferredSkin ?? 'basalt', Email: user.Email, GoogleLinked: Boolean(user.GoogleSub), SecondaryOwner: Boolean(user.SecondaryOwner) }
}