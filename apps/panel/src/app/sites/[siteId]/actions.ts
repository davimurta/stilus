"use server";

import { textKeySchema } from "@davimurta/stilus-shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { restoreVersion } from "@/lib/history";
import { messages } from "@/lib/messages";
import { requireSiteAccess } from "@/lib/panel-access";
import { notifySite } from "@/lib/revalidation";
import { updateText } from "@/lib/text-edits";
import { canEditSite } from "@/lib/users";

export type ActionState = { status: "idle" | "ok" | "pending" | "error"; message: string | null };

const ids = z.object({ siteId: z.uuid(), key: textKeySchema });

/** Session, then membership: the same rule as the API. Throws to the error page otherwise. */
async function authorize(siteId: string) {
  const { user, site } = await requireSiteAccess(siteId);
  if (!(await canEditSite(getDb(), user.id, site.id))) throw new Error("Forbidden");
  return { user, site };
}

async function afterEdit(siteId: string, key: string, userId: string, changed: boolean) {
  revalidatePath(`/sites/${siteId}`, "layout");
  if (!changed) return { status: "ok", message: messages.text.unchanged } as const;
  const revalidated = await notifySite(getDb(), { siteId, keys: [key], userId });
  return revalidated
    ? ({ status: "ok", message: messages.text.saved } as const)
    : ({ status: "pending", message: messages.text.savedPending } as const);
}

export async function saveText(
  siteId: string,
  key: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const params = ids.parse({ siteId, key });
  const value = z.string().safeParse(form.get("value"));
  if (!value.success) return { status: "error", message: messages.text.unchanged };
  const { user } = await authorize(params.siteId);

  const result = await updateText(getDb(), { ...params, value: value.data, userId: user.id });
  if (!result.ok) return { status: "error", message: result.message };
  return afterEdit(params.siteId, params.key, user.id, result.changed);
}

export async function restoreTextVersion(
  siteId: string,
  key: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const params = ids.parse({ siteId, key });
  const versionId = z.uuid().safeParse(form.get("versionId"));
  if (!versionId.success) return { status: "error", message: "Versão inválida." };
  const { user } = await authorize(params.siteId);

  const result = await restoreVersion(getDb(), {
    ...params,
    versionId: versionId.data,
    userId: user.id,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return afterEdit(params.siteId, params.key, user.id, result.changed);
}

export async function revalidateSite(siteId: string): Promise<ActionState> {
  const id = z.uuid().parse(siteId);
  const { user } = await authorize(id);
  const ok = await notifySite(getDb(), { siteId: id, keys: [], userId: user.id });
  revalidatePath(`/sites/${id}`, "layout");
  return ok
    ? { status: "ok", message: messages.revalidation.done }
    : { status: "error", message: messages.revalidation.failed };
}
