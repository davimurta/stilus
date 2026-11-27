import "server-only";
import { cache } from "react";
import { readServerConfig } from "./config.js";
import { fetchTextMap, resolveText, type TextMap } from "./fetch-texts.js";

let warnedAboutConfig = false;

/** The site's text map, fetched once per request/revalidation (deduplicated with React.cache). */
export const getTextMap = cache(async (): Promise<TextMap | null> => {
  const { config, problem } = readServerConfig();
  if (!config) {
    if (!warnedAboutConfig) {
      warnedAboutConfig = true;
      console.warn(`[stilus] Missing or invalid settings (${problem}). Using default texts.`);
    }
    return null;
  }
  return fetchTextMap(config);
});

/**
 * Text for places outside JSX (metadata, alt, placeholder).
 * `fallback` is the default text, used when the API has no value or is unavailable.
 */
export async function t(key: string, fallback: string): Promise<string> {
  return resolveText(await getTextMap(), key, fallback);
}
