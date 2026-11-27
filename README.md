# Stilus

Inline text editing for Next.js sites, without redeploys.

A central service stores the texts (key-value). Sites read them through an SDK with ISR. Editors open
the published site, click a text, change it and save. The page regenerates in seconds.

> Work in progress: Phase 1 (MVP).

## Layout

```
apps/
  panel/          Central API (and later the admin panel), Postgres + Drizzle
  example-site/   Next.js site used to develop and test the SDK
packages/
  next/           @stilus/next: SDK (Text, t)
  shared/         Shared types and zod schemas (text key format)
docs/decisions/   Short architecture decision records
e2e/              Playwright end-to-end tests
```

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm via Corepack: `corepack enable`
- Docker (Postgres for development and integration tests)

## Scripts

| Command          | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `pnpm db:up`     | Starts Postgres 17 (docker compose, port 54329)                  |
| `pnpm lint`      | ESLint in every package and in the root files                    |
| `pnpm typecheck` | TypeScript in every package and in the root files                |
| `pnpm test`      | Vitest unit tests                                                |
| `pnpm build`     | Builds every package and app                                     |
| `pnpm test:e2e`  | Playwright: panel + example site builds (needs `db:up`, `build`) |
| `pnpm check`     | Format check, lint, typecheck, test, build and e2e, in order     |

First run of the e2e suite needs a browser: `pnpm exec playwright install chromium`.

## License

MIT
