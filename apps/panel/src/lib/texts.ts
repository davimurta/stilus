import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { texts } from "../db/schema";

/** All active texts of a site as a single `{ key: value }` map. */
export async function getTextMap(db: Database, siteId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: texts.key, value: texts.value })
    .from(texts)
    .where(and(eq(texts.siteId, siteId), eq(texts.status, "active")));

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
