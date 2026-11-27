import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as SYNC } from "@/app/api/v1/sites/[siteId]/sync/route";
import { GET } from "@/app/api/v1/sites/[siteId]/texts/route";
import { texts, textVersions } from "@/db/schema";
import { createSite, createText, db } from "../helpers";

let webhookKeys: string[][];

beforeEach(() => {
  webhookKeys = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      webhookKeys.push((JSON.parse(String(init.body)) as { keys: string[] }).keys);
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function sync(siteId: string, body: unknown, apiKey?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  return SYNC(
    new Request(`http://panel.test/api/v1/sites/${siteId}/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ siteId }) },
  );
}

async function rows(siteId: string) {
  const all = await db().select().from(texts).where(eq(texts.siteId, siteId));
  return Object.fromEntries(all.map((text) => [text.key, text]));
}

async function siteMap(siteId: string, apiKey: string) {
  const response = await GET(
    new Request("http://panel.test/x", { headers: { authorization: `Bearer ${apiKey}` } }),
    { params: Promise.resolve({ siteId }) },
  );
  return ((await response.json()) as { texts: Record<string, string> }).texts;
}

describe("POST /api/v1/sites/{siteId}/sync", () => {
  it("creates new keys with their default text and metadata", async () => {
    const { site, apiKey } = await createSite();

    const response = await sync(
      site.id,
      {
        keys: [
          { key: "home.title", defaultValue: "Bem-vindo", description: "Título", page: "home" },
          { key: "home.body", defaultValue: "Texto", kind: "multiline" },
        ],
      },
      apiKey,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      created: ["home.title", "home.body"],
      orphaned: [],
      unchanged: [],
    });
    const stored = await rows(site.id);
    expect(stored["home.title"]).toMatchObject({
      value: "Bem-vindo",
      defaultValue: "Bem-vindo",
      description: "Título",
      page: "home",
      kind: "line",
      status: "active",
    });
    expect(stored["home.body"]?.kind).toBe("multiline");
    // New keys render their default, which the site already shows: no revalidation needed.
    expect(webhookKeys).toEqual([]);
  });

  it("marks keys missing from the code as orphan and drops them from the site map", async () => {
    const { site, apiKey } = await createSite();
    await createText(site.id, "home.kept", "Mantido");
    await createText(site.id, "home.removed", "Removido");

    const response = await sync(
      site.id,
      { keys: [{ key: "home.kept", defaultValue: "Mantido" }] },
      apiKey,
    );

    expect(await response.json()).toEqual({
      created: [],
      orphaned: ["home.removed"],
      unchanged: ["home.kept"],
    });
    expect((await rows(site.id))["home.removed"]?.status).toBe("orphan");
    expect(await siteMap(site.id, apiKey)).toEqual({ "home.kept": "Mantido" });
  });

  it("keeps edited values and their history when the default changes", async () => {
    const { site, apiKey } = await createSite();
    const text = await createText(site.id, "home.title", "Padrão antigo");
    await db().update(texts).set({ value: "Editado" }).where(eq(texts.id, text.id));
    await db()
      .insert(textVersions)
      .values([
        { textId: text.id, value: "Padrão antigo" },
        { textId: text.id, value: "Editado" },
      ]);

    await sync(site.id, { keys: [{ key: "home.title", defaultValue: "Padrão novo" }] }, apiKey);

    expect((await rows(site.id))["home.title"]).toMatchObject({
      value: "Editado",
      defaultValue: "Padrão novo",
    });
    expect(await db().select().from(textVersions)).toHaveLength(2);
    expect(webhookKeys).toEqual([]);
  });

  it("lets a never-edited value follow a new default and revalidates the site", async () => {
    const { site, apiKey } = await createSite();
    await createText(site.id, "home.title", "Padrão antigo");

    await sync(site.id, { keys: [{ key: "home.title", defaultValue: "Padrão novo" }] }, apiKey);

    expect((await rows(site.id))["home.title"]?.value).toBe("Padrão novo");
    expect(webhookKeys).toEqual([["home.title"]]);
  });

  it("brings an orphan back when its key returns to the code", async () => {
    const { site, apiKey } = await createSite();
    await createText(site.id, "home.title", "Editado", "orphan");

    const response = await sync(
      site.id,
      { keys: [{ key: "home.title", defaultValue: "Padrão" }] },
      apiKey,
    );

    expect((await response.json()).unchanged).toEqual(["home.title"]);
    expect((await rows(site.id))["home.title"]?.status).toBe("active");
    expect(webhookKeys).toEqual([["home.title"]]);
  });

  it("does not touch texts of other sites", async () => {
    const a = await createSite();
    const b = await createSite();
    await createText(b.site.id, "home.title", "Site B");

    await sync(a.site.id, { keys: [{ key: "home.other", defaultValue: "x" }] }, a.apiKey);

    expect((await rows(b.site.id))["home.title"]?.status).toBe("active");
  });

  it("is idempotent", async () => {
    const { site, apiKey } = await createSite();
    const body = { keys: [{ key: "home.title", defaultValue: "Bem-vindo" }] };
    await sync(site.id, body, apiKey);
    const second = await sync(site.id, body, apiKey);
    expect(await second.json()).toEqual({ created: [], orphaned: [], unchanged: ["home.title"] });
  });

  describe("authentication and validation", () => {
    it("rejects a missing or wrong site API key", async () => {
      const { site } = await createSite();
      const other = await createSite();
      const body = { keys: [{ key: "home.title", defaultValue: "x" }] };
      expect((await sync(site.id, body)).status).toBe(401);
      expect((await sync(site.id, body, other.apiKey)).status).toBe(401);
      expect(await rows(site.id)).toEqual({});
    });

    it.each([
      ["empty list", { keys: [] }],
      [
        "duplicate keys",
        {
          keys: [
            { key: "a.b", defaultValue: "1" },
            { key: "a.b", defaultValue: "2" },
          ],
        },
      ],
      ["invalid key", { keys: [{ key: "Not Valid", defaultValue: "x" }] }],
      ["missing default", { keys: [{ key: "a.b" }] }],
    ])("rejects %s without changing anything", async (_label, body) => {
      const { site, apiKey } = await createSite();
      await createText(site.id, "home.title", "x");
      const response = await sync(site.id, body, apiKey);
      expect(response.status).toBe(400);
      expect((await rows(site.id))["home.title"]?.status).toBe("active");
    });
  });
});
