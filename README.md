# Dragon's Dungeon

A React character-sheet and campaign-management app with Essence and template-based rulesets, a DM console, equipment and inventory views, and MongoDB-backed character saving.

## Local Development

Requires Node.js 22.12 or newer and access to a MongoDB replica set, such as MongoDB Atlas.

1. Run `npm ci`.
2. Configure a local `.env` using `.env.example` as the template. Set the MongoDB credentials, a random `ENCRYPTION_KEY` of at least 32 bytes, and initial DM/player credentials. Use passwords of at least 12 characters.
3. Run `npm run db:check` to verify database access.
4. Run `npm run dev:api` in one terminal and `npm run dev` in another.
5. Open `http://localhost:5173` and sign in with the initial account credentials.

The API listens on loopback port 3001. Vite proxies `/api` requests to it. Initial accounts and sample characters are migrated once without replacing existing records. Accounts use Argon2id password hashes and HttpOnly session cookies; the environment key protects server-side session token digests.

Never commit `.env`, passwords, or connection strings containing real credentials. Only variables prefixed with `PUBLIC_` can be exposed through Vite. Initial account credentials are used by the server, not shipped in the client.

## Accounts

The sign-in screen includes public registration with email, account login, password, and DM/Player selection. Settings lets an account switch modes without reassigning or deleting its data. DM mode can manage only its own campaigns and assigned characters, not other DMs' records. Emails and logins must be unique. Passwords require at least 12 characters and are stored as salted Argon2id hashes. The password suggestion button generates a 24-character password locally using browser cryptography. Registration is rate-limited and completes by email: the form sends a one-time link (24 hours, single use) to the address given, and opening it creates the account and signs in. Settings has an Account dialog for changing the email address (a six-digit code goes to the new address first) and the password (current password, then the new one twice). Emails are sent through Resend when `RESEND_API_KEY` and `MAIL_FROM` are set on the API host (`APP_URL` controls where links open); without them the link or code is shown on screen so development still works. Password recovery is not implemented yet.

Sessions use revocable HttpOnly cookies and MongoDB-backed expiry, last up to 30 days, and are restored automatically when the app loads. Sign out revokes the current session; changing a password revokes that account's sessions.

## Google Sign-In

1. In Google Cloud, configure an OAuth consent screen and create a Web application OAuth client. If the consent screen is in testing mode, add the Google accounts that will test the app.
2. Register the redirect URI `http://localhost:5173/api/auth/google/callback` exactly. For production, use the public HTTPS application origin and its `/api/auth/google/callback` path instead.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the local `.env`, matching `.env.example`. Set `APP_ORIGIN` to the same application origin. Never use a `PUBLIC_` or `VITE_` prefix for the secret.
4. Restart the API and reload the app. Continue with Google becomes available on login and registration. Settings can connect Google to an existing signed-in account.

Google login uses authorization code exchange, PKCE, a one-time state bound to an HttpOnly cookie, and an identity-token nonce. Google's library verifies token signatures and audience; only verified email identities are accepted. Google access and refresh tokens are not stored. A new Google account uses the selected registration mode, while returning accounts keep their saved mode. Accounts are never automatically linked solely because their email matches: sign in with the existing account first and use Connect Google account in Settings.

## Checks

- `npm run build`: TypeScript checks and production frontend build.
- `npm run test:server`: server unit tests; live-database tests are skipped by default.
- Live Atlas tests: set `RUN_DB_INTEGRATION=1`, then run `npm run test:server`. These tests create temporary databases and remove them afterward; use a development database account with appropriate permissions.

## Revision Handling

Saved characters have numeric versions. Undo restores the last database-saved change only when no newer edit would be overwritten. DMs can compare conflicting copies and choose values field by field; independent changes merge automatically. Arrays are selected as complete values to avoid corrupting list positions.

The DM character modal can add or remove tracked Essence quantities. It also provides current/max HP, Reiryoku, and Willpower fields with per-pool Apply controls. These values are saved separately as temporary overrides, leaving attributes and permanent bonuses unchanged. Reset temporary values clears the overrides and restores derived maxima with full current pools. These saves participate in version history and Undo.

## Wound Results and Burden

Burden counts carried inventory only; equipped armour and other equipped items do not contribute. Each inventory entry retains its recorded burden total.

The Wound result field previews and applies explicit stat modifiers such as `Strength -2; Dodge -1; maximum HP -100`, `reduce Strength by 2`, or `maximum health -25%`. Attribute and skill changes flow into derived stats, summary bars, and combat rolls, but do not change purchased values or development points. Removing the injury reverses its modifiers. Explicit temporary resource maxima remain authoritative.

Use `Weaponry` for its combat modifier and `Weaponry skill` for its skill value. Qualify ambiguous skills, such as `mental politics skill`. Conditional rules, unsupported prose, and ambiguous damage such as `lose 50 HP` are flagged for manual review rather than guessed. Duration text is informational: effects remain active until the injury is removed. Equipment tooltips include the item name, slot, armour adjustment, combat modifiers, and burden.

## Technique Descriptions

Technique editing has separate Flavour, Passive Effect, and Active Effect fields. Saving keeps those sections individually and combines the non-empty sections into the main description, with effect headings. Existing descriptions open in Flavour without attempting to reinterpret or discard legacy text.

## Roll20 Combat Rolls

The summary combat grid has three rows: Defense/Dodge/Armour, Ranged/Weaponry/Brawl, and Initiative/Reiatsu-Mod/Reishi-Mod. All tiles except Initiative copy a `/roll 1d20` command with the current modifier. Right-click copies a Roll20 macro instead.

Direct submission to other browser tabs requires the optional [Roll20 Bridge](browser-extension/roll20-bridge/README.md). Load it unpacked into Chrome or Edge, then reload the app and Roll20 editor tabs. It attempts submission to every open Roll20 editor in that browser profile, without replacing unfinished chat drafts. Without the bridge, the roll remains available to paste from the clipboard.

## GitHub Pages

The Pages workflow builds the frontend for `/dragons-dungeon/`, runs the local test suite, and uploads only `dist`. It never uploads the local `.env`, MongoDB credentials, or the Node API. Pages is enabled (`PAGES_ENABLED=true`) and deploys on every push to `main`, at `https://ishamoridin.github.io/dragons-dungeon/`.

GitHub Pages is static hosting and cannot run the Express API, MongoDB access, or Google OAuth callbacks itself. Without a configured API the deployment disables account actions rather than sending credentials to a nonexistent service. To make accounts work on the hosted site, deploy the API separately and connect the two:

1. Deploy the Node API (`npm start`, which runs `node --import tsx server/index.mjs`) to an HTTPS host such as Render, Railway, or Fly.io, with the MongoDB credentials, `ENCRYPTION_KEY`, `NODE_ENV=production`, `APP_ORIGIN=https://ishamoridin.github.io`, and `CROSS_SITE_COOKIES=true`. The server binds `0.0.0.0` and reads `PORT` (falling back to `API_PORT`), matching what these platforms inject. A [`render.yaml`](render.yaml) blueprint is included for a guided Render setup (`New +` > `Blueprint`); other hosts need the same env vars entered by hand. The blueprint names the service `dragons-dungeon-api`; the live deployment was created by hand as `dragons-dungeon` at `https://dragons-dungeon.onrender.com`. Once the API is up, `GET /api/health` returns `{"status":"ok"}` (Render uses it as the health check) and `GET /` returns a short JSON status rather than the frontend. In MongoDB Atlas, open Network Access and allow `0.0.0.0/0` (or the host's static egress IPs): Atlas only allows the IP that created the cluster by default, and the API exits on boot with a server selection timeout when the host is not allowed.
2. Set the repository Actions variable `API_ORIGIN` to the API's public origin with no trailing slash (for this deployment `https://dragons-dungeon.onrender.com`). The next Pages deploy builds the frontend against it with CORS and `SameSite=None` session cookies.
3. Alternatively skip Pages for the app itself: set `SERVE_STATIC_DIR=dist` on the API host and it serves the built frontend and API from one origin, with no cross-site configuration needed. On Render this is automatic: `npm ci` runs `scripts/render-prepare.mjs`, which builds the frontend when `RENDER=true`, and the server serves `dist/` whenever it exists (set `SERVE_STATIC_DIR=off` to stay API-only). The live service at `https://dragons-dungeon.onrender.com` therefore shows the app at its root, while `/api/health` still answers for health checks.

Until `API_ORIGIN` is set, the deployed frontend intentionally shows "Account service unavailable on this static deployment." on the sign-in screen rather than sending credentials nowhere — this is expected, not a bug.

## Importing and syncing characters from Google Sheets

The DM console's Players tab has an **Import from Google Sheets** button. Paste a workbook link, pick the campaign and owning account, and the API downloads the workbook, works out which stat system it belongs to (the Essence rules are recognised from the title and attribute table on the first tab; an unknown ruleset becomes a new system), builds the character, and keeps the record linked to the sheet.

Linked characters stay in step with their workbook:

- The first import is a full sweep of every tab. Afterwards the API re-checks every linked sheet once a day (`SHEET_SYNC_INTERVAL_MS`, default 24 hours), whenever anyone presses **Refresh from Google Sheets** in Settings, and whenever the DM presses **Sync with Google Sheet** on a character. If the workbook has a tab named **Changelog**, the check reads only its last row and re-sweeps the sheet when that row changed; without one, the whole mapped character is compared.
- The sheet wins: when it changed, its values replace the app's for every mapped field, while app-only data (development log, temporary bars, ability trackers, alias) is kept.
- When only the app changed, the changed cells are written back to the workbook. This needs `GOOGLE_SERVICE_ACCOUNT_JSON` on the API host: a Google Cloud service account key file (raw JSON or base64), with each linked sheet shared with the account's `client_email` as an Editor. Without it, reading still works for sheets shared as "Anyone with the link can view", but changes made in the app stay in the app.
- Changes applied on the sheet's behalf appear in history under the actor "Google Sheets".

Locally, `PUBLIC_BASE_PATH` defaults to `./` and `PUBLIC_STATIC_HOST` is false.

## Current Scope

The DM stat-system selector starts with Essence. Existing character records are retained. The New System dialog saves a DM-owned system with a name, description, rules template (Essence or Private), and campaign names. Custom systems persist in MongoDB and participate in Undo and conflict handling. This dialog selects an existing rules engine; it does not yet define arbitrary attributes or formulas.

Character saves and API-owned resources support persistence, history, and ownership checks. Some campaign, catalog, and technique screens still use local in-memory stores and are not yet wired to those resource endpoints. Unsaved form edits and transient combat values are not covered by database Undo.

The Vite development server is not a production hosting setup. Production deployment requires HTTPS, a configured `APP_ORIGIN`, `NODE_ENV=production` for secure cookies, a frontend hosting strategy, and a dependency/security review.
