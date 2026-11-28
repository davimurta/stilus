import { signWebhookBody } from "@davimurta/stilus-shared";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { ADMIN, OUTSIDER, PANEL_URL, REVALIDATE_SECRET, SITE_ID, SITE_URL } from "./support/env";

// These tests change texts in the e2e database, so they run one after the other and only touch
// keys that no other spec asserts on.
test.describe.configure({ mode: "serial" });

const KEY = "home.features.same-day.title";
const ORIGINAL = "Atendimento no mesmo dia";

/** Raw server HTML, as a visitor or a crawler gets it: no cookies, no JavaScript. */
async function rawHtml(request: APIRequestContext, path = "/") {
  const response = await request.get(`${SITE_URL}${path}`, { headers: { cookie: "" } });
  return response.text();
}

async function siteLogin(request: APIRequestContext, credentials = ADMIN) {
  return request.post(`${SITE_URL}/api/stilus/login`, {
    data: credentials,
    headers: { origin: SITE_URL },
  });
}

test("editor logs in through /editar and gets the session cookie and the edit flag", async ({
  page,
  context,
}) => {
  await page.goto(`${SITE_URL}/editar`);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill(ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(`${SITE_URL}/`);
  const cookies = await context.cookies(SITE_URL);
  const session = cookies.find((cookie) => cookie.name === "stilus_session");
  const flag = cookies.find((cookie) => cookie.name === "stilus_edit");
  expect(session?.httpOnly).toBe(true);
  expect(flag?.value).toBe("1");
  expect(flag?.httpOnly).toBe(false);
  expect(await page.evaluate(() => document.cookie)).not.toContain("stilus_session");
});

test("wrong password shows an error and sets no cookie", async ({ page, context }) => {
  await page.goto(`${SITE_URL}/editar`);
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill("wrong-password");
  await page.getByRole("button", { name: "Entrar" }).click();

  // Scoped to the form: Next injects its own role="alert" route announcer.
  const form = page.getByRole("form", { name: "Entrar para editar" });
  await expect(form.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  expect(await context.cookies(SITE_URL)).toEqual([]);
});

test("a saved text shows up in the raw HTML within seconds, and undo restores it", async ({
  request,
}) => {
  expect(await rawHtml(request)).toContain(`>${ORIGINAL}</h2>`);
  expect((await siteLogin(request)).status()).toBe(200);

  const save = await request.post(`${SITE_URL}/api/stilus/save`, {
    data: { key: KEY, value: "Atendimento em até 2 horas" },
    headers: { origin: SITE_URL },
  });
  expect(save.status()).toBe(200);
  expect(await save.json()).toMatchObject({ changed: true, revalidated: true });

  await expect
    .poll(() => rawHtml(request), { timeout: 10_000 })
    .toContain(">Atendimento em até 2 horas</h2>");

  const undo = await request.post(`${SITE_URL}/api/stilus/undo`, {
    data: { key: KEY },
    headers: { origin: SITE_URL },
  });
  expect(undo.status()).toBe(200);
  expect(await undo.json()).toMatchObject({ value: ORIGINAL });

  await expect.poll(() => rawHtml(request), { timeout: 10_000 }).toContain(`>${ORIGINAL}</h2>`);
});

test("a user without permission on the site cannot save (central API)", async ({ request }) => {
  const login = await request.post(`${PANEL_URL}/api/v1/auth/login`, { data: OUTSIDER });
  expect(login.status()).toBe(200);
  const { token } = (await login.json()) as { token: string };

  const response = await request.put(`${PANEL_URL}/api/v1/sites/${SITE_ID}/texts/${KEY}`, {
    data: { value: "Invadido" },
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status()).toBe(403);
  expect(await rawHtml(request)).not.toContain("Invadido");
});

test("a user without permission on the site cannot log in on it", async ({ request }) => {
  const response = await siteLogin(request, OUTSIDER);
  expect(response.status()).toBe(403);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});

test("a save without the session cookie is rejected", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext();
  const response = await anonymous.post(`${SITE_URL}/api/stilus/save`, {
    data: { key: KEY, value: "Anônimo" },
    headers: { origin: SITE_URL },
  });
  expect(response.status()).toBe(401);
  await anonymous.dispose();
});

test.describe("revalidation webhook on the site", () => {
  function send(request: APIRequestContext, payload: unknown, secret = REVALIDATE_SECRET) {
    const body = JSON.stringify(payload);
    return request.post(`${SITE_URL}/api/stilus/revalidate`, {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-stilus-signature": signWebhookBody(body, secret),
      },
    });
  }

  test("accepts a valid signed webhook", async ({ request }) => {
    const response = await send(request, { siteId: SITE_ID, keys: [KEY], ts: Date.now() });
    expect(response.status()).toBe(200);
  });

  test("rejects an invalid signature", async ({ request }) => {
    const response = await send(
      request,
      { siteId: SITE_ID, keys: [KEY], ts: Date.now() },
      "not-the-site-secret-00000000000000000",
    );
    expect(response.status()).toBe(401);
  });

  test("rejects a timestamp older than 5 minutes", async ({ request }) => {
    const response = await send(request, {
      siteId: SITE_ID,
      keys: [KEY],
      ts: Date.now() - 6 * 60 * 1000,
    });
    expect(response.status()).toBe(401);
  });
});
