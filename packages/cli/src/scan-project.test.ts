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

const imp = `import { Text, t } from "@davimurta/stilus-next";\n`;

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

  describe("default texts from constants", () => {
    const constants = `export const hero = {
  title: "CADA QUILÔMETRO",
  paragraphs: ["Primeiro parágrafo", "Segundo parágrafo"],
} as const;
export const LABEL = "Saiba mais";
export let loose = "pode mudar";
export const mutable = { title: "sem as const" };
`;

    it("reads `as const` values through imports and tsconfig paths", () => {
      const root = project({
        "tsconfig.json": JSON.stringify({
          compilerOptions: { jsx: "preserve", baseUrl: ".", paths: { "@/*": ["./src/*"] } },
        }),
        "src/constants/home.ts": constants,
        "src/components/hero.tsx": `import { Text as StilusText, t } from "@davimurta/stilus-next";
import { hero, LABEL } from "@/constants/home";
import * as copy from "../constants/home";
export const a = <StilusText k="home.hero.title">{hero.title}</StilusText>;
export const b = <StilusText multiline k="home.about.first">{hero.paragraphs[0]}</StilusText>;
export const c = <StilusText k="home.cta">{copy.LABEL}</StilusText>;
export const d = () => t("home.meta.title", LABEL);`,
      });

      const result = scanProject(root);

      expect(result.errors).toEqual([]);
      expect(Object.fromEntries(result.keys.map((key) => [key.key, key.defaultValue]))).toEqual({
        "home.hero.title": "CADA QUILÔMETRO",
        "home.about.first": "Primeiro parágrafo",
        "home.cta": "Saiba mais",
        "home.meta.title": "Saiba mais",
      });
    });

    it.each([
      ["a `let` variable", "{loose}"],
      ["an object without as const", "{mutable.title}"],
      ["a template with a variable that can change", "{`${loose}!`}"],
    ])("rejects %s", (_label, child) => {
      const root = project({
        "constants.ts": constants,
        "page.tsx": `import { Text } from "@davimurta/stilus-next";
import { LABEL, loose, mutable } from "./constants";
export const a = <Text k="home.a">${child}</Text>;`,
      });
      const result = scanProject(root);
      expect(result.errors[0]?.message).toMatch(/constant string \(as const\)/);
    });

    it("still requires a literal key", () => {
      const root = project({
        "constants.ts": constants,
        "page.tsx": `import { Text } from "@davimurta/stilus-next";
import { LABEL } from "./constants";
export const a = <Text k={LABEL}>x</Text>;`,
      });
      expect(scanProject(root).errors[0]?.message).toMatch(
        /k prop of <Text> must be a string literal/,
      );
    });
  });

  it("finds exactly the texts of the example site, with the seed defaults, kinds and pages", () => {
    const exampleSite = fileURLToPath(new URL("../../../apps/example-site", import.meta.url));
    const result = scanProject(exampleSite);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const found = Object.fromEntries(
      result.keys.map((key) => [
        key.key,
        { value: key.defaultValue, kind: key.kind, page: key.page },
      ]),
    );
    const seed = Object.fromEntries(
      exampleSiteTexts.map((text) => [
        text.key,
        { value: text.value, kind: text.kind, page: text.page },
      ]),
    );
    expect(found).toEqual(seed);
  });
});
