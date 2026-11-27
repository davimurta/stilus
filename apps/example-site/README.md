# example-site

Next.js site used to develop and test the Stilus SDK. Not published.

```bash
pnpm --filter example-site dev    # http://localhost:3100
pnpm --filter example-site build
pnpm --filter example-site start  # http://localhost:3100
```

Pages: `/` (home), `/sobre` (about), `/contato` (contact). Every page must stay static/ISR; the e2e suite checks it.

Texts use `<Text>` and `t()` from `@stilus/next`. To read them from a local panel, copy
`.env.example` to `.env` (values match the panel development seed). Without it, the site renders
the default texts.

`EXAMPLE_SITE_DIST_DIR` changes the build folder; the e2e suite uses it to build the site twice.
