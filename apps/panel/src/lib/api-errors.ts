export type ApiErrorCode =
  | "unauthorized"
  | "invalid_credentials"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "too_long"
  | "invalid_value"
  | "nothing_to_undo"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_credentials: 401,
  forbidden: 403,
  invalid_request: 400,
  not_found: 404,
  too_long: 422,
  invalid_value: 422,
  nothing_to_undo: 409,
  internal_error: 500,
};

/** Every API error uses the same shape: `{ error: { code, message } }`. */
export function apiError(code: ApiErrorCode, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { "cache-control": "no-store" } },
  );
}

export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
