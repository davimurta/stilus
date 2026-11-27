import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exampleSiteTexts } from "../../../apps/panel/src/db/example-site-texts.js";
import { scanProject } from "./scan.js";

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "stilus-scan-"));
  for (const [path, code] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), code);
  }
  return root;
}

const imp = `import { Text, t } from "@stilus/next";\n`;

describe("scanProject", () => {
  it("merges keys across files and derives the page from the first key segment", () => {
    const root = project({
      "app/page.tsx": `${imp}const a = <Text k="home.title">Início</Text>;`,
      "app/sobre/page.tsx": `${imp}const a = <Text multiline k="about.body">Texto</Text>;`,
      "components/header.tsx": `${imp}const a = <Text k="home.title">Início</Text>;`,
    });
    const result = scanProject(root);
    expect(result.warnings).toEqual([]);
    expect(result.keys).toEqual([
      { key: "home.title", defaultValue: "Início", page: "home", kind: "line" },
      { key: "about.body", defaultValue: "Texto", page: "about", kind: "multiline" },
    ]);
  });

  it("warns about one key with different default texts", () => {
    const root = project({
      "a.tsx": `${imp}const a = <Text k="home.title">Um</Text>;`,
      "b.tsx": `${imp}const b = <Text k="home.title">Dois</Text>;`,
    });
    const result = scanProject(root);
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0]?.defaultValue).toBe("Um");
    expect(result.warnings[0]?.message).toMatch(/different default texts.*a\.tsx:2/);
  });

  it("skips node_modules, build output and hidden folders", () => {
    const root = project({
      "node_modules/x/index.tsx": `${imp}const a = <Text k="x.a">x</Text>;`,
      ".next/server/page.js": `${imp}const a = t("x.b", "x");`,
      "dist/a.js": `${imp}const a = t("x.c", "x");`,
      "app/page.tsx": `${imp}const a = t("home.a", "x");`,
    });
    expect(scanProject(root).keys.map((key) => key.key)).toEqual(["home.a"]);
  });

  it("finds exactly the texts of the example site, with the seed defaults and kinds", () => {
    const exampleSite = fileURLToPath(new URL("../../../apps/example-site", import.meta.url));
    const result = scanProject(exampleSite);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const found = Object.fromEntries(
      result.keys.map((key) => [key.key, { value: key.defaultValue, kind: key.kind }]),
    );
    const seed = Object.fromEntries(
      exampleSiteTexts.map((text) => [text.key, { value: text.value, kind: text.kind }]),
    );
    expect(found).toEqual(seed);
  });
});
