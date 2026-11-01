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
    crossSiteCookies: process.env.CROSS_SITE_COOKIES === 'true',
    staticDir: process.env.SERVE_STATIC_DIR || undefined,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_ORIGIN || 'http://localhost:5173'}/api/auth/google/callback`,
    },
  })
  await initializeDatabase(connection.database)
  await bootstrap(connection.database)
  // Hosting platforms (Render, Railway, Fly.io) inject PORT and route to the container's public interface,
  // not loopback, so bind 0.0.0.0 rather than 127.0.0.1 or the app is unreachable once deployed.
  const port = Number(process.env.PORT || process.env.API_PORT || 3001)
  const host = '0.0.0.0'
  const server = app.listen(port, host, () => console.log(`Dragon's Dungeon API: http://${host}:${port}`))
  server.on('error', async () => { console.error('Unable to listen on the configured port.'); await client.close(); process.exitCode = 1 })
  const close = () => server.close(async () => { await client.close(); process.exit(0) })
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
} catch (error) {
  console.error(error.message)
  if (client) await client.close()
  process.exitCode = 1
}