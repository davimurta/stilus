import { describe, expect, it } from "vitest";
import { generateSiteApiKey, hashSiteApiKey, parseBearerToken } from "./site-auth";

describe("site API keys", () => {
  it("generates prefixed, unique, high-entropy keys", () => {
    const a = generateSiteApiKey();
    const b = generateSiteApiKey();
    expect(a).toMatch(/^stilus_sk_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically to SHA-256 hex without containing the key", () => {
    const key = generateSiteApiKey();
    const hashed = hashSiteApiKey(key);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSiteApiKey(key)).toBe(hashed);
    expect(hashed).not.toContain(key);
    expect(hashSiteApiKey(`${key}x`)).not.toBe(hashed);
  });
});

describe("parseBearerToken", () => {
  it.each([
    ["Bearer abc123", "abc123"],
    ["bearer abc123", "abc123"],
    ["Bearer   abc123  ", "abc123"],
  ])("reads %j", (header, expected) => {
    expect(parseBearerToken(header)).toBe(expected);
  });

  it.each([null, "", "Bearer", "Bearer ", "Basic abc123", "abc123", "Bearer a b"])(
    "rejects %j",
    (header) => {
      expect(parseBearerToken(header)).toBeNull();
    },
  );
});
