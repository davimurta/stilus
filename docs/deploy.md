# Deploy

Two setups are documented: **Railway** (panel, Postgres and sites in one place) and
**Vercel + Neon**. Sites must run Next.js with a server; `output: "export"` does not work, because
Stilus needs ISR and route handlers.

## Railway

### Panel and database

1. New project → **Add PostgreSQL**.
2. **New service → GitHub repo** (this repository), branch `main`. Settings:
   - Root directory: repository root (the panel uses workspace packages).
   - Build command: `pnpm turbo run build --filter=panel`
   - Pre-deploy command: `pnpm --filter panel db:migrate`
   - Start command: `pnpm --filter panel start` (listens on Railway's `PORT`)
3. Variables of the panel service:

   | Name                 | Value                                            |
   | -------------------- | ------------------------------------------------ |
   | `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}`                     |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32`                        |
   | `BETTER_AUTH_URL`    | The panel's public URL (Railway domain or yours) |

4. Generate a domain, open `https://<panel>/entrar`, then create the first user and site
   (section "First user and site" below), using the Postgres **public** connection string
   from your machine.

### Sites on Railway

A Next.js site runs with `next start` as usual. **Keep one replica** (the default): the ISR cache
lives on the instance, and the revalidation webhook reaches only one replica. With more replicas,
the others would show the old text until the 1-hour safety net, unless a shared cache handler is
configured.

## Vercel + Neon

### 1. Database (Neon)

1. Create a Neon project (region close to the panel, e.g. `aws-sa-east-1`).
2. Copy the **pooled** connection string (host contains `-pooler`). The client uses
   `prepare: false`, so it works behind the pooler.
3. Apply the migrations from your machine:

   ```bash
   DATABASE_URL="postgres://…-pooler…/neondb?sslmode=require" pnpm --filter panel db:migrate
   ```

   Or add `DATABASE_URL` as a GitHub Actions secret: the **Migrate** workflow applies migrations
   on every push to `main` (and can be run by hand). On Railway the pre-deploy command does it.

### 2. Panel (Vercel)

1. Import the repository in Vercel. **Root Directory**: `apps/panel`. Framework: Next.js.
   Vercel detects the pnpm workspace and builds the workspace packages the panel uses.
2. Environment variables (Production):

   | Name                 | Value                                            |
   | -------------------- | ------------------------------------------------ |
   | `DATABASE_URL`       | Neon pooled connection string                    |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32`                        |
   | `BETTER_AUTH_URL`    | The panel URL, e.g. `https://stilus.example.com` |

3. Deploy, then open `https://<panel>/entrar`.

Do not point preview deployments at the production database.

## First user and site

From your machine, with the production `DATABASE_URL`:

```bash
export DATABASE_URL="postgres://…"
pnpm --filter panel admin create-user --email voce@empresa.com --name "Seu nome"
pnpm --filter panel admin create-site --name "Meu site" --domain meusite.com.br \
  --revalidate-url https://meusite.com.br/api/stilus/revalidate --owner voce@empresa.com
pnpm --filter panel admin create-user --email editor@empresa.com --name "Editor"
pnpm --filter panel admin grant --email editor@empresa.com --site <siteId> --role editor
```

Passwords and the site settings are printed once. Store them in a password manager.

## Each site

1. `pnpm add @davimurta/stilus-next`, `pnpm add -D @davimurta/stilus` and `pnpm exec stilus init` (route, `/editar`, `.env.example`).
2. Add `<StilusLoader />` to the root layout and mark texts with `<Text>` / `t()`.
3. Set on the host (server-only, never `NEXT_PUBLIC_`):
   `STILUS_SITE_ID`, `STILUS_API_URL` (panel URL), `STILUS_SITE_KEY`, `STILUS_REVALIDATE_SECRET`.
4. Sync keys before each build, e.g. in CI:

   ```yaml
   - run: pnpm exec stilus sync
     env:
       STILUS_SITE_ID: ${{ secrets.STILUS_SITE_ID }}
       STILUS_API_URL: ${{ secrets.STILUS_API_URL }}
       STILUS_SITE_KEY: ${{ secrets.STILUS_SITE_KEY }}
   ```

5. Check: edit a text at `https://<site>/editar`, then view the page source.

## Rotating secrets

- Site API key: `pnpm --filter panel admin rotate-site-key --site <id>`, then update
  `STILUS_SITE_KEY` on the site and in CI.
- `BETTER_AUTH_SECRET`: changing it signs everyone out.

## Publishing the packages

`@davimurta/stilus-next`, `@davimurta/stilus` (CLI) and `@davimurta/stilus-shared` are published
to npm under the `@davimurta` scope:

```bash
npm login
pnpm -r --filter "./packages/*" publish --access public
```

`pnpm publish` replaces `workspace:*` with real versions. Bump the versions first.
