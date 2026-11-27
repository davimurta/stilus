import { textKeySchema } from "@stilus/shared";
import { z } from "zod";
import type { Database } from "../db/client";
import { apiError } from "./api-errors";
import { getUserFromRequest, type AuthenticatedUser } from "./auth";
import { canEditSite } from "./users";

const paramsSchema = z.object({ siteId: z.uuid(), key: textKeySchema });

/**
 * Shared checks of the text edit routes, in order: user session (401), params (400),
 * permission on the site (403). Authorization always happens here, on the central API.
 */
export async function requireEditor(
  db: Database,
  request: Request,
  rawParams: { siteId: string; key: string },
): Promise<
  | { ok: true; user: AuthenticatedUser; siteId: string; key: string }
  | { ok: false; response: Response }
> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return { ok: false, response: apiError("unauthorized", "Missing or invalid session.") };
  }
  const params = paramsSchema.safeParse({
    siteId: rawParams.siteId,
    key: decodeURIComponent(rawParams.key),
  });
  if (!params.success) {
    return { ok: false, response: apiError("invalid_request", "Invalid site id or text key.") };
  }
  if (!(await canEditSite(db, user.id, params.data.siteId))) {
    return {
      ok: false,
      response: apiError("forbidden", "Você não tem permissão para editar este site."),
    };
  }
  return { ok: true, user, ...params.data };
}
