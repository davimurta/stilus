# 0006. Panel, sync and CLI (Phase 2)

Date: 2026-11-27
Status: accepted

## Panel

- Server Components + Server Actions; no client data fetching. Pages are dynamic (they read the
  session), which is fine for an admin tool.
- Panel login uses Better Auth cookie sessions, set from a Server Action by the `nextCookies()`
  plugin. The API keeps using bearer tokens. Server Actions get Next's built-in Origin check (CSRF).
- Every action checks session and membership again on the server, and reuses the same functions as
  the API (`updateText`, `notifySite`), so the panel and the overlay follow one path.
- A site the user cannot access answers 404, not 403, so ids cannot be probed.
- Panel URLs are in Portuguese (`/entrar`, `/sites/{id}/textos/{key}`), like `/editar` on sites:
  they are part of the interface. Code stays in English.
- "Novo" = created in the last 7 days (`texts.created_at`, added in migration 0002 and
  backfilled from `updated_at`). "Órfão" = `status = orphan`.
- Restoring a version is a normal edit (new version), so restores can be undone.

## Revalidation status

- `notifySite` now also logs successes (`revalidate.sent`). The site is "pending" when its latest
  revalidation entry is a failure. "Revalidar agora" sends a signed webhook with no keys (the site
  revalidates its whole tag anyway).
- Background retries after the request ends are not implemented; the 3 in-request attempts, the
  1h time-based safety net and the manual button cover it. Revisit with a real job runner.

## Sync and CLI

- `POST /sync` answers lists of keys (`created`, `orphaned`, `unchanged`), which the CLI prints.
- Never-edited values follow a changed default; edited values are never overwritten.
- An empty sync is refused by both the CLI and the API.
- The CLI parses with the TypeScript compiler API, only follows `Text`/`t` imported from
  `@stilus/next`, and applies React's JSX whitespace rule to default texts.
- `page` = first segment of the key. `kind` comes from the `multiline` prop of `<Text>`.
