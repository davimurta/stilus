import { z } from "zod";

const serverConfigSchema = z.object({
  STILUS_SITE_ID: z.uuid(),
  STILUS_API_URL: z.url(),
  STILUS_SITE_KEY: z.string().min(1),
});

export type ServerConfig = {
  siteId: string;
  apiUrl: string;
  siteKey: string;
};

/**
 * Reads the server-only Stilus settings. Returns null when they are missing or invalid,
 * so a site without configuration still builds and renders its default texts.
 */
export function readServerConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = serverConfigSchema.safeParse(env);
  if (!parsed.success) {
    return {
      config: null,
      problem: parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
    } as const;
  }
  return {
    config: {
      siteId: parsed.data.STILUS_SITE_ID,
      apiUrl: parsed.data.STILUS_API_URL.replace(/\/+$/, ""),
      siteKey: parsed.data.STILUS_SITE_KEY,
    } satisfies ServerConfig,
    problem: null,
  } as const;
}
