# 0004. Editor authentication, versions and revalidation

Date: 2026-11-27
Status: accepted

## Authentication

- **Better Auth** (as planned) with the Drizzle adapter, email/password only, sign-up disabled
  (accounts are created by an admin: the seed now, the panel later), argon2id via
  `@node-rs/argon2`, uuid ids, 7-day sessions.
- The **`bearer` plugin** lets the site relay the session as `Authorization: Bearer <token>`.
  The token is HMAC-signed by Better Auth; the central API never trusts the site for identity.
- **Data model change:** Better Auth keeps the password hash in `accounts.password`
  (provider `credential`) and needs `sessions`, `accounts` and `verifications` tables plus
  `email_verified`, `image` and `updated_at` on `users`. `users.password_hash` was removed
  (migration `0001_auth_tables`). The CLAUDE.md data model should be updated to match.

## Site session

- After login the site sets `stilus_session` (httpOnly, SameSite=Lax, Secure on https) with the
  central token and `stilus_edit=1` (readable, UI only). The token is not encrypted again on the
  site: it is already signed, it is validated centrally on every edit, and it is never readable by
  page scripts. **`STILUS_SESSION_SECRET` is not needed in Phase 1**; drop it from CLAUDE.md or
  keep it for a later need.
- Cookie-authenticated routes (login, logout, save, undo) require an `Origin` that matches the
  host (CSRF); SameSite=Lax is the second layer.
- A user without membership on the site gets `403` at login and the fresh token is revoked.

## Versions and undo

- Each change inserts a `text_versions` row; the first change also stores the value it replaced.
  `created_at` defaults to `clock_timestamp()` so rows written in one transaction keep their order.
- Undo deletes the latest version and restores the one before it (stack). The undone value goes
  to `activity_log`. With only the original left, undo answers `409 nothing_to_undo`.

## Revalidation

- The central API signs `{ siteId, keys, ts }` per attempt and calls the site webhook with up to
  3 attempts (0, 300 ms, 1 s; 3 s timeout each), inside the save request. If all fail, the text
  stays saved, the answer says `revalidated: false` and `activity_log` gets `revalidate.failed`.
  Background retries and the panel's "revalidate now" button are Phase 2 (panel).
- The site calls `revalidateTag(tag, { expire: 0 })` (Next 16): stale content is not served, so
  the reload after a save already has the new text. `"max"` would serve the old HTML once.

## Login rate limiting (added 2026-11-27)

Better Auth's limiter only covers its own HTTP handler, which we do not expose. The login route
counts failures per email in `activity_log` (`auth.login_failed`): 5 failures in 15 minutes
answer `429 too_many_attempts`, checked before the password. It works across instances. Known
trade-off: anyone can lock an account for 15 minutes by failing on purpose.
