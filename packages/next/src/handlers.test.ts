import { WEBHOOK_MAX_AGE_MS, signWebhookBody } from "@stilus/shared";
import { describe, expect, it, vi } from "vitest";
import { createStilusHandlers } from "./handlers.js";

const SITE_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = "site-revalidate-secret-0000000000000000";
const env = {
  STILUS_SITE_ID: SITE_ID,
  STILUS_API_URL: "https://central.example.com",
  STILUS_SITE_KEY: "stilus_sk_secret",
  STILUS_REVALIDATE_SECRET: SECRET,
};
const SITE = "https://site.example.com";

type Call = { url: string; init: RequestInit };

function setup(answer: (call: Call) => Response = () => Response.json({})) {
  const calls: Call[] = [];
  const revalidate = vi.fn();
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return answer(call);
  }) as unknown as typeof fetch;
  const handlers = createStilusHandlers({ fetchImpl, revalidate, env });
  return { handlers, calls, revalidate };
}

function post(
  handlers: ReturnType<typeof createStilusHandlers>,
  action: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const request = new Request(`${SITE}/api/stilus/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: SITE,
      host: "site.example.com",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return handlers.POST(request, { params: Promise.resolve({ stilus: action.split("/") }) });
}

const loginOk = (sites: { id: string }[] = [{ id: SITE_ID }]) =>
  Response.json({
    token: "tok.sig",
    user: { id: "u1", name: "Ana", email: "ana@example.com" },
    sites,
  });

describe("login", () => {
  it("relays the credentials and sets the httpOnly session cookie and the edit flag", async () => {
    const { handlers, calls } = setup(() => loginOk());
    const response = await post(handlers, "login", { email: "ana@example.com", password: "pw" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { name: "Ana", email: "ana@example.com" } });
    expect(calls[0]?.url).toBe("https://central.example.com/api/v1/auth/login");

    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith("stilus_session="));
    const flag = cookies.find((cookie) => cookie.startsWith("stilus_edit="));
    expect(session).toContain("stilus_session=tok.sig");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Secure");
    expect(flag).toContain("stilus_edit=1");
    expect(flag).not.toContain("HttpOnly");
  });

  it("does not set Secure on plain http (local development)", async () => {
    const { handlers } = setup(() => loginOk());
    const request = new Request("http://localhost:3100/api/stilus/login", {
      method: "POST",
      headers: { origin: "http://localhost:3100", host: "localhost:3100" },
      body: JSON.stringify({ email: "a@example.com", password: "pw" }),
    });
    const response = await handlers.POST(request, {
      params: Promise.resolve({ stilus: ["login"] }),
    });
    expect(response.headers.getSetCookie().join()).not.toContain("Secure");
  });

  it("never returns the session token in the body", async () => {
    const { handlers } = setup(() => loginOk());
    const response = await post(handlers, "login", { email: "a@example.com", password: "pw" });
    expect(await response.text()).not.toContain("tok.sig");
  });

  it("refuses a user without access to this site, revokes the token, sets no cookie", async () => {
    const { handlers, calls } = setup((call) =>
      call.url.endsWith("/login") ? loginOk([{ id: "another-site" }]) : Response.json({ ok: true }),
    );
    const response = await post(handlers, "login", { email: "a@example.com", password: "pw" });

    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(calls[1]?.url).toBe("https://central.example.com/api/v1/auth/logout");
  });

  it("passes the central error through on wrong credentials", async () => {
    const { handlers } = setup(() =>
      Response.json(
        { error: { code: "invalid_credentials", message: "E-mail ou senha incorretos." } },
        { status: 401 },
      ),
    );
    const response = await post(handlers, "login", { email: "a@example.com", password: "x" });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_credentials");
  });

  it("answers 502 when the central API is down", async () => {
    const { handlers } = setup(() => {
      throw new TypeError("fetch failed");
    });
    const response = await post(handlers, "login", { email: "a@example.com", password: "x" });
    expect(response.status).toBe(502);
  });
});

describe("CSRF protection", () => {
  it.each([
    ["missing Origin", {}],
    ["foreign Origin", { origin: "https://evil.example.com" }],
    ["malformed Origin", { origin: "not a url" }],
  ])("rejects a cookie-authenticated request with %s", async (_label, headers) => {
    const { handlers, calls } = setup();
    const request = new Request(`${SITE}/api/stilus/save`, {
      method: "POST",
      headers: { host: "site.example.com", cookie: "stilus_session=tok", ...headers },
      body: JSON.stringify({ key: "home.title", value: "x" }),
    });
    const response = await handlers.POST(request, {
      params: Promise.resolve({ stilus: ["save"] }),
    });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("save and undo", () => {
  const cookie = { cookie: "other=1; stilus_session=tok.sig; stilus_edit=1" };

  it("relays a save to the central API with the editor's token", async () => {
    const { handlers, calls } = setup(() =>
      Response.json({ key: "home.title", value: "Novo", changed: true, revalidated: true }),
    );
    const response = await post(handlers, "save", { key: "home.title", value: "Novo" }, cookie);

    expect(response.status).toBe(200);
    expect(calls[0]?.url).toBe(
      `https://central.example.com/api/v1/sites/${SITE_ID}/texts/home.title`,
    );
    expect(calls[0]?.init.method).toBe("PUT");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer tok.sig");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ value: "Novo" }));
  });

  it("never sends the site API key with editor requests", async () => {
    const { handlers, calls } = setup(() => Response.json({}));
    await post(handlers, "save", { key: "home.title", value: "Novo" }, cookie);
    expect(JSON.stringify(calls)).not.toContain(env.STILUS_SITE_KEY);
  });

  it("relays an undo", async () => {
    const { handlers, calls } = setup(() => Response.json({ value: "Antes" }));
    await post(handlers, "undo", { key: "home.title" }, cookie);
    expect(calls[0]?.url).toBe(
      `https://central.example.com/api/v1/sites/${SITE_ID}/texts/home.title/undo`,
    );
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("answers 401 and clears the cookies without a session", async () => {
    const { handlers, calls } = setup();
    const response = await post(handlers, "save", { key: "home.title", value: "x" });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().join()).toContain("Max-Age=0");
    expect(calls).toHaveLength(0);
  });

  it("clears the cookies when the central API rejects the session", async () => {
    const { handlers } = setup(() =>
      Response.json({ error: { code: "unauthorized", message: "x" } }, { status: 401 }),
    );
    const response = await post(handlers, "save", { key: "home.title", value: "x" }, cookie);
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().join()).toContain("stilus_edit=; Path=/");
  });

  it("passes permission errors through untouched (authorization is central)", async () => {
    const { handlers } = setup(() =>
      Response.json({ error: { code: "forbidden", message: "Sem permissão" } }, { status: 403 }),
    );
    const response = await post(handlers, "save", { key: "home.title", value: "x" }, cookie);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ["invalid key", { key: "Bad Key", value: "x" }],
    ["missing value", { key: "home.title" }],
    ["not JSON", "x=1"],
  ])("rejects an invalid body (%s) without calling the central API", async (_label, body) => {
    const { handlers, calls } = setup();
    const response = await post(handlers, "save", body, cookie);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("logout", () => {
  it("revokes the session centrally and clears both cookies", async () => {
    const { handlers, calls } = setup(() => Response.json({ ok: true }));
    const response = await post(handlers, "logout", {}, { cookie: "stilus_session=tok.sig" });

    expect(response.status).toBe(200);
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer tok.sig");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });
});

describe("revalidation webhook", () => {
  function webhook(payload: unknown, secret = SECRET, signature?: string) {
    const { handlers, revalidate } = setup();
    const body = JSON.stringify(payload);
    const request = new Request(`${SITE}/api/stilus/revalidate`, {
      method: "POST",
      headers: { "x-stilus-signature": signature ?? signWebhookBody(body, secret) },
      body,
    });
    const response = handlers.POST(request, {
      params: Promise.resolve({ stilus: ["revalidate"] }),
    });
    return { response, revalidate };
  }

  it("revalidates the site tag for a valid webhook (no Origin needed: server to server)", async () => {
    const { response, revalidate } = webhook({
      siteId: SITE_ID,
      keys: ["home.title"],
      ts: Date.now(),
    });
    expect((await response).status).toBe(200);
    expect(revalidate).toHaveBeenCalledWith(`stilus:${SITE_ID}`);
  });

  it("rejects an invalid signature", async () => {
    const { response, revalidate } = webhook(
      { siteId: SITE_ID, keys: [], ts: Date.now() },
      "wrong-secret-0000000000000000000000000",
    );
    expect((await response).status).toBe(401);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    const { response, revalidate } = webhook(
      { siteId: SITE_ID, keys: [], ts: Date.now() },
      SECRET,
      "",
    );
    expect((await response).status).toBe(401);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rejects an old timestamp (replay)", async () => {
    const { response, revalidate } = webhook({
      siteId: SITE_ID,
      keys: [],
      ts: Date.now() - WEBHOOK_MAX_AGE_MS - 1000,
    });
    const answer = await response;
    expect(answer.status).toBe(401);
    expect((await answer.json()).error.code).toBe("expired");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rejects a webhook signed for another site", async () => {
    const { response, revalidate } = webhook({
      siteId: "00000000-0000-4000-8000-000000000002",
      keys: [],
      ts: Date.now(),
    });
    expect((await response).status).toBe(401);
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("routing and configuration", () => {
  it("answers 404 for an unknown action", async () => {
    const { handlers } = setup();
    expect((await post(handlers, "delete-everything", {})).status).toBe(404);
  });

  it("answers 503 when the site is not configured", async () => {
    const handlers = createStilusHandlers({ env: {} });
    expect((await post(handlers, "login", {})).status).toBe(503);
  });

  it("answers 404 on GET", async () => {
    const { handlers } = setup();
    expect((await handlers.GET()).status).toBe(404);
  });
});
