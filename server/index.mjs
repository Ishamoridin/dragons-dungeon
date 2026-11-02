import { existsSync } from 'node:fs'
import { connectDatabase } from './database.mjs'
import { createApp, initializeDatabase } from './app.mjs'
import { bootstrap } from './bootstrap.mjs'
import { createSheetSync, DEFAULT_SYNC_INTERVAL_MS } from './sheet-sync.mjs'

// Serve the built frontend from the API when it is present (Render builds it during npm ci via scripts/render-prepare.mjs),
// unless SERVE_STATIC_DIR points elsewhere or is explicitly set to "off" to keep the host API-only.
const staticDir = process.env.SERVE_STATIC_DIR === 'off' ? undefined : process.env.SERVE_STATIC_DIR || (existsSync('dist/index.html') ? 'dist' : undefined)

let client
try {
  const connection = await connectDatabase()
  client = connection.client
  const sheetSync = createSheetSync(connection.database)
  const app = createApp(connection.database, {
    sheetSync,
    key: process.env.ENCRYPTION_KEY,
    origin: process.env.APP_ORIGIN || 'http://localhost:5173',
    // Full URL the app is served from, for emailed links; defaults to the origin's root.
    appUrl: process.env.APP_URL,
    secureCookies: process.env.NODE_ENV === 'production',
    crossSiteCookies: process.env.CROSS_SITE_COOKIES === 'true',
    staticDir,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_ORIGIN || 'http://localhost:5173'}/api/auth/google/callback`,
    },
  })
  await initializeDatabase(connection.database)
  await bootstrap(connection.database)
  // Linked characters are pulled from their Google Sheets on an interval; sheet values win over app edits.
  sheetSync.start(Number(process.env.SHEET_SYNC_INTERVAL_MS) || DEFAULT_SYNC_INTERVAL_MS)
  // Hosting platforms (Render, Railway, Fly.io) inject PORT and route to the container's public interface,
  // not loopback, so bind 0.0.0.0 rather than 127.0.0.1 or the app is unreachable once deployed.
  const port = Number(process.env.PORT || process.env.API_PORT || 3001)
  const host = '0.0.0.0'
  const server = app.listen(port, host, () => console.log(`Dragon's Dungeon API: http://${host}:${port}${staticDir ? ` (serving frontend from ${staticDir})` : ' (API only)'}`))
  server.on('error', async () => { console.error('Unable to listen on the configured port.'); await client.close(); process.exitCode = 1 })
  const close = () => server.close(async () => { await client.close(); process.exit(0) })
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
} catch (error) {
  console.error(error.message)
  if (client) await client.close()
  process.exitCode = 1
}