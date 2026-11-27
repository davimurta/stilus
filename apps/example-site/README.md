# example-site

Next.js site used to develop and test the Stilus SDK. Not published.

```bash
pnpm --filter example-site dev    # http://localhost:3100
pnpm --filter example-site build
pnpm --filter example-site start  # http://localhost:3100
```

Pages: `/` (home), `/sobre` (about), `/contato` (contact). Every page must stay static/ISR; the e2e suite checks it.
