import { expect, test, type Page } from "@playwright/test";
import { ADMIN, OUTSIDER, PANEL_URL, SITE_ID } from "./support/env";

async function panelLogin(page: Page, credentials = ADMIN) {
  await page.goto(`${PANEL_URL}/entrar`);
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const rowKeys = (page: Page) =>
  page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-key")));

test("the panel asks for login", async ({ page }) => {
  await page.goto(`${PANEL_URL}/sites`);
  await expect(page).toHaveURL(`${PANEL_URL}/entrar`);
});

test("a wrong password shows an error", async ({ page }) => {
  await panelLogin(page, { email: ADMIN.email, password: "wrong-password" });
  const form = page.getByRole("form", { name: "Entrar no painel" });
  await expect(form.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
});

test("an admin sees the site and searches and filters its texts", async ({ page }) => {
  await panelLogin(page);
  await expect(page).toHaveURL(`${PANEL_URL}/sites`);
  await page.getByRole("link", { name: "Site de exemplo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Textos de Site de exemplo");
  expect((await rowKeys(page)).length).toBe(35);

  const search = page.getByRole("search");
  await search.getByLabel("Buscar").fill("orçamento");
  await search.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/q=or%C3%A7amento/);
  expect(await rowKeys(page)).toEqual(["home.features.free-quote.title", "home.hero.cta"]);

  await search.getByLabel("Buscar").fill("");
  await search.getByLabel("Página").selectOption("about");
  await search.getByRole("button", { name: "Filtrar" }).click();
  const aboutKeys = await rowKeys(page);
  expect(aboutKeys.length).toBeGreaterThan(0);
  expect(aboutKeys.every((key) => key?.startsWith("about."))).toBe(true);

  await search.getByLabel("Página").selectOption("");
  await search.getByLabel("Situação").selectOption("orphan");
  await search.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Nenhum texto encontrado.")).toBeVisible();
});

test("a user without membership sees no site and cannot open it by URL", async ({ page }) => {
  await panelLogin(page, OUTSIDER);
  await expect(page.getByText("Você ainda não tem acesso a nenhum site.")).toBeVisible();

  const response = await page.goto(`${PANEL_URL}/sites/${SITE_ID}`);
  expect(response?.status()).toBe(404);
});

test("logging out ends the panel session", async ({ page }) => {
  await panelLogin(page);
  await expect(page).toHaveURL(`${PANEL_URL}/sites`);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(`${PANEL_URL}/entrar`);
  await page.goto(`${PANEL_URL}/sites`);
  await expect(page).toHaveURL(`${PANEL_URL}/entrar`);
});
