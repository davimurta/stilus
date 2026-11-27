import { z } from "zod";
import { getDb } from "@/db/client";
import { apiError, apiJson } from "@/lib/api-errors";
import { getAuth } from "@/lib/auth";
import { readJson } from "@/lib/request";
import { listUserSites } from "@/lib/users";

const bodySchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  let result;
  try {
    result = await getAuth().api.signInEmail({
      body: { email: body.data.email.toLowerCase(), password: body.data.password },
      returnHeaders: true,
    });
  } catch {
    // Same answer for unknown email and wrong password.
    return apiError("invalid_credentials", "E-mail ou senha incorretos.");
  }

  const token = result.headers.get("set-auth-token");
  if (!token) return apiError("internal_error", "Login did not return a session token.");

  const { user } = result.response;
  const sites = await listUserSites(getDb(), user.id);
  return apiJson({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    sites,
  });
}
