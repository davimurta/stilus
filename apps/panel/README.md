# panel

Central Stilus service: REST API (`/api/v1`) and, from Phase 2 on, the admin panel. Postgres + Drizzle.

## Local setup

```bash
pnpm db:up                         # from the repo root: Postgres 17 on localhost:54329
cp apps/panel/.env.example apps/panel/.env
pnpm --filter panel db:migrate
pnpm --filter panel db:seed        # admin user, example site and its texts (dev only)
pnpm --filter panel dev            # http://localhost:3200
```

## Database

- Schema: `src/db/schema.ts`. Migrations: `drizzle/` (generated, committed).
- New migration after a schema change: `pnpm --filter panel db:generate`.
- The seed is idempotent and keeps edited text values. It refuses to run with `NODE_ENV=production`.

## API

All errors use `{ error: { code, message } }`.

### `GET /api/v1/sites/{siteId}/texts`

Auth: `Authorization: Bearer <site_api_key>`.

```json
{ "texts": { "home.hero.title": "Bem-vindo" } }
```

Only `active` texts are returned. An unknown site and a wrong key both answer `401 unauthorized`.
A malformed `siteId` answers `400 invalid_request`.

## Tests

Integration tests in `test/` run the route handlers against a real Postgres database
(`stilus_test`, recreated from the migrations on each run). Start it with `pnpm db:up`.
Override the connection with `TEST_DATABASE_URL`.
