import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { sites } from "../db/schema";

const SITE_KEY_PREFIX = "stilus_sk_";

/** New random site API key. Shown once to the site owner; only its hash is stored. */
export function generateSiteApiKey(): string {
  return SITE_KEY_PREFIX + randomBytes(32).toString("base64url");
}

/**
 * Site keys are 256-bit random tokens, so a fast hash is enough (no password stretching needed).
 */
export function hashSiteApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

/** Extracts the token from `Authorization: Bearer <token>`. */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

// Compared against when the site does not exist, so both paths do the same work.
const MISSING_SITE_HASH = hashSiteApiKey("missing-site");

export type SiteAuthResult = { ok: true; siteId: string } | { ok: false };

/**
 * Checks that the bearer token is the API key of `siteId`.
 * An unknown site and a wrong key produce the same result, so callers cannot probe site ids.
 */
export async function authenticateSite(
  db: Database,
  siteId: string,
  authorizationHeader: string | null,
): Promise<SiteAuthResult> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) return { ok: false };

  const [site] = await db
    .select({ id: sites.id, apiKeyHash: sites.apiKeyHash })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);

  const presented = hashSiteApiKey(token);
  const matches = hashesMatch(presented, site?.apiKeyHash ?? MISSING_SITE_HASH);
  return site && matches ? { ok: true, siteId: site.id } : { ok: false };
}
