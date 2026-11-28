// Shared settings of the e2e stack (see playwright.config.ts).
export const PANEL_PORT = 3200;
export const SITE_PORT = 3100;
export const OFFLINE_SITE_PORT = 3101;
/** Nothing listens here: the "offline" site build points its API URL at it. */
export const DEAD_API_PORT = 3999;

export const PANEL_URL = `http://localhost:${PANEL_PORT}`;
export const SITE_URL = `http://localhost:${SITE_PORT}`;
export const OFFLINE_SITE_URL = `http://localhost:${OFFLINE_SITE_PORT}`;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://stilus:stilus@localhost:54329/stilus_e2e";

export const SITE_ID = "00000000-0000-4000-8000-000000000001";
export const SITE_KEY = "stilus_sk_e2e_only_0000000000000000000000000000";
export const REVALIDATE_SECRET = "e2e-only-revalidate-secret-000000000000";
export const BETTER_AUTH_SECRET = "e2e-only-better-auth-secret-0000000000000";

export const ADMIN = { email: "admin@example.com", password: "e2e-admin-password" };
/** Only used by the password change test. */
export const CHANGER = { email: "changer@example.com", password: "e2e-changer-password" };
/** Has an account but no membership on the example site. */
export const OUTSIDER = { email: "outsider@example.com", password: "e2e-outsider-password" };

/** Texts changed in the database before the site is built, to prove they come from the API. */
export const API_TEXTS = {
  "home.hero.title": "Título que veio da API",
  "home.meta.title": "Início pela API | Oficina Exemplo",
  "about.title": "Sobre, pela API",
  "contact.title": "Contato, pela API",
  "home.features.free-quote.body": "<script>window.__stilusXss = true</script><b>sem custo</b>",
} as const;
