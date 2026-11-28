import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../apps/panel/src/db/client";
import { createUserWithPassword } from "../apps/panel/src/lib/users";
import { ADMIN, E2E_DATABASE_URL, OUTSIDER, PANEL_URL, SITE_ID, SITE_URL } from "./support/env";

async function panelLogin(page: Page, credentials = ADMIN) {
  await page.goto(`${PANEL_URL}/entrar`);
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const rowKeys = (page: Page) =>
  page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-key")));

test("the panel sends security headers and cannot be framed", async ({ request }) => {
  const response = await request.get(`${PANEL_URL}/entrar`);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

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

test("editing in the panel updates the site, and history restores the original", async ({
  page,
}) => {
  const original = "Respondemos em até um dia útil.";
  const rawContact = async () =>
    (await page.request.get(`${SITE_URL}/contato`, { headers: { cookie: "" } })).text();

  await panelLogin(page);
  await expect(page).toHaveURL(`${PANEL_URL}/sites`);
  await page.goto(`${PANEL_URL}/sites/${SITE_ID}`);
  await page.getByRole("link", { name: "Editar contact.lead" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("contact.lead");

  const editor = page.getByRole("form", { name: "Texto atual" });
  const field = editor.getByLabel("Texto atual");
  await expect(field).toHaveValue(original);
  await expect(editor.getByText("31 de 160 caracteres")).toBeVisible();

  await field.fill("x".repeat(161));
  await expect(editor.getByText("Acima do limite de 160 caracteres.")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Salvar" })).toBeDisabled();

  await field.fill("Respondemos em até 2 horas.");
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(editor.getByRole("status")).toHaveText("Salvo. O site já foi atualizado.");
  await expect.poll(rawContact, { timeout: 10_000 }).toContain(">Respondemos em até 2 horas.</p>");

  const history = page.getByRole("region", { name: "Histórico" }).getByRole("listitem");
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText("Respondemos em até 2 horas.");
  await expect(history.nth(0)).toContainText("Admin");
  await expect(history.nth(1)).toContainText(original);

  await history.nth(1).getByRole("button", { name: "Restaurar" }).click();
  await expect(history).toHaveCount(3);
  await expect(field).toHaveValue(original);
  await expect.poll(rawContact, { timeout: 10_000 }).toContain(`>${original}</p>`);
});

/** A fresh user per attempt, so a retry never finds the password already changed. */
async function freshUser() {
  const credentials = {
    email: `changer-${randomUUID()}@example.com`,
    password: "e2e-changer-password",
  };
  const { db, sql } = createDatabase(E2E_DATABASE_URL);
  try {
    await createUserWithPassword(db, { name: "Changer", ...credentials });
  } finally {
    await sql.end();
  }
  return credentials;
}

test("a user changes their own password", async ({ page }) => {
  const CHANGER = await freshUser();
  await panelLogin(page, CHANGER);
  await expect(page).toHaveURL(`${PANEL_URL}/sites`);
  await page.getByRole("link", { name: "Minha conta" }).click();
  const form = page.getByRole("form", { name: "Trocar senha" });
  // React resets the form after each action, so every attempt fills all fields.
  async function attempt(current: string, next: string, confirm: string) {
    await form.getByLabel("Senha atual").fill(current);
    await form.getByLabel("Nova senha", { exact: true }).fill(next);
    await form.getByLabel("Repita a nova senha").fill(confirm);
    await form.getByRole("button", { name: "Trocar senha" }).click();
  }

  await attempt("not-my-password", "uma-senha-nova-longa", "uma-senha-nova-longa");
  await expect(form.getByRole("status")).toHaveText("A senha atual está incorreta.");

  await attempt(CHANGER.password, "uma-senha-nova-longa", "outra-coisa-qualquer");
  await expect(form.getByRole("status")).toHaveText("As duas senhas novas não são iguais.");

  await attempt(CHANGER.password, "uma-senha-nova-longa", "uma-senha-nova-longa");
  await expect(page).toHaveURL(`${PANEL_URL}/conta?senha=trocada`);
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Senha trocada. As outras sessões foram encerradas.",
  );

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(`${PANEL_URL}/entrar`);
  await panelLogin(page, CHANGER);
  await expect(page.getByRole("alert").filter({ hasText: "incorretos" })).toBeVisible();
  await panelLogin(page, { email: CHANGER.email, password: "uma-senha-nova-longa" });
  await expect(page).toHaveURL(`${PANEL_URL}/sites`);
});
