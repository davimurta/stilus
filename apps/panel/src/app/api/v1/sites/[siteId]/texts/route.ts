import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError } from "@/lib/api-errors";
import { authenticateSite } from "@/lib/site-auth";
import { getTextMap } from "@/lib/texts";

const siteIdSchema = z.uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params;
  if (!siteIdSchema.safeParse(siteId).success) {
    return apiError(400, "invalid_request", "siteId must be a UUID.");
  }

  const db = getDb();
  const auth = await authenticateSite(db, siteId, request.headers.get("authorization"));
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Missing or invalid site API key.");
  }

  const textMap = await getTextMap(db, auth.siteId);
  return Response.json({ texts: textMap }, { headers: { "cache-control": "no-store" } });
}
