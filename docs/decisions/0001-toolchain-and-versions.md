# 0001. Toolchain and versions

Date: 2026-11-27
Status: accepted

## Context

Phase 1 needs a monorepo with a Next.js example site, shared packages and a test setup that CI can
run with a single command.

## Decision

- **Next.js 16.4.6** (latest stable) for `example-site`. The SDK will declare `next >=16 <17` as
  its peer range. The cache APIs changed between 14, 15 and 16; supporting one major keeps the
  revalidation code and its tests simple. Widening the range is a later, explicit decision.
- **pnpm 12 via Corepack** (`packageManager` field) + **Turborepo** for task orchestration.
- **TypeScript 6.0**, not 7.0. `typescript-eslint` 8.x supports `<6.1.0` only.
- **ESLint 9**, not 10. `eslint-config-next` 16 depends on plugins (`eslint-plugin-react`,
  `eslint-plugin-import`, `eslint-plugin-jsx-a11y`) whose peer range stops at ESLint 9. pnpm
  reports ESLint 9 as deprecated; revisit when those plugins support 10.
- **vite 8.3.8** (Vitest 5 peer). 8.4.0 was newer than pnpm's minimum release age policy; we keep
  the policy instead of adding an exception.
- **Vitest** runs from the root over `packages/*/src` and `apps/*/src`. **Playwright** runs from the
  root against `next start` (production build), because static/ISR behaviour does not exist in
  `next dev`.
- `pnpm check` runs format check, lint, typecheck, unit tests, build and e2e, in that order. CI
  (GitHub Actions) runs exactly this script.
- `packages/next` and `packages/cli` are created when they get real code (slice 3 and Phase 2), not
  as empty shells.
- License: MIT.

## Consequences

Sites on Next 15 cannot use the SDK until the peer range is widened and tested.
