import { afterEach, describe, expect, it, vi } from "vitest";
import { getText, listVersions, restoreVersion } from "@/lib/history";
import { getRevalidationStatus, notifySite } from "@/lib/revalidation";
import { updateText } from "@/lib/text-edits";
import { createSite, createText, createUser, db } from "../helpers";

afterEach(() => vi.unstubAllGlobals());

async function editedText() {
  const { site } = await createSite();
  const user = await createUser();
  await createText(site.id, "home.title", "Original");
  for (const value of ["Segundo", "Terceiro"]) {
    await updateText(db(), { siteId: site.id, key: "home.title", value, userId: user.id });
  }
  const text = await getText(db(), site.id, "home.title");
  return { site, user, text: text! };
}

describe("listVersions", () => {
  it("lists versions newest first, with the author", async () => {
    const { text } = await editedText();
    const versions = await listVersions(db(), text.id);
    expect(versions.map((version) => version.value)).toEqual(["Terceiro", "Segundo", "Original"]);
    expect(versions[0]?.authorName).toBe("Test user");
    expect(versions[2]?.authorName).toBeNull();
  });
});

describe("restoreVersion", () => {
  it("puts an old value back as a new version", async () => {
    const { site, user, text } = await editedText();
    const original = (await listVersions(db(), text.id)).at(-1)!;

    const result = await restoreVersion(db(), {
      siteId: site.id,
      key: "home.title",
      versionId: original.id,
      userId: user.id,
    });

    expect(result).toEqual({ ok: true, key: "home.title", value: "Original", changed: true });
    expect((await getText(db(), site.id, "home.title"))?.value).toBe("Original");
    expect((await listVersions(db(), text.id)).map((version) => version.value)).toEqual([
      "Original",
      "Terceiro",
      "Segundo",
      "Original",
    ]);
  });

  it("refuses a version that belongs to another text", async () => {
    const a = await editedText();
    const b = await editedText();
    const foreign = (await listVersions(db(), b.text.id))[0]!;

    const result = await restoreVersion(db(), {
      siteId: a.site.id,
      key: "home.title",
      versionId: foreign.id,
      userId: a.user.id,
    });

    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect((await getText(db(), a.site.id, "home.title"))?.value).toBe("Terceiro");
  });
});

describe("getRevalidationStatus", () => {
  const stubWebhook = (status: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );

  it("is not pending without any revalidation", async () => {
    const { site } = await createSite();
    expect(await getRevalidationStatus(db(), site.id)).toEqual({ pending: false });
  });

  it("is pending after a failed revalidation, with the error", async () => {
    const { site } = await createSite();
    stubWebhook(500);
    await notifySite(
      db(),
      { siteId: site.id, keys: ["home.title"], userId: null },
      { delays: [0] },
    );
    expect(await getRevalidationStatus(db(), site.id)).toEqual({
      pending: true,
      since: expect.any(Date),
      error: "HTTP 500",
    });
  });

  it("is cleared by the next successful revalidation", async () => {
    const { site } = await createSite();
    stubWebhook(500);
    await notifySite(db(), { siteId: site.id, keys: [], userId: null }, { delays: [0] });
    stubWebhook(200);
    await notifySite(db(), { siteId: site.id, keys: [], userId: null }, { delays: [0] });
    expect(await getRevalidationStatus(db(), site.id)).toEqual({ pending: false });
  });

  it("only looks at the given site", async () => {
    const a = await createSite();
    const b = await createSite();
    stubWebhook(500);
    await notifySite(db(), { siteId: b.site.id, keys: [], userId: null }, { delays: [0] });
    expect(await getRevalidationStatus(db(), a.site.id)).toEqual({ pending: false });
  });
});
