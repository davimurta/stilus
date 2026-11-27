import { SIGNATURE_HEADER, signWebhookBody } from "@stilus/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { activityLog, sites } from "../db/schema";

export type NotifyOptions = {
  fetchImpl?: typeof fetch;
  /** Delay before each attempt, in ms. Its length is the number of attempts. */
  delays?: number[];
  timeoutMs?: number;
  now?: () => number;
};

const DEFAULT_DELAYS = [0, 300, 1000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls the site's revalidation webhook (signed), retrying with backoff.
 * Every revalidation starts here, whether the edit came from the overlay or the panel.
 * Returns false when every attempt failed; the failure is written to activity_log.
 */
export async function notifySite(
  db: Database,
  input: { siteId: string; keys: string[]; userId: string | null },
  {
    fetchImpl = fetch,
    delays = DEFAULT_DELAYS,
    timeoutMs = 3000,
    now = Date.now,
  }: NotifyOptions = {},
): Promise<boolean> {
  const [site] = await db
    .select({ revalidateUrl: sites.revalidateUrl, revalidateSecret: sites.revalidateSecret })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (!site) return false;

  let lastError = "";
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    // Signed per attempt, so a retry never carries a stale timestamp.
    const body = JSON.stringify({ siteId: input.siteId, keys: input.keys, ts: now() });
    try {
      const response = await fetchImpl(site.revalidateUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signWebhookBody(body, site.revalidateSecret),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        await db.insert(activityLog).values({
          userId: input.userId,
          siteId: input.siteId,
          action: "revalidate.sent",
          detail: JSON.stringify({ keys: input.keys }),
        });
        return true;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  await db.insert(activityLog).values({
    userId: input.userId,
    siteId: input.siteId,
    action: "revalidate.failed",
    detail: JSON.stringify({ keys: input.keys, attempts: delays.length, error: lastError }),
  });
  return false;
}

export type RevalidationStatus = { pending: false } | { pending: true; since: Date; error: string };

/** Pending when the latest revalidation attempt of the site failed. */
export async function getRevalidationStatus(
  db: Database,
  siteId: string,
): Promise<RevalidationStatus> {
  const [latest] = await db
    .select({
      action: activityLog.action,
      detail: activityLog.detail,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.siteId, siteId),
        inArray(activityLog.action, ["revalidate.sent", "revalidate.failed"]),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(1);
  if (!latest || latest.action === "revalidate.sent") return { pending: false };
  let error = "";
  try {
    error = String((JSON.parse(latest.detail ?? "{}") as { error?: unknown }).error ?? "");
  } catch {
    // Keep the generic message.
  }
  return { pending: true, since: latest.createdAt, error };
}
