import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { DEFAULT_PAGES } from "./support/pages";

type PrerenderManifest = {
  routes: Record<string, { initialRevalidateSeconds: number | false }>;
};

function readManifest(distDir: string): PrerenderManifest {
  const path = fileURLToPath(
    new URL(`../apps/example-site/${distDir}/prerender-manifest.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as PrerenderManifest;
}

for (const distDir of [".next-e2e", ".next-e2e-offline"]) {
  test(`public pages stay prerendered with ISR (${distDir})`, () => {
    const { routes } = readManifest(distDir);
    for (const page of DEFAULT_PAGES) {
      const route = routes[page.path];
      expect(route, `${page.path} must be prerendered`).toBeDefined();
      // The time-based safety net (1h) keeps the page ISR even when the API was down at build.
      expect(route?.initialRevalidateSeconds).toBe(3600);
    }
  });
}
