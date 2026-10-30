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

## Checks

- `npm run build`: TypeScript checks and production frontend build.
- `npm run test:server`: server unit tests; live-database tests are skipped by default.
- Live Atlas tests: set `RUN_DB_INTEGRATION=1`, then run `npm run test:server`. These tests create temporary databases and remove them afterward; use a development database account with appropriate permissions.

## Revision Handling

Saved characters have numeric versions. Undo restores the last database-saved change only when no newer edit would be overwritten. DMs can compare conflicting copies and choose values field by field; independent changes merge automatically. Arrays are selected as complete values to avoid corrupting list positions.

## Current Scope

Character saves and API-owned resources support persistence, history, and ownership checks. Some campaign, catalog, and technique screens still use local in-memory stores and are not yet wired to those resource endpoints. Unsaved form edits and transient combat values are not covered by database Undo.

The Vite development server is not a production hosting setup. Production deployment requires HTTPS, a configured `APP_ORIGIN`, `NODE_ENV=production` for secure cookies, a frontend hosting strategy, and a dependency/security review.