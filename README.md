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

The sign-in screen includes public registration with email, account login, password, and DM/Player selection. Settings lets an account switch modes without reassigning or deleting its data. DM mode can manage only its own campaigns and assigned characters, not other DMs' records. Emails and logins must be unique. Passwords require at least 12 characters and are stored as salted Argon2id hashes. The password suggestion button generates a 24-character password locally using browser cryptography. Registration is rate-limited; password-account email delivery verification and password recovery are not implemented yet.

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

The Pages workflow builds the frontend for `/dragons-dungeon/`, runs the local test suite, and uploads only `dist`. It never uploads the local `.env`, MongoDB credentials, or the Node API.

GitHub rejected Pages activation for this private repository on the current account plan. The repository remains private. After upgrading to a plan that supports private-repository Pages, enable Pages with GitHub Actions as its source and set the repository Actions variable `PAGES_ENABLED` to `true`. Until then, the build runs but the deployment job is skipped.

GitHub Pages is static hosting and cannot run the Express API, MongoDB access, or Google OAuth callbacks. This deployment explicitly disables account actions rather than sending credentials to a nonexistent API. For a fully functional hosted app, separately deploy the API and configure a secure frontend/API integration, or serve this frontend from the API host. The Pages site may be publicly accessible even when its source repository is private; review Pages access settings before enabling deployment.

The intended URL after activation is `https://ishamoridin.github.io/dragons-dungeon/`. Locally, `PUBLIC_BASE_PATH` defaults to `./` and `PUBLIC_STATIC_HOST` is false.

## Current Scope

The DM stat-system selector starts with Essence. Existing character records are retained. The New System dialog saves a DM-owned system with a name, description, rules template (Essence or Private), and campaign names. Custom systems persist in MongoDB and participate in Undo and conflict handling. This dialog selects an existing rules engine; it does not yet define arbitrary attributes or formulas.

Character saves and API-owned resources support persistence, history, and ownership checks. Some campaign, catalog, and technique screens still use local in-memory stores and are not yet wired to those resource endpoints. Unsaved form edits and transient combat values are not covered by database Undo.

The Vite development server is not a production hosting setup. Production deployment requires HTTPS, a configured `APP_ORIGIN`, `NODE_ENV=production` for secure cookies, a frontend hosting strategy, and a dependency/security review.
