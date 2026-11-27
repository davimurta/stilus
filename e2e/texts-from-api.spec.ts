import { expect, test } from "@playwright/test";
import { API_TEXTS, SITE_URL } from "./support/env";

// The site is built while the panel is up, with API_TEXTS stored in the database.

test("server HTML carries the texts stored in the API, not the code defaults", async ({
  request,
}) => {
  const html = await (await request.get(`${SITE_URL}/`)).text();

  expect(html).toContain(`<title>${API_TEXTS["home.meta.title"]}</title>`);
  expect(html).toContain(`>${API_TEXTS["home.hero.title"]}</h1>`);
  expect(html).not.toContain("Consertos rápidos, feitos com cuidado");
  // Keys without a changed value still render (seed value equals the default).
  expect(html).toContain("Peça um orçamento");
});

test("each page reads its own texts from the API", async ({ request }) => {
  const about = await (await request.get(`${SITE_URL}/sobre`)).text();
  const contact = await (await request.get(`${SITE_URL}/contato`)).text();
  expect(about).toContain(API_TEXTS["about.title"]);
  expect(contact).toContain(API_TEXTS["contact.title"]);
});

test("editable texts are marked with their key", async ({ request }) => {
  const html = await (await request.get(`${SITE_URL}/`)).text();
  expect(html).toContain('<h1 data-stilus-key="home.hero.title">');
  expect(html).toMatch(/<a[^>]*data-stilus-key="home\.hero\.cta"[^>]*>Peça um orçamento<\/a>/);
});

test("HTML stored in a text is escaped and never executed", async ({ page, request }) => {
  const html = await (await request.get(`${SITE_URL}/`)).text();
  expect(html).toContain("&lt;script&gt;window.__stilusXss = true&lt;/script&gt;&lt;b&gt;");
  expect(html).not.toContain("<script>window.__stilusXss");

  await page.goto(`${SITE_URL}/`);
  const item = page.locator('[data-stilus-key="home.features.free-quote.body"]');
  await expect(item).toHaveText(API_TEXTS["home.features.free-quote.body"]);
  await expect(item.locator("b")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { __stilusXss?: boolean }).__stilusXss),
  ).toBeUndefined();
});

test("navigation works in the browser without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const nav = page.getByRole("navigation", { name: "Principal" });
  await page.goto(`${SITE_URL}/`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(API_TEXTS["home.hero.title"]);

  await nav.getByRole("link", { name: "Sobre" }).click();
  await expect(page).toHaveURL(`${SITE_URL}/sobre`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(API_TEXTS["about.title"]);

  await nav.getByRole("link", { name: "Contato" }).click();
  await expect(page).toHaveURL(`${SITE_URL}/contato`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(API_TEXTS["contact.title"]);

  expect(errors).toEqual([]);
});
