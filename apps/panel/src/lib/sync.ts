import type { SyncKey, SyncResult } from "@stilus/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { activityLog, texts, textVersions } from "../db/schema";

export type SyncOutcome = SyncResult & {
  /** Keys whose rendered value changed (default updated or orphan brought back). */
  changedValues: string[];
};

/**
 * Makes the site's texts match the keys found in its code.
 * - New keys are created with their default text.
 * - Existing keys get fresh metadata (default, description, page, kind) and become active again.
 *   A value that was never edited follows the new default; an edited value is kept.
 * - Active keys missing from the code become `orphan` (kept, with history, out of the site map).
 */
export async function syncTexts(
  db: Database,
  siteId: string,
  keys: SyncKey[],
): Promise<SyncOutcome> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(texts).where(eq(texts.siteId, siteId)).for("update");
    const byKey = new Map(existing.map((text) => [text.key, text]));
    const incoming = new Set(keys.map((item) => item.key));

    const edited = new Set(
      existing.length === 0
        ? []
        : (
            await tx
              .selectDistinct({ textId: textVersions.textId })
              .from(textVersions)
              .where(
                inArray(
                  textVersions.textId,
                  existing.map((text) => text.id),
                ),
              )
          ).map((row) => row.textId),
    );

    const result: SyncOutcome = { created: [], orphaned: [], unchanged: [], changedValues: [] };

    const toCreate = keys.filter((item) => !byKey.has(item.key));
    if (toCreate.length > 0) {
      await tx.insert(texts).values(
        toCreate.map((item) => ({
          siteId,
          key: item.key,
          value: item.defaultValue,
          defaultValue: item.defaultValue,
          description: item.description ?? null,
          page: item.page ?? null,
          kind: item.kind ?? "line",
        })),
      );
      result.created = toCreate.map((item) => item.key);
    }

    for (const item of keys) {
      const text = byKey.get(item.key);
      if (!text) continue;
      const followsDefault = !edited.has(text.id) && text.value === text.defaultValue;
      const value = followsDefault ? item.defaultValue : text.value;
      if (text.status === "orphan" || value !== text.value) result.changedValues.push(item.key);
      await tx
        .update(texts)
        .set({
          defaultValue: item.defaultValue,
          value,
          description: item.description ?? text.description,
          page: item.page ?? text.page,
          kind: item.kind ?? text.kind,
          status: "active",
        })
        .where(eq(texts.id, text.id));
      result.unchanged.push(item.key);
    }

    const toOrphan = existing.filter((text) => text.status === "active" && !incoming.has(text.key));
    if (toOrphan.length > 0) {
      await tx
        .update(texts)
        .set({ status: "orphan" })
        .where(
          and(
            eq(texts.siteId, siteId),
            inArray(
              texts.id,
              toOrphan.map((text) => text.id),
            ),
          ),
        );
      result.orphaned = toOrphan.map((text) => text.key);
    }

    await tx.insert(activityLog).values({
      siteId,
      action: "texts.synced",
      detail: JSON.stringify({
        created: result.created.length,
        orphaned: result.orphaned.length,
        unchanged: result.unchanged.length,
      }),
    });
    return result;
  });
}
