import { describe, expect, it, vi } from "vitest";
import {
  REVALIDATE_SECONDS,
  fetchTextMap,
  resolveText,
  siteCacheTag,
  type FetchTextsOptions,
} from "./fetch-texts.js";

const config = {
  siteId: "00000000-0000-4000-8000-000000000001",
  apiUrl: "https://stilus.example.com",
  siteKey: "stilus_sk_secret",
};

function run(fetchImpl: FetchTextsOptions["fetchImpl"], timeoutMs = 1000) {
  const warn = vi.fn();
  return { warn, result: fetchTextMap(config, { fetchImpl, timeoutMs, warn }) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchTextMap", () => {
  it("returns the text map", async () => {
    const { result, warn } = run(async () => json({ texts: { "home.title": "Olá" } }));
    expect(await result).toEqual({ "home.title": "Olá" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("asks for the whole map once, cached with the site tag and a time-based safety net", async () => {
    const fetchImpl = vi.fn(async () => json({ texts: {} }));
    await run(fetchImpl).result;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://stilus.example.com/api/v1/sites/00000000-0000-4000-8000-000000000001/texts",
      {
        headers: { authorization: "Bearer stilus_sk_secret" },
        cache: "force-cache",
        next: {
          revalidate: REVALIDATE_SECONDS,
          tags: ["stilus:00000000-0000-4000-8000-000000000001"],
        },
      },
    );
  });

  it.each([401, 404, 500, 503])("falls back when the API answers %i", async (status) => {
    const { result, warn } = run(async () => json({ error: { code: "x", message: "y" } }, status));
    expect(await result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(String(status)));
  });

  it("falls back when the API is unreachable", async () => {
    const { result, warn } = run(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fetch failed"));
  });

  it("falls back when the API does not answer in time", async () => {
    const { result, warn } = run(() => new Promise<Response>(() => {}), 20);
    expect(await result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("falls back on a body that is not JSON", async () => {
    const { result } = run(async () => new Response("<html>oops</html>", { status: 200 }));
    expect(await result).toBeNull();
  });

  it.each([
    ["missing texts", {}],
    ["non-string values", { texts: { "home.title": 42 } }],
    ["array", { texts: ["a"] }],
  ])("falls back on an unexpected payload (%s)", async (_label, body) => {
    const { result } = run(async () => json(body));
    expect(await result).toBeNull();
  });

  it("never leaks the site key in warnings", async () => {
    const { result, warn } = run(async () => {
      throw new Error("boom");
    });
    await result;
    expect(JSON.stringify(warn.mock.calls)).not.toContain(config.siteKey);
  });
});

describe("resolveText", () => {
  const map = { "home.title": "Da API", "home.empty": "" };

  it("uses the stored value", () => {
    expect(resolveText(map, "home.title", "Padrão")).toBe("Da API");
  });

  it("keeps an intentionally empty stored value", () => {
    expect(resolveText(map, "home.empty", "Padrão")).toBe("");
  });

  it("uses the default for an unknown key", () => {
    expect(resolveText(map, "home.other", "Padrão")).toBe("Padrão");
  });

  it("uses the default when there is no map (API unavailable)", () => {
    expect(resolveText(null, "home.title", "Padrão")).toBe("Padrão");
  });

  it("ignores inherited object properties", () => {
    expect(resolveText(map, "constructor", "Padrão")).toBe("Padrão");
    expect(resolveText(map, "__proto__", "Padrão")).toBe("Padrão");
  });

  it("builds the cache tag from the site id", () => {
    expect(siteCacheTag("abc")).toBe("stilus:abc");
  });
});
