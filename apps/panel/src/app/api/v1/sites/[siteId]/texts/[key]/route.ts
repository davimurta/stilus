import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, apiJson } from "@/lib/api-errors";
import { requireEditor } from "@/lib/editor-access";
import { readJson } from "@/lib/request";
import { notifySite } from "@/lib/revalidation";
import { updateText } from "@/lib/text-edits";

const bodySchema = z.object({ value: z.string() });

export async function PUT(
  request: Request,
  context: { params: Promise<{ siteId: string; key: string }> },
): Promise<Response> {
  const db = getDb();
  const access = await requireEditor(db, request, await context.params);
  if (!access.ok) return access.response;

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const result = await updateText(db, {
    siteId: access.siteId,
    key: access.key,
    value: body.data.value,
    userId: access.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message);

  const revalidated = result.changed
    ? await notifySite(db, { siteId: access.siteId, keys: [result.key], userId: access.user.id })
    : true;
  return apiJson({ key: result.key, value: result.value, changed: result.changed, revalidated });
}
