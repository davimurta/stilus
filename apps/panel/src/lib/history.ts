import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { texts, textVersions, users } from "../db/schema";
import { updateText, type EditResult } from "./text-edits";

export async function getText(db: Database, siteId: string, key: string) {
  const [text] = await db
    .select()
    .from(texts)
    .where(and(eq(texts.siteId, siteId), eq(texts.key, key)))
    .limit(1);
  return text ?? null;
}

export type VersionRow = {
  id: string;
  value: string;
  createdAt: Date;
  authorName: string | null;
};

/** Versions of a text, newest first, with the author's name. */
export async function listVersions(db: Database, textId: string): Promise<VersionRow[]> {
  return db
    .select({
      id: textVersions.id,
      value: textVersions.value,
      createdAt: textVersions.createdAt,
      authorName: users.name,
    })
    .from(textVersions)
    .leftJoin(users, eq(users.id, textVersions.authorId))
    .where(eq(textVersions.textId, textId))
    .orderBy(desc(textVersions.createdAt), desc(textVersions.id));
}

/**
 * Puts an old version back as the current value. It is a normal edit: it creates a new version,
 * so the restore itself can be undone.
 */
export async function restoreVersion(
  db: Database,
  input: { siteId: string; key: string; versionId: string; userId: string },
): Promise<EditResult> {
  const text = await getText(db, input.siteId, input.key);
  if (!text) return { ok: false, code: "not_found", message: "Texto não encontrado." };
  const [version] = await db
    .select({ value: textVersions.value })
    .from(textVersions)
    .where(and(eq(textVersions.id, input.versionId), eq(textVersions.textId, text.id)))
    .limit(1);
  if (!version) return { ok: false, code: "not_found", message: "Versão não encontrada." };
  return updateText(db, {
    siteId: input.siteId,
    key: input.key,
    value: version.value,
    userId: input.userId,
  });
}
