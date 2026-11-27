# 0003. SDK fetching, caching and fallback

Date: 2026-11-27
Status: accepted

## Decision

- The SDK fetches the whole text map in one request with `cache: "force-cache"`,
  `next.tags: ["stilus:<siteId>"]` and `next.revalidate: 3600`. Next 16 only caches requests with
  an `authorization` header when `force-cache` is explicit.
- Timeout (5 s) is a `Promise.race`, not an `AbortSignal`: a signal opts the fetch out of Next's
  request memoization.
- **Any failure falls back to the default text in the code.** The SDK never throws, so neither
  the build nor a page can break because of the central API (principle 3).
- Verified on Next 16.4.6 (e2e `static-pages.spec.ts`): even when the fetch fails during the
  build, the page is prerendered with `revalidate: 3600`, so it recovers within an hour.
- Missing settings (`STILUS_*`) also fall back to defaults, so a fresh clone builds without a
  panel.

## Known trade-off

If the central API is down exactly when an ISR page regenerates, that regeneration renders
the defaults and they stay cached until the next revalidation (at most 1h, or the next edit).
The alternative (throw on runtime failures so Next keeps the last good page) protects edited
texts but breaks dynamic pages during an outage, which conflicts with principle 3. Revisit if
outages turn out to matter in practice.

## Not done

- No client-side provider: Client Components receive texts as props. Add one only when a real
  site needs it.
- Multiline values render as one text node; line breaks are not converted. To decide with the
  editor overlay (slice 5).
