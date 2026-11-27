import { getDb } from "@/db/client";
import { apiError, apiJson } from "@/lib/api-errors";
import { requireEditor } from "@/lib/editor-access";
import { notifySite } from "@/lib/revalidation";
import { undoText } from "@/lib/text-edits";

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; key: string }> },
): Promise<Response> {
  const db = getDb();
  const access = await requireEditor(db, request, await context.params);
  if (!access.ok) return access.response;

  const result = await undoText(db, {
    siteId: access.siteId,
    key: access.key,
    userId: access.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message);

  const revalidated = await notifySite(db, {
    siteId: access.siteId,
    keys: [result.key],
    userId: access.user.id,
  });
  return apiJson({ key: result.key, value: result.value, changed: true, revalidated });
}
