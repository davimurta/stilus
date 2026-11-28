"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/admin";
import { getAuth } from "@/lib/auth";
import { isLoginBlocked, recordLoginFailure } from "@/lib/login-throttle";
import { messages } from "@/lib/messages";
import { requirePanelUser } from "@/lib/panel-access";

export type PasswordState = { status: "idle" | "ok" | "error"; message: string | null };

const schema = z.object({
  current: z.string().min(1).max(256),
  next: z.string().max(256),
  confirm: z.string().max(256),
});

export async function changePassword(
  _previous: PasswordState,
  form: FormData,
): Promise<PasswordState> {
  const user = await requirePanelUser();
  const m = messages.account;
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: m.wrongCurrent };
  const { current, next, confirm } = parsed.data;
  if (next.length < MIN_PASSWORD_LENGTH) return { status: "error", message: m.tooShort };
  if (next !== confirm) return { status: "error", message: m.mismatch };

  // Guessing the current password counts like a failed login.
  const db = getDb();
  if (await isLoginBlocked(db, user.email)) return { status: "error", message: m.blocked };
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    await recordLoginFailure(db, user.email);
    return { status: "error", message: m.wrongCurrent };
  }
  // The session cookie was renewed; a fresh page load shows the confirmation reliably.
  redirect("/conta?senha=trocada");
}
