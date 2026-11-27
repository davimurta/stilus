import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { textKeySchema } from "./key.js";

/** Header carrying the HMAC-SHA256 (hex) of the raw request body. */
export const SIGNATURE_HEADER = "x-stilus-signature";

/** Webhooks older (or further in the future) than this are rejected (anti replay). */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export const revalidatePayloadSchema = z.object({
  siteId: z.uuid(),
  keys: z.array(textKeySchema).max(1000),
  /** Unix time in milliseconds when the central API signed the webhook. */
  ts: z.number().int().nonnegative(),
});

export type RevalidatePayload = z.infer<typeof revalidatePayloadSchema>;

export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export type WebhookVerification =
  | { ok: true; payload: RevalidatePayload }
  | { ok: false; reason: "bad_signature" | "invalid_payload" | "expired" };

/**
 * Verifies a revalidation webhook: signature first (constant time), then payload shape,
 * then the timestamp window. The body must be the exact raw string that was signed.
 */
export function verifyWebhook(input: {
  body: string;
  signature: string | null;
  secret: string;
  now?: number;
}): WebhookVerification {
  const { body, signature, secret, now = Date.now() } = input;

  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  const expected = Buffer.from(signWebhookBody(body, secret), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "bad_signature" };
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  const parsed = revalidatePayloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  if (Math.abs(now - parsed.data.ts) > WEBHOOK_MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: parsed.data };
}
