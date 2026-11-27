import { z } from "zod";
import type { ServerConfig } from "./config.js";

/** Safety net: even if a revalidation webhook is lost, texts refresh at least this often. */
export const REVALIDATE_SECONDS = 3600;
export const DEFAULT_TIMEOUT_MS = 5000;

export function siteCacheTag(siteId: string): string {
  return `stilus:${siteId}`;
}

const responseSchema = z.object({ texts: z.record(z.string(), z.string()) });

export type TextMap = Readonly<Record<string, string>>;

export type FetchTextsOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  warn?: (message: string) => void;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Fetches the whole text map of the site from the central API.
 * Never throws: any failure (network, timeout, non-200, bad payload) returns null,
 * and callers render the default texts written in the code.
 */
export async function fetchTextMap(
  config: ServerConfig,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    warn = console.warn,
  }: FetchTextsOptions = {},
): Promise<TextMap | null> {
  const url = `${config.apiUrl}/api/v1/sites/${encodeURIComponent(config.siteId)}/texts`;
  try {
    // A timeout race instead of an AbortSignal: a signal opts the fetch out of Next's memoization.
    const response = await withTimeout(
      fetchImpl(url, {
        headers: { authorization: `Bearer ${config.siteKey}` },
        // Requests with an authorization header are only cached when asked explicitly.
        cache: "force-cache",
        next: { revalidate: REVALIDATE_SECONDS, tags: [siteCacheTag(config.siteId)] },
      }),
      timeoutMs,
    );
    if (!response.ok) {
      warn(`[stilus] Text API answered ${response.status}. Using default texts.`);
      return null;
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      warn("[stilus] Text API returned an unexpected payload. Using default texts.");
      return null;
    }
    return parsed.data.texts;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`[stilus] Text API unreachable (${reason}). Using default texts.`);
    return null;
  }
}

/** The stored value when there is one, otherwise the default written in the code. */
export function resolveText(map: TextMap | null, key: string, fallback: string): string {
  if (!map || !Object.hasOwn(map, key)) return fallback;
  return map[key] ?? fallback;
}
