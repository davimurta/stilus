import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, SITE_URL } from "./support/env";

// Changes texts in the e2e database: serial, and only keys no other spec asserts on.
test.describe.configure({ mode: "serial" });

const HOURS_KEY = "contact.hours";
const HOURS_ORIGINAL = "Horário: segunda a sexta, das 8h às 18h";
/** Only the overlay code contains this attribute name; the loader does not. */
const OVERLAY_MARKER = "data-stilus-overlay";

async function loginInBrowser(context: BrowserContext) {
  const response = await context.request.post(`${SITE_URL}/api/stilus/login`, {
    data: ADMIN,
    headers: { origin: SITE_URL },
  });
  expect(response.status()).toBe(200);
}

/** Bodies of every script the page downloaded. */
function collectScripts(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      bodies.push(response.text().catch(() => ""));
    }
  });
  return bodies;
}

async function rawHtml(page: Page, path: string) {
  const response = await page.request.get(`${SITE_URL}${path}`, { headers: { cookie: "" } });
  return response.text();
}

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edição de textos" });
const statusText = (page: Page) => toolbar(page).getByRole("status");
const hours = (page: Page) => page.locator(`[data-stilus-key="${HOURS_KEY}"]`);

/** Runs `action` and waits for the overlay's call to the site route to finish. */
async function afterCall(page: Page, path: "save" | "undo", action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/stilus/${path}`)),
    action(),
  ]);
  expect(response.status()).toBe(200);
}

/** After a save or undo the overlay reloads the page and shows the message again. */
async function expectReloadedWith(page: Page, message: string) {
  await page.waitForEvent("load");
  await expect(statusText(page)).toHaveText(message);
}

test("an anonymous visitor never downloads the editor overlay", async ({ page }) => {
  const scripts = collectScripts(page);
  for (const path of ["/", "/sobre", "/contato"]) {
    await page.goto(`${SITE_URL}${path}`);
    await page.waitForLoadState("networkidle");
  }

  await expect(toolbar(page)).toHaveCount(0);
  const bodies = await Promise.all(scripts);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.filter((body) => body.includes(OVERLAY_MARKER))).toEqual([]);
});

test("a logged-in editor downloads the overlay and sees the toolbar", async ({ page, context }) => {
  await loginInBrowser(context);
  const scripts = collectScripts(page);
  await page.goto(`${SITE_URL}/contato`);

  await expect(toolbar(page)).toBeVisible();
  await expect(statusText(page)).toHaveText("Clique em um texto destacado para editar.");
  await page.waitForLoadState("networkidle");
  const bodies = await Promise.all(scripts);
  expect(bodies.some((body) => body.includes(OVERLAY_MARKER))).toBe(true);
});

test("clicking a text, typing and pressing Enter saves it into the raw HTML", async ({
  page,
  context,
}) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);

  await hours(page).click();
  await expect(hours(page)).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.type("Horário: todos os dias, das 7h às 22h");
  await afterCall(page, "save", () => page.keyboard.press("Enter"));

  await expectReloadedWith(page, "Salvo.");
  await expect(hours(page)).toHaveText("Horário: todos os dias, das 7h às 22h");
  await expect(hours(page)).not.toHaveAttribute("contenteditable");
  await expect
    .poll(() => rawHtml(page, "/contato"), { timeout: 10_000 })
    .toContain(">Horário: todos os dias, das 7h às 22h</p>");

  // Leave the original text for the next tests.
  await afterCall(page, "undo", () =>
    toolbar(page).getByRole("button", { name: "Desfazer" }).click(),
  );
  await expectReloadedWith(page, "Desfeito.");
  await expect(hours(page)).toHaveText(HOURS_ORIGINAL);
});

test("the undo button restores the previous version, one step per click", async ({
  page,
  context,
}) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);
  const undo = toolbar(page).getByRole("button", { name: "Desfazer" });
  await expect(undo).toBeDisabled();

  for (const value of ["Horário A", "Horário B"]) {
    await hours(page).click();
    await page.keyboard.type(value);
    await afterCall(page, "save", () => page.keyboard.press("Enter"));
    await expectReloadedWith(page, "Salvo.");
  }
  await expect(hours(page)).toHaveText("Horário B");

  await afterCall(page, "undo", () => undo.click());
  await expectReloadedWith(page, "Desfeito.");
  await expect(hours(page)).toHaveText("Horário A");

  await afterCall(page, "undo", () => undo.click());
  await expectReloadedWith(page, "Desfeito.");
  await expect(hours(page)).toHaveText(HOURS_ORIGINAL);
  await expect(undo).toBeDisabled();
  await expect
    .poll(() => rawHtml(page, "/contato"), { timeout: 10_000 })
    .toContain(`>${HOURS_ORIGINAL}</p>`);
});

test("Esc cancels the edit without saving", async ({ page, context }) => {
  await loginInBrowser(context);
  let saves = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/stilus/save")) saves += 1;
  });
  await page.goto(`${SITE_URL}/contato`);

  await hours(page).click();
  await page.keyboard.type("Não deveria salvar");
  await page.keyboard.press("Escape");

  await expect(hours(page)).toHaveText(HOURS_ORIGINAL);
  await expect(hours(page)).not.toHaveAttribute("contenteditable");
  expect(saves).toBe(0);
});

test("a text above the limit shows the limit and stays in edit mode", async ({ page, context }) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);

  await hours(page).click();
  await page.keyboard.type("x".repeat(161));
  await page.keyboard.press("Enter");

  await expect(statusText(page)).toHaveText("O texto pode ter no máximo 160 caracteres.");
  await expect(hours(page)).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("Escape");
  await expect(hours(page)).toHaveText(HOURS_ORIGINAL);
});

test("typed HTML is saved as plain text and rendered escaped", async ({ page, context }) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);

  await hours(page).click();
  await page.keyboard.type("<img src=x onerror=alert(1)>");
  await afterCall(page, "save", () => page.keyboard.press("Enter"));
  await expectReloadedWith(page, "Salvo.");

  await expect(hours(page)).toHaveText("<img src=x onerror=alert(1)>");
  await expect(hours(page).locator("img")).toHaveCount(0);
  expect(await rawHtml(page, "/contato")).toContain("&lt;img src=x onerror=alert(1)&gt;");

  await afterCall(page, "undo", () =>
    toolbar(page).getByRole("button", { name: "Desfazer" }).click(),
  );
  await expectReloadedWith(page, "Desfeito.");
  await expect(hours(page)).toHaveText(HOURS_ORIGINAL);
});

test("Shift+Enter adds a line break to a multiline text, rendered as <br>", async ({
  page,
  context,
}) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/sobre`);
  const body = page.locator('[data-stilus-key="about.process.body"]');

  await body.click();
  await page.keyboard.type("Primeira linha");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Segunda linha");
  await afterCall(page, "save", () => page.keyboard.press("Enter"));
  await expectReloadedWith(page, "Salvo.");

  await expect(body.locator("br")).toHaveCount(1);
  expect(await rawHtml(page, "/sobre")).toContain(
    'data-stilus-key="about.process.body">Primeira linha<br/>Segunda linha</p>',
  );

  // Esc restores the line break too.
  await body.click();
  await page.keyboard.type("descartado");
  await page.keyboard.press("Escape");
  await expect(body.locator("br")).toHaveCount(1);

  await afterCall(page, "undo", () =>
    toolbar(page).getByRole("button", { name: "Desfazer" }).click(),
  );
  await expectReloadedWith(page, "Desfeito.");
  await expect(body.locator("br")).toHaveCount(0);
});

test("in edit mode a link is edited instead of followed; with editing off it navigates", async ({
  page,
  context,
}) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);
  const brand = page.locator('[data-stilus-key="layout.header.brand"]');

  await brand.click();
  await expect(page).toHaveURL(`${SITE_URL}/contato`);
  await expect(brand).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("Escape");

  await toolbar(page).getByRole("button", { name: "Edição ligada" }).click();
  await expect(toolbar(page).getByRole("button", { name: "Edição desligada" })).toBeVisible();
  await brand.click();
  await expect(page).toHaveURL(`${SITE_URL}/`);
});

test("logging out removes the toolbar and the cookies", async ({ page, context }) => {
  await loginInBrowser(context);
  await page.goto(`${SITE_URL}/contato`);
  await toolbar(page).getByRole("button", { name: "Sair" }).click();

  await expect(toolbar(page)).toHaveCount(0);
  const names = (await context.cookies(SITE_URL)).map((cookie) => cookie.name);
  expect(names).not.toContain("stilus_session");
  expect(names).not.toContain("stilus_edit");
});
