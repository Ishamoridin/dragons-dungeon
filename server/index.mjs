import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { bootstrap } from './bootstrap.mjs'

let client
try {
  const connection = await connectDatabase()
  client = connection.client
  const app = createApp(connection.database, {
    key: process.env.ENCRYPTION_KEY,
    origin: process.env.APP_ORIGIN || 'http://localhost:5173',
    secureCookies: process.env.NODE_ENV === 'production',
  })
  await initializeDatabase(connection.database)
  await bootstrap(connection.database)
  const port = Number(process.env.API_PORT || 3001)
  const server = app.listen(port, '127.0.0.1', () => console.log(`Dragon's Dungeon API: http://127.0.0.1:${port}`))
  server.on('error', async () => { console.error('Unable to listen on API_PORT.'); await client.close(); process.exitCode = 1 })
  const close = () => server.close(async () => { await client.close(); process.exit(0) })
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
} catch (error) {
  console.error(error.message)
  if (client) await client.close()
  process.exitCode = 1
}