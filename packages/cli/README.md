# stilus (CLI)

Finds the editable texts of a Next.js site and syncs them with the central Stilus API.

```bash
stilus scan [dir] [--json]   # list the texts found in the code
stilus sync [dir]            # scan, then POST the keys to the central API
```

`dir` defaults to the current directory. `node_modules`, build output (`.next`, `dist`, `build`,
`out`) and hidden folders are skipped.

## What it finds

Only `Text` and `t` imported from `@stilus/next` (aliases work):

```tsx
<Text as="h1" k="home.hero.title" description="Título principal">Bem-vindo</Text>
<Text as="p" multiline k="about.body">Texto com várias linhas</Text>
await t("home.meta.title", "Título padrão");
```

- The source is parsed with the TypeScript compiler (AST), never with regex.
- Keys, descriptions and default texts must be string literals; anything else is an error with
  file and line, and `sync` sends nothing.
- The default text of `<Text>` follows React's whitespace rule, so it matches what the site renders.
- `multiline` marks texts that accept line breaks. The page is the first segment of the key.
- The same key with different default texts is a warning (the first one wins).

## Sync

Needs `STILUS_SITE_ID`, `STILUS_API_URL` and `STILUS_SITE_KEY` (env, or `.env.local` / `.env` in
the current directory). Meant to run in CI or before `next build`.

- New keys are created with their default text.
- Keys that left the code become `orphan` (kept with their history, hidden from the site).
- Edited values are never overwritten. A value never edited follows a new default.
- An empty scan is refused, so a wrong directory cannot orphan every key.
