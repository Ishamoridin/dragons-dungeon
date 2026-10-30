import { seedCharacterRecords } from '../src/character/CharacterSheetDatabase.ts'
import { hashPassword } from './security.mjs'

export async function bootstrap(db, env = process.env) {
  if (await db.collection('migrations').findOne({ Id: 'initial-demo-accounts' })) return
  const credentials = [
    { Id: 'dm:dm', Role: 'dm', Username: env.INITIAL_DM_USERNAME ?? env.VITE_DEMO_DM_USERNAME, Password: env.INITIAL_DM_PASSWORD ?? env.VITE_DEMO_DM_PASSWORD },
    { Id: 'player:player', Role: 'player', Username: env.INITIAL_PLAYER_USERNAME ?? env.VITE_DEMO_PLAYER_USERNAME, Password: env.INITIAL_PLAYER_PASSWORD ?? env.VITE_DEMO_PLAYER_PASSWORD },
  ]
  if (credentials.some((account) => !account.Username || !account.Password)) throw new Error('Configure INITIAL_DM_USERNAME, INITIAL_DM_PASSWORD, INITIAL_PLAYER_USERNAME, and INITIAL_PLAYER_PASSWORD for the first migration.')
  for (const { Password, ...account } of credentials) {
    await db.collection('users').updateOne({ Id: account.Id }, { $setOnInsert: {
      ...account, UsernameKey: account.Username.trim().toLowerCase(), PasswordHash: await hashPassword(Password),
      ...(account.Role === 'player' ? { CreatedBy: 'dm:dm' } : {}), CreatedAt: new Date().toISOString(),
    } }, { upsert: true })
  }
  for (const record of seedCharacterRecords()) {
    record.OwnerName = credentials[1].Username
    record.DMName = credentials[0].Username
    await db.collection('characters').updateOne({ Id: record.Id }, { $setOnInsert: record }, { upsert: true })
  }
  await db.collection('migrations').updateOne({ Id: 'initial-demo-accounts' }, { $setOnInsert: { Id: 'initial-demo-accounts', CompletedAt: new Date() } }, { upsert: true })
}