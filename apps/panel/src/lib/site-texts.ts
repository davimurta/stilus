import { and, asc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { texts } from "../db/schema";

/** A text created this recently (by sync or seed) is shown as "Novo". */
export const NEW_TEXT_DAYS = 7;

export const textFiltersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["active", "orphan", "all"]).optional().catch(undefined),
});

export type TextFilters = z.infer<typeof textFiltersSchema>;

export type TextRow = {
  id: string;
  key: string;
  value: string;
  description: string | null;
  page: string | null;
  status: "active" | "orphan";
  kind: "line" | "multiline";
  updatedAt: Date;
  isNew: boolean;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listSiteTexts(
  db: Database,
  siteId: string,
  filters: TextFilters = {},
  now = new Date(),
): Promise<TextRow[]> {
  const conditions = [eq(texts.siteId, siteId)];
  const status = filters.status ?? "active";
  if (status !== "all") conditions.push(eq(texts.status, status));
  if (filters.page) conditions.push(eq(texts.page, filters.page));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    const match = or(
      ilike(texts.key, pattern),
      ilike(texts.value, pattern),
      ilike(texts.description, pattern),
    );
    if (match) conditions.push(match);
  }

  const newSince = new Date(now.getTime() - NEW_TEXT_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: texts.id,
      key: texts.key,
      value: texts.value,
      description: texts.description,
      page: texts.page,
      status: texts.status,
      kind: texts.kind,
      updatedAt: texts.updatedAt,
      createdAt: texts.createdAt,
    })
    .from(texts)
    .where(and(...conditions))
    .orderBy(asc(texts.page), asc(texts.key));

  return rows.map(({ createdAt, ...row }) => ({ ...row, isNew: createdAt >= newSince }));
}

export async function listSitePages(db: Database, siteId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ page: texts.page })
    .from(texts)
    .where(and(eq(texts.siteId, siteId), isNotNull(texts.page)))
    .orderBy(asc(texts.page));
  return rows.map((row) => row.page).filter((page): page is string => page !== null);
}

export async function countOrphans(db: Database, siteId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(texts)
    .where(and(eq(texts.siteId, siteId), eq(texts.status, "orphan")));
  return row?.count ?? 0;
}
