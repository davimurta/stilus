import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/sites/[siteId]/texts/route";
import { createSite, createText } from "../helpers";

function getTexts(siteId: string, authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  const request = new Request(`http://panel.test/api/v1/sites/${siteId}/texts`, { headers });
  return GET(request, { params: Promise.resolve({ siteId }) });
}

describe("GET /api/v1/sites/{siteId}/texts", () => {
  it("returns every active text of the site as one map", async () => {
    const { site, apiKey } = await createSite();
    await createText(site.id, "home.hero.title", "Bem-vindo");
    await createText(site.id, "home.hero.lead", "Linha 1\nLinha 2");

    const response = await getTexts(site.id, `Bearer ${apiKey}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      texts: { "home.hero.title": "Bem-vindo", "home.hero.lead": "Linha 1\nLinha 2" },
    });
  });

  it("returns an empty map for a site without texts", async () => {
    const { site, apiKey } = await createSite();
    const response = await getTexts(site.id, `Bearer ${apiKey}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ texts: {} });
  });

  it("leaves orphan texts out of the map", async () => {
    const { site, apiKey } = await createSite();
    await createText(site.id, "home.kept", "kept");
    await createText(site.id, "home.removed", "removed", "orphan");

    const response = await getTexts(site.id, `Bearer ${apiKey}`);
    expect(await response.json()).toEqual({ texts: { "home.kept": "kept" } });
  });

  it("never returns texts of another site", async () => {
    const a = await createSite();
    const b = await createSite();
    await createText(a.site.id, "home.title", "Site A");
    await createText(b.site.id, "home.title", "Site B");

    const response = await getTexts(a.site.id, `Bearer ${a.apiKey}`);
    expect(await response.json()).toEqual({ texts: { "home.title": "Site A" } });
  });

  it("returns stored values verbatim, without interpreting HTML", async () => {
    const { site, apiKey } = await createSite();
    const payload = '<script>alert("x")</script> & <b>bold</b>';
    await createText(site.id, "home.title", payload);

    const response = await getTexts(site.id, `Bearer ${apiKey}`);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ texts: { "home.title": payload } });
  });

  describe("authentication", () => {
    const unauthorized = { error: { code: "unauthorized", message: expect.any(String) } };

    it("rejects a request without Authorization header", async () => {
      const { site } = await createSite();
      const response = await getTexts(site.id);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(unauthorized);
    });

    it("rejects a non-bearer Authorization header", async () => {
      const { site, apiKey } = await createSite();
      const response = await getTexts(site.id, `Basic ${apiKey}`);
      expect(response.status).toBe(401);
    });

    it("rejects a wrong API key", async () => {
      const { site } = await createSite();
      const response = await getTexts(site.id, "Bearer stilus_sk_not-the-right-key");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(unauthorized);
    });

    it("rejects the API key of another site", async () => {
      const a = await createSite();
      const b = await createSite();
      await createText(a.site.id, "home.title", "secret of A");

      const response = await getTexts(a.site.id, `Bearer ${b.apiKey}`);
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain("secret of A");
    });

    it("answers an unknown site exactly like a wrong key (no site id probing)", async () => {
      const { apiKey } = await createSite();
      const response = await getTexts("6f1d2c3b-4a59-4e8f-9a0b-1c2d3e4f5a6b", `Bearer ${apiKey}`);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(unauthorized);
    });

    it("rejects a malformed site id with 400", async () => {
      const { apiKey } = await createSite();
      const response = await getTexts("not-a-uuid", `Bearer ${apiKey}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "invalid_request", message: expect.any(String) },
      });
    });
  });
});
