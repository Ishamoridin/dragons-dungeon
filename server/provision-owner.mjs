import { parseArgs } from 'node:util'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { bootstrap } from './bootstrap.mjs'
import { hashPassword } from './security.mjs'
import { suggestStrongPassword } from '../src/character/Password.ts'

// One-off provisioning: grant an account secondary ownership of everything and reserve system ownership for a username.
const { values } = parseArgs({ options: {
  username: { type: 'string', default: 'Ishamoridin' },
  email: { type: 'string' },
  'reserve-system': { type: 'string', default: 'essence' },
  'reserve-for': { type: 'string', default: 'Lirril' },
} })

void createApp // ensures route module stays importable alongside this script
const { client, database: db } = await connectDatabase()
try {
  await initializeDatabase(db)
  await bootstrap(db)

  const usernameKey = values.username.toLowerCase()
  const existing = await db.collection('users').findOne({ UsernameKey: usernameKey })
  let password = null
  if (existing) {
    await db.collection('users').updateOne({ Id: existing.Id }, { $set: { SecondaryOwner: true, Role: 'dm' } })
  } else {
    password = suggestStrongPassword()
    await db.collection('users').insertOne({
      Id: `owner:${usernameKey}`, Username: values.username, UsernameKey: usernameKey,
      ...(values.email ? { Email: values.email.toLowerCase(), EmailVerified: false } : {}),
      Role: 'dm', SecondaryOwner: true, PasswordHash: await hashPassword(password), CreatedAt: new Date().toISOString(),
    })
  }

  const reserveKey = values['reserve-for'].toLowerCase()
  const reserved = await db.collection('users').findOne({ UsernameKey: reserveKey })
  if (reserved) {
    await db.collection('systemOwnership').updateOne({ SystemId: values['reserve-system'] }, { $set: { OwnerId: reserved.Id, OwnerName: reserved.Username, GrantedAt: new Date().toISOString() } }, { upsert: true })
    await db.collection('users').updateOne({ Id: reserved.Id }, { $set: { Role: 'dm' } })
  } else {
    await db.collection('pendingOwnerships').updateOne(
      { UsernameKey: reserveKey, Kind: 'system', TargetId: values['reserve-system'] },
      { $set: { UsernameKey: reserveKey, Kind: 'system', TargetId: values['reserve-system'], Applied: false, ReservedAt: new Date().toISOString() } },
      { upsert: true },
    )
  }

  const summary = {
    account: values.username,
    secondaryOwner: true,
    role: 'dm',
    generatedPassword: password ?? '(existing password kept)',
    reservedSystem: values['reserve-system'],
    reservedFor: values['reserve-for'],
    reservedState: reserved ? 'applied immediately' : 'pending until that account registers',
    characters: await db.collection('characters').countDocuments(),
    users: await db.collection('users').countDocuments(),
  }
  console.log(JSON.stringify(summary, null, 2))
  if (password) console.log('Sign in with the generated password above and change it in Settings.')
} finally {
  await client.close()
}
