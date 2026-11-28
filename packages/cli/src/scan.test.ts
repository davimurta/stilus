import { describe, expect, it } from "vitest";
import { scanSource } from "./scan.js";

const header = `import { Text, t } from "@davimurta/stilus-next";\n`;
const scan = (code: string, withHeader = true) =>
  scanSource("app/page.tsx", (withHeader ? header : "") + code);

describe("scanSource: <Text>", () => {
  it("finds the key, the default text and the description", () => {
    const result = scan(`
      export default function Page() {
        return (
          <Text as="h1" k="home.hero.title" description="Título principal">
            Consertos rápidos,
            feitos com cuidado
          </Text>
        );
      }`);
    expect(result.errors).toEqual([]);
    expect(result.texts).toEqual([
      {
        key: "home.hero.title",
        defaultValue: "Consertos rápidos, feitos com cuidado",
        description: "Título principal",
        kind: "line",
        location: { file: "app/page.tsx", line: 5 },
      },
    ]);
  });

  it.each([
    ["multiline", "multiline"],
    ["multiline={true}", "multiline"],
    ["multiline={false}", "line"],
  ])("reads %s", (prop, kind) => {
    const result = scan(`const a = <Text ${prop} k="about.body">Texto</Text>;`);
    expect(result.texts[0]?.kind).toBe(kind);
  });

  it('accepts the key as {"literal"} and children as string expressions', () => {
    const result = scan(`const a = <Text k={"home.a"}>{"Olá"} mundo</Text>;`);
    expect(result.texts[0]).toMatchObject({ key: "home.a", defaultValue: "Olá mundo" });
  });

  it("follows an aliased import", () => {
    const result = scan(
      `import { Text as T } from "@davimurta/stilus-next";\nconst a = <T k="home.a">Oi</T>;`,
      false,
    );
    expect(result.texts.map((text) => text.key)).toEqual(["home.a"]);
  });

  it("ignores a Text component that does not come from @davimurta/stilus-next", () => {
    const result = scan(
      `import { Text } from "./ui";\nconst a = <Text k="home.a">Oi</Text>;`,
      false,
    );
    expect(result.texts).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  describe("errors", () => {
    const message = (code: string) => scan(code).errors.map((error) => error.message);

    it("rejects a key that is not a string literal", () => {
      expect(message("const k = 'home.a'; const a = <Text k={k}>Oi</Text>;")).toEqual([
        "The k prop of <Text> must be a string literal.",
      ]);
      expect(message("const a = <Text k={`home.${x}`}>Oi</Text>;")).toHaveLength(1);
    });

    it("rejects a missing key", () => {
      expect(message("const a = <Text>Oi</Text>;")).toEqual([
        "<Text> needs a k prop with the text key.",
      ]);
    });

    it("rejects an invalid key format", () => {
      expect(message('const a = <Text k="Home.Title">Oi</Text>;')[0]).toMatch(/Invalid key/);
    });

    it("rejects a missing or dynamic default text", () => {
      expect(message('const a = <Text k="home.a" />;')[0]).toMatch(/needs a default text/);
      expect(message('const a = <Text k="home.a">{name}</Text>;')[0]).toMatch(/plain text/);
      expect(message('const a = <Text k="home.a"><b>x</b></Text>;')[0]).toMatch(/plain text/);
    });

    it("rejects spread props", () => {
      expect(message('const a = <Text {...props} k="home.a">Oi</Text>;')[0]).toMatch(/Spread/);
    });

    it("reports the line of the problem", () => {
      const result = scan("\n\nconst a = <Text k={k}>Oi</Text>;");
      expect(result.errors[0]?.location).toEqual({ file: "app/page.tsx", line: 4 });
    });
  });
});

describe("scanSource: t()", () => {
  it("finds the key and the fallback", () => {
    const result = scan(`export async function generateMetadata() {
      return { title: await t("home.meta.title", "Início") };
    }`);
    expect(result.texts).toEqual([
      {
        key: "home.meta.title",
        defaultValue: "Início",
        kind: "line",
        location: { file: "app/page.tsx", line: 3 },
      },
    ]);
  });

  it("follows an aliased import", () => {
    const result = scan(
      `import { t as text } from "@davimurta/stilus-next";\nconst a = text("home.a", "x");`,
      false,
    );
    expect(result.texts.map((item) => item.key)).toEqual(["home.a"]);
  });

  it("ignores an unrelated t()", () => {
    const result = scan(`import { t } from "i18n";\nconst a = t(key, value);`, false);
    expect(result.errors).toEqual([]);
    expect(result.texts).toEqual([]);
  });

  it("rejects non-literal arguments", () => {
    expect(scan("t(key, 'x');").errors[0]?.message).toMatch(/first argument/);
    expect(scan("t('home.a', fallback);").errors[0]?.message).toMatch(/second argument/);
    expect(scan("t('home.a');").errors[0]?.message).toMatch(/second argument/);
  });
});
