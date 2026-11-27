export type ApiErrorCode = "unauthorized" | "invalid_request" | "not_found" | "internal_error";

/** Every API error uses the same shape: `{ error: { code, message } }`. */
export function apiError(status: number, code: ApiErrorCode, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
