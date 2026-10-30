# Dragon's Dungeon

A React character-sheet and campaign-management app with Default, Frontier, and Essence rulesets, a DM console, equipment and inventory views, and MongoDB-backed character saving.

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

The sign-in screen includes public registration with email, account login, and password. New registrations are always player accounts; public signup cannot grant DM permissions. Emails and logins must be unique. Passwords require at least 12 characters and are stored as salted Argon2id hashes. The password suggestion button generates a 24-character password locally using browser cryptography. Registration is rate-limited; email delivery verification and password recovery are not implemented yet.

## Checks

- `npm run build`: TypeScript checks and production frontend build.
- `npm run test:server`: server unit tests; live-database tests are skipped by default.
- Live Atlas tests: set `RUN_DB_INTEGRATION=1`, then run `npm run test:server`. These tests create temporary databases and remove them afterward; use a development database account with appropriate permissions.

## Revision Handling

Saved characters have numeric versions. Undo restores the last database-saved change only when no newer edit would be overwritten. DMs can compare conflicting copies and choose values field by field; independent changes merge automatically. Arrays are selected as complete values to avoid corrupting list positions.

The DM character modal can add or remove tracked Essence quantities. It also provides current/max HP, Reiryoku, and Willpower fields with per-pool Apply controls. These values are saved separately as temporary overrides, leaving attributes and permanent bonuses unchanged. Reset temporary values clears the overrides and restores derived maxima with full current pools. These saves participate in version history and Undo.

## Roll20 Combat Rolls

The summary combat grid has three rows: Defense/Dodge/Armour, Ranged/Weaponry/Brawl, and Initiative/Reiatsu-Mod/Reishi-Mod. All tiles except Initiative copy a `/roll 1d20` command with the current modifier. Right-click copies a Roll20 macro instead.

Direct submission to other browser tabs requires the optional [Roll20 Bridge](browser-extension/roll20-bridge/README.md). Load it unpacked into Chrome or Edge, then reload the app and Roll20 editor tabs. It attempts submission to every open Roll20 editor in that browser profile, without replacing unfinished chat drafts. Without the bridge, the roll remains available to paste from the clipboard.

## Current Scope

The DM stat-system selector starts with Essence. The legacy Default system is named Private and hidden from that selector; Frontier is no longer registered. Existing character records are retained. The New System dialog saves a DM-owned system with a name, description, rules template (Essence or Private), and campaign names. Custom systems persist in MongoDB and participate in Undo and conflict handling. This dialog selects an existing rules engine; it does not yet define arbitrary attributes or formulas.

Character saves and API-owned resources support persistence, history, and ownership checks. Some campaign, catalog, and technique screens still use local in-memory stores and are not yet wired to those resource endpoints. Unsaved form edits and transient combat values are not covered by database Undo.

The Vite development server is not a production hosting setup. Production deployment requires HTTPS, a configured `APP_ORIGIN`, `NODE_ENV=production` for secure cookies, a frontend hosting strategy, and a dependency/security review.