import { describe, expect, it } from "vitest";
import { WEBHOOK_MAX_AGE_MS, signWebhookBody, verifyWebhook } from "./webhook.js";

const secret = "a-revalidate-secret-with-enough-length";
const now = 1_800_000_000_000;
const siteId = "00000000-0000-4000-8000-000000000001";

function signed(payload: unknown, key = secret) {
  const body = JSON.stringify(payload);
  return { body, signature: signWebhookBody(body, key) };
}

describe("signWebhookBody", () => {
  it("produces a deterministic HMAC-SHA256 hex digest", () => {
    const signature = signWebhookBody('{"a":1}', secret);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signWebhookBody('{"a":1}', secret)).toBe(signature);
    expect(signWebhookBody('{"a":2}', secret)).not.toBe(signature);
    expect(signWebhookBody('{"a":1}', "another-secret")).not.toBe(signature);
  });
});

describe("verifyWebhook", () => {
  const payload = { siteId, keys: ["home.hero.title"], ts: now };

  it("accepts a correctly signed, fresh payload", () => {
    const { body, signature } = signed(payload);
    expect(verifyWebhook({ body, signature, secret, now })).toEqual({ ok: true, payload });
  });

  it("accepts an uppercase hex signature", () => {
    const { body, signature } = signed(payload);
    expect(verifyWebhook({ body, signature: signature.toUpperCase(), secret, now }).ok).toBe(true);
  });

  describe("signature", () => {
    it.each([
      ["missing", null],
      ["empty", ""],
      ["not hex", "z".repeat(64)],
      ["too short", "ab".repeat(16)],
      ["random", "0".repeat(64)],
    ])("rejects a %s signature", (_label, signature) => {
      const { body } = signed(payload);
      expect(verifyWebhook({ body, signature, secret, now })).toEqual({
        ok: false,
        reason: "bad_signature",
      });
    });

    it("rejects a signature made with another secret", () => {
      const { body, signature } = signed(payload, "attacker-secret");
      expect(verifyWebhook({ body, signature, secret, now })).toEqual({
        ok: false,
        reason: "bad_signature",
      });
    });

    it("rejects a body changed after signing", () => {
      const { signature } = signed(payload);
      const tampered = JSON.stringify({ ...payload, keys: ["home.other"] });
      expect(verifyWebhook({ body: tampered, signature, secret, now }).ok).toBe(false);
    });

    it("rejects everything when the site has no secret configured", () => {
      const { body, signature } = signed(payload, "");
      expect(verifyWebhook({ body, signature, secret: "", now }).ok).toBe(false);
    });
  });

  describe("timestamp window (anti replay)", () => {
    it("accepts a webhook exactly at the 5 minute limit", () => {
      const { body, signature } = signed({ ...payload, ts: now - WEBHOOK_MAX_AGE_MS });
      expect(verifyWebhook({ body, signature, secret, now }).ok).toBe(true);
    });

    it("rejects a webhook older than 5 minutes", () => {
      const { body, signature } = signed({ ...payload, ts: now - WEBHOOK_MAX_AGE_MS - 1 });
      expect(verifyWebhook({ body, signature, secret, now })).toEqual({
        ok: false,
        reason: "expired",
      });
    });

    it("rejects a webhook dated more than 5 minutes in the future", () => {
      const { body, signature } = signed({ ...payload, ts: now + WEBHOOK_MAX_AGE_MS + 1 });
      expect(verifyWebhook({ body, signature, secret, now }).ok).toBe(false);
    });
  });

  describe("payload", () => {
    it.each([
      ["not JSON", "not json"],
      ["missing ts", JSON.stringify({ siteId, keys: [] })],
      ["ts as string", JSON.stringify({ siteId, keys: [], ts: String(now) })],
      ["invalid site id", JSON.stringify({ siteId: "x", keys: [], ts: now })],
      ["invalid key", JSON.stringify({ siteId, keys: ["Bad Key"], ts: now })],
    ])("rejects a validly signed but invalid payload (%s)", (_label, body) => {
      const signature = signWebhookBody(body, secret);
      expect(verifyWebhook({ body, signature, secret, now })).toEqual({
        ok: false,
        reason: "invalid_payload",
      });
    });
  });
});
