import { and, count, eq, gte } from "drizzle-orm";
import type { Database } from "../db/client";
import { activityLog } from "../db/schema";

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ACTION = "auth.login_failed";

const detailFor = (email: string) => JSON.stringify({ email: email.toLowerCase() });

/**
 * Failed logins are counted per email in activity_log, so the limit holds across instances.
 * Trade-off: someone can lock an account for 15 minutes by failing on purpose.
 */
export async function isLoginBlocked(db: Database, email: string, now = new Date()) {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const [row] = await db
    .select({ failures: count() })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.action, ACTION),
        eq(activityLog.detail, detailFor(email)),
        gte(activityLog.createdAt, since),
      ),
    );
  return (row?.failures ?? 0) >= MAX_LOGIN_FAILURES;
}

export async function recordLoginFailure(db: Database, email: string) {
  await db.insert(activityLog).values({ action: ACTION, detail: detailFor(email) });
}
