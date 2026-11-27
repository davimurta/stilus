import { syncRequestSchema } from "@stilus/shared";
import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, apiJson } from "@/lib/api-errors";
import { readJson } from "@/lib/request";
import { notifySite } from "@/lib/revalidation";
import { authenticateSite } from "@/lib/site-auth";
import { syncTexts } from "@/lib/sync";

const siteIdSchema = z.uuid();

/** Called by `stilus sync` (CI/build) with the site API key. */
export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params;
  if (!siteIdSchema.safeParse(siteId).success) {
    return apiError("invalid_request", "siteId must be a UUID.");
  }
  const db = getDb();
  const auth = await authenticateSite(db, siteId, request.headers.get("authorization"));
  if (!auth.ok) return apiError("unauthorized", "Missing or invalid site API key.");

  const body = await readJson(request, syncRequestSchema, 2 * 1024 * 1024);
  if (!body.ok) return body.response;

  const { changedValues, ...result } = await syncTexts(db, auth.siteId, body.data.keys);
  if (changedValues.length > 0) {
    await notifySite(db, { siteId: auth.siteId, keys: changedValues, userId: null });
  }
  return apiJson(result);
}
