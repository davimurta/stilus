import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, apiJson } from "@/lib/api-errors";
import { getAuth } from "@/lib/auth";
import { isLoginBlocked, recordLoginFailure } from "@/lib/login-throttle";
import { readJson } from "@/lib/request";
import { listUserSites } from "@/lib/users";

const bodySchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const email = body.data.email.toLowerCase();
  // Checked before the password, so a blocked account gives no hint about the password.
  if (await isLoginBlocked(db, email)) {
    return apiError(
      "too_many_attempts",
      "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.",
    );
  }

  let result;
  try {
    result = await getAuth().api.signInEmail({
      body: { email, password: body.data.password },
      returnHeaders: true,
    });
  } catch {
    await recordLoginFailure(db, email);
    // Same answer for unknown email and wrong password.
    return apiError("invalid_credentials", "E-mail ou senha incorretos.");
  }

  const token = result.headers.get("set-auth-token");
  if (!token) return apiError("internal_error", "Login did not return a session token.");

  const { user } = result.response;
  const sites = await listUserSites(db, user.id);
  return apiJson({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    sites,
  });
}
