import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Text } from "./text.js";
import { t } from "./server.js";

const env = {
  STILUS_SITE_ID: "00000000-0000-4000-8000-000000000001",
  STILUS_API_URL: "https://stilus.example.com",
  STILUS_SITE_KEY: "stilus_sk_secret",
};

type Rendered = ReactElement<Record<string, unknown>>;

function stubApi(texts: Record<string, string>) {
  const fetchMock = vi.fn(async () => Response.json({ texts }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Text", () => {
  it("renders the stored value in a span marked with its key", async () => {
    stubApi({ "home.hero.title": "Da API" });
    const element = (await Text({ k: "home.hero.title", children: "Padrão" })) as Rendered;

    expect(element.type).toBe("span");
    expect(element.props["data-stilus-key"]).toBe("home.hero.title");
    expect(element.props.children).toBe("Da API");
  });

  it("renders the default text when the key has no stored value", async () => {
    stubApi({});
    const element = (await Text({ k: "home.hero.title", children: "Padrão" })) as Rendered;
    expect(element.props.children).toBe("Padrão");
  });

  it("renders the default text when the API is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    const element = (await Text({ k: "home.hero.title", children: "Padrão" })) as Rendered;
    expect(element.props.children).toBe("Padrão");
  });

  it("renders the requested element and forwards its props", async () => {
    stubApi({});
    const element = (await Text({
      as: "a",
      k: "home.hero.cta",
      href: "/contato",
      className: "button",
      children: "Peça um orçamento",
    })) as Rendered;

    expect(element.type).toBe("a");
    expect(element.props.href).toBe("/contato");
    expect(element.props.className).toBe("button");
  });

  it("does not render the description", async () => {
    stubApi({});
    const element = (await Text({
      k: "home.hero.title",
      description: "Título principal",
      children: "Padrão",
    })) as Rendered;
    expect(element.props).not.toHaveProperty("description");
  });

  it("passes HTML from the API as a plain string child, never as markup", async () => {
    const payload = '<img src=x onerror="alert(1)">';
    stubApi({ "home.hero.title": payload });
    const props = {
      k: "home.hero.title",
      children: "Padrão",
      dangerouslySetInnerHTML: { __html: payload },
    } as unknown as Parameters<typeof Text>[0];

    const element = (await Text(props)) as Rendered;

    expect(element.props.children).toBe(payload);
    expect(element.props).not.toHaveProperty("dangerouslySetInnerHTML");
  });
});

describe("multiline texts", () => {
  it("renders line breaks as <br> and keeps every line escaped", async () => {
    stubApi({ "about.body": "Linha 1\n<b>Linha 2</b>" });
    const element = (await Text({ as: "p", k: "about.body", children: "Padrão" })) as Rendered;
    expect(renderToStaticMarkup(element)).toBe(
      '<p data-stilus-key="about.body">Linha 1<br/>&lt;b&gt;Linha 2&lt;/b&gt;</p>',
    );
  });

  it("keeps a single-line text as a plain string child", async () => {
    stubApi({ "home.title": "Uma linha" });
    const element = (await Text({ k: "home.title", children: "Padrão" })) as Rendered;
    expect(element.props.children).toBe("Uma linha");
  });
});

describe("t", () => {
  it("returns the stored value", async () => {
    stubApi({ "home.meta.title": "Título da API" });
    expect(await t("home.meta.title", "Título padrão")).toBe("Título da API");
  });

  it("returns the default and never calls the API when settings are missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("STILUS_SITE_ID", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = stubApi({ "home.meta.title": "Título da API" });

    expect(await t("home.meta.title", "Título padrão")).toBe("Título padrão");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
