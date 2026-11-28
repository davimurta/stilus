# panel

Central Stilus service: REST API (`/api/v1`) and the admin panel. Postgres + Drizzle.

## Administration (sites and users)

Run against the database in `DATABASE_URL` (works in production; the seed does not):

```bash
pnpm --filter panel admin create-user --email ana@empresa.com --name "Ana"
pnpm --filter panel admin create-site --name "Meu site" --domain meusite.com.br \
  --revalidate-url https://meusite.com.br/api/stilus/revalidate --owner ana@empresa.com
pnpm --filter panel admin grant --email bia@empresa.com --site <siteId> --role editor
pnpm --filter panel admin revoke --email bia@empresa.com --site <siteId>
pnpm --filter panel admin set-password --email ana@empresa.com   # also ends her sessions
pnpm --filter panel admin rotate-site-key --site <siteId>
pnpm --filter panel admin list-sites
```

- Passwords are generated (24 random characters) and printed once, unless `--password-stdin` is
  given. Minimum 12 characters.
- `create-site` prints `STILUS_SITE_ID`, `STILUS_SITE_KEY` and `STILUS_REVALIDATE_SECRET` once:
  only the hash of the key is stored. The owner becomes the site's admin.

## Panel

- `/entrar`: login (Better Auth cookie session, same 5-failures-in-15-minutes limit as the API).
- `/conta`: change your own password (needs the current one; ends your other sessions).
- `/sites`: sites the user is a member of.
- `/sites/{siteId}`: texts of a site with search (key, text, description), page filter and
  status filter (in use / orphan / all). Badges: **Órfão** (key no longer in the code) and
  **Novo** (created in the last 7 days). A site the user is not a member of answers 404.
- `/sites/{siteId}/textos/{key}`: edit a text with a live character counter (the limit is also
  enforced by the server), see its history (author and date) and restore any version. A restore is
  a normal edit, so it can be undone too.
- When the last call to the site's revalidation webhook failed, the site pages show
  "Salvo, atualização do site pendente" with a **Revalidar agora** button.
- Every change from the panel goes through the same code as the API: permission check, validation,
  version, activity log and the signed webhook.

## Local setup

```bash
pnpm db:up                         # from the repo root: Postgres 17 on localhost:54329
cp apps/panel/.env.example apps/panel/.env
pnpm --filter panel db:migrate
pnpm --filter panel db:seed        # admin user (SEED_ADMIN_*), example site and its texts (dev only)
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

### `POST /api/v1/sites/{siteId}/sync`

Auth: site API key. Called by `stilus sync`. Body
`{ keys: [{ key, defaultValue, description?, page?, kind? }] }` (1 to 5000 unique keys).
Answers `{ created, orphaned, unchanged }` (lists of keys).

- New keys are created with their default text.
- Existing keys get fresh metadata and become active again. A value never edited follows the new
  default; an edited value is kept.
- Active keys missing from the list become `orphan`: kept with their history, left out of
  `GET texts`. If a rendered value changed, the site is revalidated.

### `POST /api/v1/auth/login`

Body `{ email, password }`. Answers `{ token, user, sites }`, where `sites` lists the sites the
user can edit (`role`: `admin` | `editor`). Wrong email or password: `401 invalid_credentials`.
After 5 failures for the same email in 15 minutes: `429 too_many_attempts`.
Sessions are Better Auth sessions (7 days); send the token as `Authorization: Bearer <token>`.

### `POST /api/v1/auth/logout`

Revokes the bearer session. Always `200`.

### `PUT /api/v1/sites/{siteId}/texts/{key}`

Auth: user bearer token. Body `{ value }`. Answers `{ key, value, changed, revalidated }`.

Checks, in order: session (`401`), params (`400`), membership on the site (`403 forbidden`),
text exists (`404`), value (`422 too_long` above `max_length` or 10 000 characters,
`422 invalid_value` for control characters or a line break in a `line` text).
Values are plain text, stored as typed and escaped when rendered.

Every change records a version (the first edit also records the value it replaced) and an
`activity_log` entry, then calls the site's revalidation webhook. `revalidated: false` means the
text was saved but the site could not be notified after 3 attempts (logged as
`revalidate.failed`).

### `POST /api/v1/sites/{siteId}/texts/{key}/undo`

Same auth and permission. Removes the latest version and restores the previous one, step by step
back to the original value; then `409 nothing_to_undo`.

### Revalidation webhook (central to site)

`POST {site.revalidate_url}` with body `{ siteId, keys, ts }` (ts in ms) and header
`x-stilus-signature`: HMAC-SHA256 hex of the raw body with the site's `revalidate_secret`.

## Tests

Integration tests in `test/` run the route handlers against a real Postgres database
(`stilus_test`, recreated from the migrations on each run). Start it with `pnpm db:up`.
Override the connection with `TEST_DATABASE_URL`.
