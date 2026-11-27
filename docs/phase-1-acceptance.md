# Phase 1 acceptance criteria

Each criterion maps to automated tests that run in `pnpm check` and in CI.

| Criterion                                                                                           | Tests                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing a text in the overlay puts the new text in the raw page HTML within seconds, without deploy | `e2e/overlay.spec.ts` "clicking a text, typing and pressing Enter saves it into the raw HTML"; `e2e/editing.spec.ts` "a saved text shows up in the raw HTML within seconds" |
| An anonymous visitor does not download the editor bundle                                            | `e2e/overlay.spec.ts` "an anonymous visitor never downloads the editor overlay" (inspects every script body; the editor test proves the check can see the overlay)          |
| Public pages stay static/ISR (build output)                                                         | `e2e/static-pages.spec.ts` reads `prerender-manifest.json` of both e2e builds: `/`, `/sobre`, `/contato` prerendered with `revalidate: 3600`                                |
| With the central API down, build and pages work with the default texts                              | `e2e/fallback.spec.ts` (site built and served with the API URL pointing at a dead port); `packages/next/src/fetch-texts.test.ts`, `text.test.tsx`                           |
| Webhook with an invalid signature or an old `ts` is rejected                                        | `e2e/editing.spec.ts` "revalidation webhook on the site"; `packages/shared/src/webhook.test.ts`; `packages/next/src/handlers.test.ts`                                       |
| A user without permission on the site cannot save (API tested directly)                             | `e2e/editing.spec.ts` "a user without permission on the site cannot save (central API)"; `apps/panel/test/api/edit-texts.test.ts` "authentication and permission"           |
| Undo restores the previous version                                                                  | `e2e/overlay.spec.ts` "the undo button restores the previous version, one step per click"; `apps/panel/test/api/edit-texts.test.ts` undo suite                              |

Security cases also covered: forged/expired sessions, site key used as a user token, CSRF
(Origin check), text above the limit, control characters, HTML/script in texts (stored as typed,
rendered escaped, never executed), unknown site / wrong site API key (same `401`), oversized
bodies.

## Not automated

- Visual regression of `<Text>` (no wrapper element; each text renders the same tag as before).
  Screenshot baselines differ between macOS and the Linux CI runner, so they were left out.
