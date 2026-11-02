// Runs the frontend build during `npm ci` on Render, where the build command is just `npm ci`, so the API host
// can serve the app itself (see SERVE_STATIC_DIR). Render exports RENDER=true in its build environment; local
// installs and the GitHub Pages workflow leave it unset and skip this.
import { spawnSync } from 'node:child_process'

if (process.env.RENDER !== 'true') {
  process.exit(0)
}

console.log('Render build detected: building the frontend for same-origin serving.')
// Through a shell so the npm shim resolves the same way on Linux (Render) and Windows (local testing).
const result = spawnSync('npm run build', {
  stdio: 'inherit',
  shell: true,
  // Served from the API's root, so assets use absolute paths and the account service is same-origin.
  env: { ...process.env, PUBLIC_BASE_PATH: process.env.PUBLIC_BASE_PATH || '/', PUBLIC_STATIC_HOST: 'false', PUBLIC_API_ORIGIN: process.env.PUBLIC_API_ORIGIN || '' },
})
process.exit(result.status ?? 1)
