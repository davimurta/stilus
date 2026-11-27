import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { activityLog, texts, textVersions } from "../db/schema";
import { checkTextValue } from "./text-values";

export type EditResult =
  | { ok: true; key: string; value: string; changed: boolean }
  | {
      ok: false;
      code: "not_found" | "too_long" | "invalid_value" | "nothing_to_undo";
      message: string;
    };

const notFound = { ok: false, code: "not_found", message: "Texto não encontrado." } as const;

/**
 * Saves a new value and records a version. The first edit also records the value it replaces,
 * so it can be undone. Permission must be checked by the caller.
 */
export async function updateText(
  db: Database,
  input: { siteId: string; key: string; value: string; userId: string },
): Promise<EditResult> {
  return db.transaction(async (tx) => {
    const [text] = await tx
      .select()
      .from(texts)
      .where(and(eq(texts.siteId, input.siteId), eq(texts.key, input.key)))
      .for("update");
    if (!text) return notFound;

    const checked = checkTextValue(input.value, text);
    if (!checked.ok) return checked;
    if (checked.value === text.value) {
      return { ok: true, key: text.key, value: text.value, changed: false };
    }

    const [anyVersion] = await tx
      .select({ id: textVersions.id })
      .from(textVersions)
      .where(eq(textVersions.textId, text.id))
      .limit(1);
    if (!anyVersion) {
      await tx.insert(textVersions).values({
        textId: text.id,
        value: text.value,
        authorId: text.updatedBy,
        createdAt: text.updatedAt,
      });
    }

    await tx
      .update(texts)
      .set({ value: checked.value, updatedAt: new Date(), updatedBy: input.userId })
      .where(eq(texts.id, text.id));
    await tx
      .insert(textVersions)
      .values({ textId: text.id, value: checked.value, authorId: input.userId });
    await tx.insert(activityLog).values({
      userId: input.userId,
      siteId: input.siteId,
      action: "text.updated",
      detail: JSON.stringify({ key: text.key }),
    });

    return { ok: true, key: text.key, value: checked.value, changed: true };
  });
}

/**
 * Restores the previous version: drops the latest version and puts the one before it back.
 * Repeated calls walk further back until only the original value is left.
 */
export async function undoText(
  db: Database,
  input: { siteId: string; key: string; userId: string },
): Promise<EditResult> {
  return db.transaction(async (tx) => {
    const [text] = await tx
      .select()
      .from(texts)
      .where(and(eq(texts.siteId, input.siteId), eq(texts.key, input.key)))
      .for("update");
    if (!text) return notFound;

    const [latest, previous] = await tx
      .select()
      .from(textVersions)
      .where(eq(textVersions.textId, text.id))
      .orderBy(desc(textVersions.createdAt), desc(textVersions.id))
      .limit(2);
    if (!latest || !previous) {
      return { ok: false, code: "nothing_to_undo", message: "Não há alteração para desfazer." };
    }

    await tx.delete(textVersions).where(eq(textVersions.id, latest.id));
    await tx
      .update(texts)
      .set({ value: previous.value, updatedAt: new Date(), updatedBy: input.userId })
      .where(eq(texts.id, text.id));
    await tx.insert(activityLog).values({
      userId: input.userId,
      siteId: input.siteId,
      action: "text.undone",
      detail: JSON.stringify({ key: text.key, undoneValue: latest.value }),
    });

    return { ok: true, key: text.key, value: previous.value, changed: true };
  });
}
