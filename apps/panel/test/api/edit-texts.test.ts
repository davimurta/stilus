import { verifyWebhook } from "@davimurta/stilus-shared";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/v1/sites/[siteId]/texts/[key]/route";
import { POST as UNDO } from "@/app/api/v1/sites/[siteId]/texts/[key]/undo/route";
import { activityLog, texts, textVersions } from "@/db/schema";
import { addMember, createSite, createText, createUser, db, login } from "../helpers";

type WebhookCall = { url: string; body: string; signature: string | null };

let webhookCalls: WebhookCall[];
let webhookStatus: number;

beforeEach(() => {
  webhookCalls = [];
  webhookStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      webhookCalls.push({
        url,
        body: String(init.body),
        signature: headers.get("x-stilus-signature"),
      });
      return new Response(null, { status: webhookStatus });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function put(siteId: string, key: string, body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return PUT(
    new Request(`http://panel.test/api/v1/sites/${siteId}/texts/${key}`, {
      method: "PUT",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ siteId, key }) },
  );
}

function undo(siteId: string, key: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return UNDO(
    new Request(`http://panel.test/api/v1/sites/${siteId}/texts/${key}/undo`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ siteId, key }) },
  );
}

async function storedValue(siteId: string, key: string) {
  const rows = await db().select().from(texts).where(eq(texts.siteId, siteId));
  return rows.find((row) => row.key === key)?.value;
}

async function setup(role: "admin" | "editor" = "editor") {
  const { site } = await createSite();
  const user = await createUser();
  await addMember(user.id, site.id, role);
  const text = await createText(site.id, "home.hero.title", "Original");
  const token = await login(user.email);
  return { site, user, text, token };
}

describe("PUT /api/v1/sites/{siteId}/texts/{key}", () => {
  it.each(["editor", "admin"] as const)("lets a site %s save a text", async (role) => {
    const { site, token } = await setup(role);

    const response = await put(site.id, "home.hero.title", { value: "Novo título" }, token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      key: "home.hero.title",
      value: "Novo título",
      changed: true,
      revalidated: true,
    });
    expect(await storedValue(site.id, "home.hero.title")).toBe("Novo título");
  });

  it("records the replaced value and the new one as versions, with author", async () => {
    const { site, text, user, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Segundo" }, token);
    await put(site.id, "home.hero.title", { value: "Terceiro" }, token);

    const versions = await db()
      .select()
      .from(textVersions)
      .where(eq(textVersions.textId, text.id))
      .orderBy(asc(textVersions.createdAt));
    expect(versions.map((version) => version.value)).toEqual(["Original", "Segundo", "Terceiro"]);
    expect(versions.slice(1).every((version) => version.authorId === user.id)).toBe(true);

    const [updated] = await db().select().from(texts).where(eq(texts.id, text.id));
    expect(updated?.updatedBy).toBe(user.id);
  });

  it("writes the edit to the activity log", async () => {
    const { site, user, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Novo" }, token);

    const log = await db().select().from(activityLog).where(eq(activityLog.action, "text.updated"));
    expect(log).toEqual([
      expect.objectContaining({
        userId: user.id,
        siteId: site.id,
        action: "text.updated",
        detail: JSON.stringify({ key: "home.hero.title" }),
      }),
    ]);
  });

  it("logs a successful revalidation", async () => {
    const { site, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Novo" }, token);
    const sent = await db()
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "revalidate.sent"));
    expect(sent).toHaveLength(1);
  });

  it("calls the site's revalidation webhook with a valid signature and fresh timestamp", async () => {
    const { site, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Novo" }, token);

    expect(webhookCalls).toHaveLength(1);
    const [call] = webhookCalls;
    expect(call?.url).toBe(site.revalidateUrl);
    const verification = verifyWebhook({
      body: call!.body,
      signature: call!.signature,
      secret: site.revalidateSecret,
    });
    expect(verification).toEqual({
      ok: true,
      payload: { siteId: site.id, keys: ["home.hero.title"], ts: expect.any(Number) },
    });
  });

  it("does nothing when the value did not change", async () => {
    const { site, token } = await setup();
    const response = await put(site.id, "home.hero.title", { value: "Original" }, token);

    expect(await response.json()).toMatchObject({ changed: false, revalidated: true });
    expect(await db().select().from(textVersions)).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);
  });

  it("stores HTML as typed plain text (escaped on render)", async () => {
    const { site, token } = await setup();
    const html = '<script>alert("x")</script>';
    const response = await put(site.id, "home.hero.title", { value: html }, token);
    expect(response.status).toBe(200);
    expect(await storedValue(site.id, "home.hero.title")).toBe(html);
  });

  describe("when the site webhook fails", () => {
    it("still saves, reports revalidated: false and logs the failure after retrying", async () => {
      const { site, token } = await setup();
      webhookStatus = 500;

      const response = await put(site.id, "home.hero.title", { value: "Novo" }, token);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ value: "Novo", revalidated: false });
      expect(await storedValue(site.id, "home.hero.title")).toBe("Novo");
      expect(webhookCalls).toHaveLength(3);
      const failures = await db()
        .select()
        .from(activityLog)
        .where(eq(activityLog.action, "revalidate.failed"));
      expect(failures).toHaveLength(1);
      expect(failures[0]?.detail).toContain("HTTP 500");
    });
  });

  describe("authentication and permission", () => {
    it("rejects a request without session", async () => {
      const { site } = await setup();
      const response = await put(site.id, "home.hero.title", { value: "Hack" });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("unauthorized");
      expect(await storedValue(site.id, "home.hero.title")).toBe("Original");
    });

    it("rejects a forged session token", async () => {
      const { site } = await setup();
      const response = await put(site.id, "home.hero.title", { value: "Hack" }, "forged.token");
      expect(response.status).toBe(401);
    });

    it("rejects the site API key used as a user token", async () => {
      const { site, apiKey } = await createSite();
      await createText(site.id, "home.hero.title", "Original");
      const response = await put(site.id, "home.hero.title", { value: "Hack" }, apiKey);
      expect(response.status).toBe(401);
    });

    it("forbids a logged-in user without membership on the site", async () => {
      const { site } = await setup();
      const outsider = await createUser();
      const token = await login(outsider.email);

      const response = await put(site.id, "home.hero.title", { value: "Hack" }, token);

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("forbidden");
      expect(await storedValue(site.id, "home.hero.title")).toBe("Original");
      expect(webhookCalls).toHaveLength(0);
    });

    it("forbids an editor of another site", async () => {
      const { site } = await setup();
      const other = await setup();

      const response = await put(site.id, "home.hero.title", { value: "Hack" }, other.token);

      expect(response.status).toBe(403);
      expect(await storedValue(site.id, "home.hero.title")).toBe("Original");
    });

    it("answers 403 before revealing whether a key exists", async () => {
      const { site } = await setup();
      const outsider = await createUser();
      const token = await login(outsider.email);
      const response = await put(site.id, "home.does-not-exist", { value: "x" }, token);
      expect(response.status).toBe(403);
    });
  });

  describe("validation", () => {
    it("answers 404 for a key the site does not have", async () => {
      const { site, token } = await setup();
      const response = await put(site.id, "home.unknown", { value: "x" }, token);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    });

    it.each(["Home.Title", "home..title", "home title"])(
      "rejects the malformed key %j",
      async (key) => {
        const { site, token } = await setup();
        const response = await put(site.id, encodeURIComponent(key), { value: "x" }, token);
        expect(response.status).toBe(400);
      },
    );

    it("rejects a value above the text's max_length", async () => {
      const { site, token } = await setup();
      await db().update(texts).set({ maxLength: 5 }).where(eq(texts.siteId, site.id));

      const response = await put(site.id, "home.hero.title", { value: "123456" }, token);

      expect(response.status).toBe(422);
      expect((await response.json()).error).toEqual({
        code: "too_long",
        message: "O texto pode ter no máximo 5 caracteres.",
      });
      expect(await storedValue(site.id, "home.hero.title")).toBe("Original");
    });

    it("rejects a line break in a single-line text", async () => {
      const { site, token } = await setup();
      const response = await put(site.id, "home.hero.title", { value: "a\nb" }, token);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("invalid_value");
    });

    it.each([
      ["not JSON", "value=x"],
      ["missing value", {}],
      ["number value", { value: 42 }],
      ["null value", { value: null }],
    ])("rejects an invalid body (%s)", async (_label, body) => {
      const { site, token } = await setup();
      const response = await put(site.id, "home.hero.title", body, token);
      expect(response.status).toBe(400);
    });

    it("rejects a body above 64 KB", async () => {
      const { site, token } = await setup();
      const response = await put(site.id, "home.hero.title", { value: "a".repeat(70_000) }, token);
      expect(response.status).toBe(400);
    });
  });
});

describe("POST /api/v1/sites/{siteId}/texts/{key}/undo", () => {
  it("restores the previous version, step by step, down to the original", async () => {
    const { site, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Segundo" }, token);
    await put(site.id, "home.hero.title", { value: "Terceiro" }, token);

    const first = await undo(site.id, "home.hero.title", token);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ value: "Segundo", revalidated: true });
    expect(await storedValue(site.id, "home.hero.title")).toBe("Segundo");

    const second = await undo(site.id, "home.hero.title", token);
    expect(await second.json()).toMatchObject({ value: "Original" });
    expect(await storedValue(site.id, "home.hero.title")).toBe("Original");

    const third = await undo(site.id, "home.hero.title", token);
    expect(third.status).toBe(409);
    expect((await third.json()).error.code).toBe("nothing_to_undo");
  });

  it("answers 409 for a text that was never edited", async () => {
    const { site, token } = await setup();
    const response = await undo(site.id, "home.hero.title", token);
    expect(response.status).toBe(409);
  });

  it("revalidates the site and logs the undo", async () => {
    const { site, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Segundo" }, token);
    webhookCalls = [];

    await undo(site.id, "home.hero.title", token);

    expect(webhookCalls).toHaveLength(1);
    const undone = await db()
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "text.undone"));
    expect(undone[0]?.detail).toBe(
      JSON.stringify({ key: "home.hero.title", undoneValue: "Segundo" }),
    );
  });

  it("forbids a user without membership", async () => {
    const { site, token } = await setup();
    await put(site.id, "home.hero.title", { value: "Segundo" }, token);
    const outsider = await createUser();

    const response = await undo(site.id, "home.hero.title", await login(outsider.email));

    expect(response.status).toBe(403);
    expect(await storedValue(site.id, "home.hero.title")).toBe("Segundo");
  });

  it("rejects a request without session", async () => {
    const { site } = await setup();
    expect((await undo(site.id, "home.hero.title")).status).toBe(401);
  });
});
