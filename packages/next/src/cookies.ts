/** httpOnly cookie with the editor's session token (never readable by page scripts). */
export const SESSION_COOKIE = "stilus_session";
/** Readable flag that only turns the editor UI on. Grants nothing by itself. */
export const EDIT_FLAG_COOKIE = "stilus_edit";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:";
}

function serialize(
  request: Request,
  name: string,
  value: string,
  { httpOnly, maxAge }: { httpOnly: boolean; maxAge: number },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (httpOnly) parts.push("HttpOnly");
  if (isHttps(request)) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookies(request: Request, token: string): string[] {
  return [
    serialize(request, SESSION_COOKIE, token, { httpOnly: true, maxAge: SESSION_MAX_AGE_SECONDS }),
    serialize(request, EDIT_FLAG_COOKIE, "1", { httpOnly: false, maxAge: SESSION_MAX_AGE_SECONDS }),
  ];
}

export function clearedCookies(request: Request): string[] {
  return [
    serialize(request, SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 }),
    serialize(request, EDIT_FLAG_COOKIE, "", { httpOnly: false, maxAge: 0 }),
  ];
}
