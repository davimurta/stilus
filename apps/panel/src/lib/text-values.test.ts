import { describe, expect, it } from "vitest";
import { ABSOLUTE_MAX_LENGTH, checkTextValue } from "./text-values";

const line = { kind: "line" as const, maxLength: 10 };
const multiline = { kind: "multiline" as const, maxLength: null };

describe("checkTextValue", () => {
  it("accepts plain text within the limit", () => {
    expect(checkTextValue("Olá mundo", line)).toEqual({ ok: true, value: "Olá mundo" });
  });

  it("accepts exactly max_length characters", () => {
    expect(checkTextValue("a".repeat(10), line).ok).toBe(true);
  });

  it("rejects text above max_length", () => {
    expect(checkTextValue("a".repeat(11), line)).toMatchObject({ ok: false, code: "too_long" });
  });

  it("counts characters, not UTF-16 units (emoji and accents)", () => {
    expect(checkTextValue("😀".repeat(10), line).ok).toBe(true);
    expect(checkTextValue("ação".repeat(2), line).ok).toBe(true);
  });

  it("applies the absolute cap when the text has no max_length", () => {
    expect(checkTextValue("a".repeat(ABSOLUTE_MAX_LENGTH), multiline).ok).toBe(true);
    expect(checkTextValue("a".repeat(ABSOLUTE_MAX_LENGTH + 1), multiline)).toMatchObject({
      ok: false,
      code: "too_long",
    });
  });

  it("never lets max_length raise the absolute cap", () => {
    const huge = { kind: "multiline" as const, maxLength: ABSOLUTE_MAX_LENGTH * 10 };
    expect(checkTextValue("a".repeat(ABSOLUTE_MAX_LENGTH + 1), huge).ok).toBe(false);
  });

  it("rejects line breaks in a single-line text", () => {
    expect(checkTextValue("a\nb", line)).toMatchObject({ ok: false, code: "invalid_value" });
  });

  it("accepts and normalizes line breaks in a multiline text", () => {
    expect(checkTextValue("a\r\nb\rc", multiline)).toEqual({ ok: true, value: "a\nb\nc" });
  });

  it.each(["\u0000", "\u0007", "\u001b[31m", "\u007f", "\u000b"])(
    "rejects control character %j",
    (character) => {
      expect(checkTextValue(`a${character}b`, multiline)).toMatchObject({
        ok: false,
        code: "invalid_value",
      });
    },
  );

  it("keeps HTML as typed: it is plain text, escaped on render", () => {
    const html = '<script>alert("x")</script>';
    expect(checkTextValue(html, { kind: "line", maxLength: null })).toEqual({
      ok: true,
      value: html,
    });
  });

  it("accepts an empty value", () => {
    expect(checkTextValue("", line)).toEqual({ ok: true, value: "" });
  });
});
