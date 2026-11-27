import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const pages = [
  {
    path: "/",
    title: "Início | Oficina Exemplo",
    texts: ["Consertos rápidos, feitos com cuidado", "Peça um orçamento", "Garantia de 90 dias"],
  },
  {
    path: "/sobre",
    title: "Sobre | Oficina Exemplo",
    texts: ["Sobre a Oficina Exemplo", "Nossa história", "Como trabalhamos"],
  },
  {
    path: "/contato",
    title: "Contato | Oficina Exemplo",
    texts: ["Fale com a gente", "Enviar mensagem", "Respondemos em até um dia útil."],
  },
];

test.describe("raw server HTML contains every text (SEO)", () => {
  for (const page of pages) {
    test(`${page.path} serves its texts without JavaScript`, async ({ request }) => {
      const response = await request.get(page.path);
      expect(response.status()).toBe(200);

      const html = await response.text();
      expect(html).toContain(`<title>${page.title}</title>`);
      for (const text of page.texts) {
        expect(html).toContain(text);
      }
    });
  }
});

test("public pages are prerendered (static/ISR) in the build output", () => {
  const manifestPath = fileURLToPath(
    new URL("../apps/example-site/.next/prerender-manifest.json", import.meta.url),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    routes: Record<string, unknown>;
  };

  for (const page of pages) {
    expect(Object.keys(manifest.routes)).toContain(page.path);
  }
});

test("navigation between pages works in the browser without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Consertos rápidos, feitos com cuidado",
  );

  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Sobre" })
    .click();
  await expect(page).toHaveURL("/sobre");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sobre a Oficina Exemplo");

  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Contato" })
    .click();
  await expect(page).toHaveURL("/contato");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fale com a gente");

  expect(errors).toEqual([]);
});
