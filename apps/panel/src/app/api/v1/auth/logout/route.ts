import { apiJson } from "@/lib/api-errors";
import { getAuth } from "@/lib/auth";

/** Revokes the session of `Authorization: Bearer <token>`. Always answers 200. */
export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    try {
      await getAuth().api.signOut({ headers: new Headers({ authorization }) });
    } catch {
      // Unknown or expired session: nothing to revoke.
    }
  }
  return apiJson({ ok: true });
}
