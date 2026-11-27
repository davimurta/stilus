"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { isLoginBlocked, recordLoginFailure } from "@/lib/login-throttle";
import { messages } from "@/lib/messages";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
});

export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: messages.login.missing };

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  if (await isLoginBlocked(db, email)) return { error: messages.login.blocked };
  try {
    // nextCookies() stores the session cookie from this Server Action.
    await getAuth().api.signInEmail({
      body: { email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch {
    await recordLoginFailure(db, email);
    return { error: messages.login.invalid };
  }
  redirect("/sites");
}

export async function logout(): Promise<void> {
  await getAuth()
    .api.signOut({ headers: await headers() })
    .catch(() => undefined);
  redirect("/entrar");
}
