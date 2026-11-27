import { describe, expect, it } from "vitest";
import { normalizeJsxText } from "./jsx-text.js";

describe("normalizeJsxText (React's whitespace rule)", () => {
  it.each([
    ["Bem-vindo", "Bem-vindo"],
    ["\n        Bem-vindo\n      ", "Bem-vindo"],
    ["\n  Linha um\n  linha dois\n", "Linha um linha dois"],
    ["  espaços internos  mantidos  ", "  espaços internos  mantidos  "],
    ["\n\n   \n", ""],
    ["a\n\n\nb", "a b"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeJsxText(raw)).toBe(expected);
  });
});
