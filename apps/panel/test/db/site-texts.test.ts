import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { texts } from "@/db/schema";
import { countOrphans, listSitePages, listSiteTexts, textFiltersSchema } from "@/lib/site-texts";
import { createSite, createText, db } from "../helpers";

async function seedTexts() {
  const { site } = await createSite();
  const rows = [
    ["home.hero.title", "Bem-vindo à oficina", "home", "Título principal"],
    ["home.hero.cta", "Peça um orçamento", "home", null],
    ["about.title", "Sobre nós", "about", null],
    ["about.discount", "100% de desconto_hoje", "about", null],
  ] as const;
  for (const [key, value, page, description] of rows) {
    const text = await createText(site.id, key, value);
    await db().update(texts).set({ page, description }).where(eq(texts.id, text.id));
  }
  await createText(site.id, "home.old", "Texto antigo", "orphan");
  return site;
}

const keys = (rows: { key: string }[]) => rows.map((row) => row.key);

describe("listSiteTexts", () => {
  it("lists active texts by page and key by default", async () => {
    const site = await seedTexts();
    expect(keys(await listSiteTexts(db(), site.id))).toEqual([
      "about.discount",
      "about.title",
      "home.hero.cta",
      "home.hero.title",
    ]);
  });

  it.each([
    ["key", "hero", ["home.hero.cta", "home.hero.title"]],
    ["value, ignoring case", "OFICINA", ["home.hero.title"]],
    ["description", "principal", ["home.hero.title"]],
  ])("searches the %s", async (_label, q, expected) => {
    const site = await seedTexts();
    expect(keys(await listSiteTexts(db(), site.id, { q }))).toEqual(expected);
  });

  it("treats % and _ in the search as plain characters", async () => {
    const site = await seedTexts();
    expect(keys(await listSiteTexts(db(), site.id, { q: "100%" }))).toEqual(["about.discount"]);
    expect(keys(await listSiteTexts(db(), site.id, { q: "_" }))).toEqual(["about.discount"]);
  });

  it("filters by page", async () => {
    const site = await seedTexts();
    expect(keys(await listSiteTexts(db(), site.id, { page: "about" }))).toEqual([
      "about.discount",
      "about.title",
    ]);
  });

  it("lists orphans only, or everything", async () => {
    const site = await seedTexts();
    const orphans = await listSiteTexts(db(), site.id, { status: "orphan" });
    expect(keys(orphans)).toEqual(["home.old"]);
    expect(orphans[0]?.status).toBe("orphan");
    expect(await listSiteTexts(db(), site.id, { status: "all" })).toHaveLength(5);
    expect(await countOrphans(db(), site.id)).toBe(1);
  });

  it("marks texts created in the last 7 days as new", async () => {
    const site = await seedTexts();
    await db()
      .update(texts)
      .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(texts.key, "about.title"));

    const rows = await listSiteTexts(db(), site.id);
    expect(rows.find((row) => row.key === "about.title")?.isNew).toBe(false);
    expect(rows.find((row) => row.key === "home.hero.title")?.isNew).toBe(true);
  });

  it("never lists texts of another site", async () => {
    const site = await seedTexts();
    const other = await createSite();
    await createText(other.site.id, "home.hero.title", "Outro site");
    const rows = await listSiteTexts(db(), site.id, { q: "Outro" });
    expect(rows).toEqual([]);
  });
});

describe("listSitePages", () => {
  it("returns the distinct pages of the site", async () => {
    const site = await seedTexts();
    expect(await listSitePages(db(), site.id)).toEqual(["about", "home"]);
  });
});

describe("textFiltersSchema", () => {
  it("drops invalid values instead of failing the page", () => {
    expect(textFiltersSchema.parse({ q: "x".repeat(500), status: "deleted" })).toEqual({
      q: undefined,
      status: undefined,
    });
  });
});
