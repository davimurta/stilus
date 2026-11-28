# @davimurta/stilus-next

Stilus SDK for Next.js (App Router, Next 16). Renders editable texts on the server, with ISR and
a default text in the code for every key.

## Setup

Server-only environment variables (never prefix them with `NEXT_PUBLIC_`):

```bash
STILUS_SITE_ID=<site uuid>
STILUS_API_URL=https://your-stilus-panel.example.com
STILUS_SITE_KEY=<site API key>
STILUS_REVALIDATE_SECRET=<site revalidate secret, 32+ characters>
```

Route handlers, in `app/api/stilus/[...stilus]/route.ts`:

```ts
import { createStilusHandlers } from "@davimurta/stilus-next";

export const { GET, POST } = createStilusHandlers();
```

Editor loader, once in the root layout (renders nothing):

```tsx
import { StilusLoader } from "@davimurta/stilus-next/loader";

// inside <body>
<StilusLoader />;
```

Login page for editors, e.g. `app/editar/page.tsx` (static, no cookies read on render):

```tsx
import { LoginForm } from "@davimurta/stilus-next/client";

export default function EditLoginPage() {
  return <LoginForm />;
}
```

If they are missing or invalid, the site still builds and renders the default texts (a warning
is logged once).

## Usage

```tsx
import { Text, t } from "@davimurta/stilus-next";

// Server Component. Renders <span data-stilus-key="home.hero.title">…</span>
<Text k="home.hero.title" description="Título principal">Bem-vindo</Text>

// Another element; its props are forwarded (works with next/link too)
<Text as="h1" k="home.hero.title">Bem-vindo</Text>
<Text as={Link} href="/contato" className="button" k="home.hero.cta">Fale conosco</Text>

// Outside JSX: metadata, alt, placeholder
export async function generateMetadata() {
  return { title: await t("home.meta.title", "Título padrão") };
}
```

- `children` is the default text and must be a plain string.
- Line breaks in a stored value render as `<br>`. Mark such texts with `multiline` so the CLI
  registers them as multiline (single-line texts reject line breaks).
- Values are always rendered as plain text (React escapes them). `dangerouslySetInnerHTML` is
  never forwarded.
- Client Components receive texts as props from a Server Component.

## How texts are fetched

- One request per render pass for the whole site map (`GET /api/v1/sites/{siteId}/texts`),
  deduplicated with `React.cache`.
- Cached by Next (`force-cache`) with the tag `stilus:<siteId>` and `revalidate: 3600`, so pages
  stay static/ISR. The 1h interval is a safety net in case a revalidation webhook is lost.
- Any failure (network, 5 s timeout, non-200, unexpected payload) falls back to the default
  texts. A failed response is not cached, so the next revalidation tries again.

## Route handlers

| Route                         | What it does                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/stilus/login`      | Relays `{ email, password }`; sets `stilus_session` (httpOnly) and `stilus_edit=1` |
| `POST /api/stilus/logout`     | Revokes the session centrally and clears both cookies                              |
| `POST /api/stilus/save`       | `{ key, value }`, relayed to the central API with the editor's token               |
| `POST /api/stilus/undo`       | `{ key }`, relayed the same way                                                    |
| `POST /api/stilus/revalidate` | Signed webhook from the central API; calls `revalidateTag`                         |

- Login, logout, save and undo only accept requests whose `Origin` matches the site (CSRF).
- Permission is always decided by the central API. `stilus_edit` only turns the editor UI on.
- The site API key is never sent with editor requests, and never reaches the browser.
- The webhook is rejected with a bad signature, a `ts` more than 5 minutes away, or another
  `siteId`. On success it calls `revalidateTag("stilus:<siteId>", { expire: 0 })`, so the next
  request renders the new text.

## Editor overlay

- The loader checks the readable `stilus_edit=1` cookie in the browser. Without it nothing else is
  downloaded; with it, the overlay is fetched with a dynamic `import()`. The e2e suite checks that
  no script downloaded by an anonymous visitor contains overlay code.
- Fixed toolbar: editing on/off, status (salvando, salvo, erro, atualização pendente), undo, sair.
- With editing on, editable texts are outlined on hover. A click edits the text in place (plain
  text, `contentEditable="plaintext-only"`); on links and buttons it edits instead of navigating.
  Enter or leaving the field saves, Shift+Enter adds a line break, Esc cancels. Pasted content is
  inserted as plain text.
- After a save or undo the page reloads, so React never works on a DOM it did not render; the
  status message is shown again after the reload.
- Undo walks back the texts saved in this browser tab, one step per click.
- Errors from the central API (for example the character limit) are shown in the toolbar and the
  text stays in edit mode.
