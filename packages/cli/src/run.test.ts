import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "./run.js";

const env = {
  STILUS_SITE_ID: "00000000-0000-4000-8000-000000000001",
  STILUS_API_URL: "https://central.example.com/",
  STILUS_SITE_KEY: "stilus_sk_secret",
};

function project(code: string) {
  const root = mkdtempSync(join(tmpdir(), "stilus-run-"));
  writeFileSync(join(root, "page.tsx"), `import { Text } from "@davimurta/stilus-next";\n${code}`);
  return root;
}

function io(fetchImpl?: typeof fetch, extraEnv: Record<string, string | undefined> = env) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
      env: extraEnv,
      fetchImpl,
    },
  };
}

describe("stilus scan", () => {
  it("lists the texts found", async () => {
    const t = io();
    const code = await run(["scan", project('const a = <Text k="home.a">Oi</Text>;')], t.io);
    expect(code).toBe(0);
    expect(t.out).toEqual(['home.a  "Oi"', "1 text(s) found."]);
  });

  it("prints JSON with --json", async () => {
    const t = io();
    await run(["scan", project('const a = <Text k="home.a">Oi</Text>;'), "--json"], t.io);
    expect(JSON.parse(t.out.join("\n"))).toEqual({
      keys: [{ key: "home.a", defaultValue: "Oi", page: "home", kind: "line" }],
    });
  });

  it("fails with file and line when a key is not a literal", async () => {
    const t = io();
    const code = await run(["scan", project("const a = <Text k={key}>Oi</Text>;")], t.io);
    expect(code).toBe(1);
    expect(t.err[0]).toBe("error    page.tsx:2  The k prop of <Text> must be a string literal.");
  });

  it("prints usage for an unknown command", async () => {
    const t = io();
    expect(await run(["deploy"], t.io)).toBe(1);
    expect(t.err[0]).toMatch(/^Usage:/);
  });
});

describe("stilus sync", () => {
  it("sends the scanned keys with the site API key and prints the result", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ created: ["home.a"], orphaned: ["home.old"], unchanged: [] }),
    );
    const t = io(fetchImpl as unknown as typeof fetch);

    const code = await run(["sync", project('const a = <Text k="home.a">Oi</Text>;')], t.io);

    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://central.example.com/api/v1/sites/${env.STILUS_SITE_ID}/sync`,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer stilus_sk_secret" },
        body: JSON.stringify({
          keys: [{ key: "home.a", defaultValue: "Oi", page: "home", kind: "line" }],
        }),
      }),
    );
    expect(t.out).toEqual([
      "Synced 1 text(s): 1 created, 1 orphaned, 0 unchanged.",
      "  + home.a",
      "  - home.old (orphan)",
    ]);
  });

  it("does not send anything when the scan has errors", async () => {
    const fetchImpl = vi.fn();
    const t = io(fetchImpl as unknown as typeof fetch);
    expect(await run(["sync", project("const a = <Text k={key}>Oi</Text>;")], t.io)).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to sync zero keys (it would orphan everything)", async () => {
    const fetchImpl = vi.fn();
    const t = io(fetchImpl as unknown as typeof fetch);
    expect(await run(["sync", project("const a = 1;")], t.io)).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("explains missing settings", async () => {
    const t = io(vi.fn() as unknown as typeof fetch, {});
    expect(await run(["sync", project('const a = <Text k="home.a">Oi</Text>;')], t.io)).toBe(1);
    expect(t.err.at(-1)).toMatch(/STILUS_SITE_ID/);
  });

  it("reports the central API error", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: "unauthorized", message: "Missing or invalid site API key." } },
        { status: 401 },
      ),
    );
    const t = io(fetchImpl as unknown as typeof fetch);
    expect(await run(["sync", project('const a = <Text k="home.a">Oi</Text>;')], t.io)).toBe(1);
    expect(t.err.at(-1)).toBe("Sync failed (401): Missing or invalid site API key.");
  });
});
