import type { z } from "zod";
import { apiError } from "./api-errors";

/** Max accepted JSON body size, in bytes. Texts are capped far below this. */
const MAX_BODY_BYTES = 64 * 1024;

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("invalid_request", "Request body is too large.") };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, response: apiError("invalid_request", "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { ok: false, response: apiError("invalid_request", message) };
  }
  return { ok: true, data: parsed.data };
}
