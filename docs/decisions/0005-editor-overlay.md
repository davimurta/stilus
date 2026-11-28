# 0005. Editor overlay

Date: 2026-11-27
Status: accepted

## Decision

- **Separate entry points**: `@davimurta/stilus-next/loader` (tiny client component) and
  `@davimurta/stilus-next/client` (login form). The overlay module is only reachable through the loader's
  dynamic `import()`, so bundlers put it in its own chunk. Verified by e2e: no script fetched by an
  anonymous visitor contains overlay code; a logged-in editor's page does.
- **Plain DOM, not React**, for the overlay: it edits server-rendered elements in place and the page
  reloads after each save or undo. React never reconciles a DOM it did not produce.
- **Undo stack per tab** (`sessionStorage`): the toolbar undoes what this editor saved in this tab.
  The central API keeps the full version history; undo there is always "restore the previous
  version" of one key.
- **Character limit**: the API contract `GET texts` only returns values, so the overlay does not
  know `max_length` before saving. The limit is enforced by the central API and its message
  ("O texto pode ter no máximo N caracteres.") is shown while the text stays in edit mode.

## Follow-up decisions (2026-11-27)

- **Multiline texts**: `<Text>` renders `\n` as `<br>` elements (React elements, never HTML).
  Single-line texts cannot contain `\n` (the central API rejects it), so no `kind` is needed on the
  site. Shift+Enter adds the line break in the overlay; Esc restores the original nodes.
- **Live character counter**: not in the overlay. The panel (Phase 2) shows limits; the overlay
  keeps showing the central API's limit message on save.
