import { describe, expect, it } from "vitest";
import { isValidTextKey, textKeySchema } from "./key.js";

describe("text key format", () => {
  it.each([
    "home",
    "home.hero.title",
    "about.team.member-1",
    "page2.section-a.name",
    "404.title",
    "home.hero.cta-button",
  ])("accepts %s", (key) => {
    expect(isValidTextKey(key)).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["uppercase", "Home.hero"],
    ["trailing dot", "home.hero."],
    ["leading dot", ".home"],
    ["double dot", "home..title"],
    ["hyphen in first segment", "home-page.title"],
    ["leading hyphen in first segment", "-home"],
    ["spaces", "home. hero"],
    ["underscore", "home.hero_title"],
    ["accented letters", "início.título"],
    ["slash", "home/hero"],
    ["html", "<script>"],
  ])("rejects %s", (_label, key) => {
    expect(isValidTextKey(key)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidTextKey(undefined)).toBe(false);
    expect(isValidTextKey(null)).toBe(false);
    expect(isValidTextKey(42)).toBe(false);
    expect(isValidTextKey({})).toBe(false);
  });

  it("returns a readable error message from the schema", () => {
    const result = textKeySchema.safeParse("Bad Key");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Invalid text key/);
  });
});
