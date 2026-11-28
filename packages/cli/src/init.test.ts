import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initProject } from "./init.js";
import { run } from "./run.js";
import { scanSource } from "./scan.js";

function nextProject(options: { appDir?: string; next?: string; env?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "stilus-init-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { next: options.next ?? "^16.4.0" } }),
  );
  mkdirSync(join(root, options.appDir ?? "app"), { recursive: true });
  if (options.env !== undefined) writeFileSync(join(root, ".env.example"), options.env);
  return root;
}

describe("initProject", () => {
  it("creates the route, the login page and .env.example", () => {
    const root = nextProject();
    const result = initProject(root);

    expect(result).toEqual({
      appDir: "app",
      created: ["app/api/stilus/[...stilus]/route.ts", "app/editar/page.tsx", ".env.example"],
      skipped: [],
      warnings: [],
    });
    expect(readFileSync(join(root, "app/api/stilus/[...stilus]/route.ts"), "utf8")).toContain(
      "export const { GET, POST } = createStilusHandlers();",
    );
    expect(readFileSync(join(root, "app/editar/page.tsx"), "utf8")).toContain("<LoginForm />");
    const env = readFileSync(join(root, ".env.example"), "utf8");
    for (const name of ["SITE_ID", "API_URL", "SITE_KEY", "REVALIDATE_SECRET"]) {
      expect(env).toContain(`STILUS_${name}=`);
    }
    expect(env).not.toContain("NEXT_PUBLIC_STILUS");
  });

  it("uses src/app when the project has it", () => {
    const result = initProject(nextProject({ appDir: "src/app" }));
    expect(result.created[0]).toBe("src/app/api/stilus/[...stilus]/route.ts");
  });

  it("never overwrites existing files and is safe to run twice", () => {
    const root = nextProject();
    mkdirSync(join(root, "app/editar"), { recursive: true });
    writeFileSync(join(root, "app/editar/page.tsx"), "// mine");

    initProject(root);
    const second = initProject(root);

    expect(readFileSync(join(root, "app/editar/page.tsx"), "utf8")).toBe("// mine");
    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(3);
  });

  it("appends the settings to an existing .env.example", () => {
    const root = nextProject({ env: "DATABASE_URL=x" });
    initProject(root);
    const env = readFileSync(join(root, ".env.example"), "utf8");
    expect(env.startsWith("DATABASE_URL=x\n")).toBe(true);
    expect(env).toContain("STILUS_SITE_KEY=");
  });

  it("warns about an unsupported Next version", () => {
    expect(initProject(nextProject({ next: "15.2.0" })).warnings[0]).toMatch(/Next 16/);
  });

  it("refuses a folder without package.json or without the App Router", () => {
    expect(() => initProject(mkdtempSync(join(tmpdir(), "stilus-empty-")))).toThrow(/package.json/);
    const pagesOnly = mkdtempSync(join(tmpdir(), "stilus-pages-"));
    writeFileSync(join(pagesOnly, "package.json"), "{}");
    expect(() => initProject(pagesOnly)).toThrow(/App Router/);
  });

  it("generates exactly the files the example site builds with", () => {
    const root = nextProject();
    initProject(root);
    const exampleApp = fileURLToPath(
      new URL("../../../apps/example-site/src/app", import.meta.url),
    );
    for (const file of ["api/stilus/[...stilus]/route.ts", "editar/page.tsx"]) {
      expect(readFileSync(join(root, "app", file), "utf8")).toBe(
        readFileSync(join(exampleApp, file), "utf8"),
      );
    }
  });

  it("generates code the scanner accepts (no texts, no errors)", () => {
    const root = nextProject();
    initProject(root);
    const page = readFileSync(join(root, "app/editar/page.tsx"), "utf8");
    expect(scanSource("app/editar/page.tsx", page)).toEqual({
      texts: [],
      errors: [],
      warnings: [],
    });
  });
});

describe("stilus init", () => {
  it("prints what it created and the loader line for the layout", async () => {
    const out: string[] = [];
    const code = await run(["init", nextProject()], {
      out: (line) => out.push(line),
      err: () => {},
      env: {},
    });
    expect(code).toBe(0);
    expect(out).toContain("created  app/editar/page.tsx");
    expect(out.join("\n")).toContain(
      'import { StilusLoader } from "@davimurta/stilus-next/loader";',
    );
  });
});
