import type { SyncKey, SyncResult } from "@davimurta/stilus-shared";
import { z } from "zod";

const configSchema = z.object({
  STILUS_SITE_ID: z.uuid(),
  STILUS_API_URL: z.url(),
  STILUS_SITE_KEY: z.string().min(1),
});

export type SyncConfig = { siteId: string; apiUrl: string; siteKey: string };

export function readSyncConfig(env: Record<string, string | undefined>): SyncConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid settings: ${names}.`);
  }
  return {
    siteId: parsed.data.STILUS_SITE_ID,
    apiUrl: parsed.data.STILUS_API_URL.replace(/\/+$/, ""),
    siteKey: parsed.data.STILUS_SITE_KEY,
  };
}

const resultSchema = z.object({
  created: z.array(z.string()),
  orphaned: z.array(z.string()),
  unchanged: z.array(z.string()),
});

export async function sendSync(
  config: SyncConfig,
  keys: SyncKey[],
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const response = await fetchImpl(
    `${config.apiUrl}/api/v1/sites/${encodeURIComponent(config.siteId)}/sync`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.siteKey}`,
      },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ?? response.statusText;
    throw new Error(`Sync failed (${response.status}): ${message}`);
  }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) throw new Error("Sync failed: unexpected answer from the central API.");
  return parsed.data;
}
