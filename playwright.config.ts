import { defineConfig, devices } from "@playwright/test";
import {
  DEAD_API_PORT,
  E2E_DATABASE_URL,
  OFFLINE_SITE_PORT,
  PANEL_PORT,
  PANEL_URL,
  SITE_ID,
  SITE_KEY,
  SITE_PORT,
  SITE_URL,
} from "./e2e/support/env";

// Needs `pnpm build` (panel) and `pnpm db:up` first. Static/ISR behaviour only exists in
// production builds, so the example site is built here, against the running panel.
const siteEnv = { STILUS_SITE_ID: SITE_ID, STILUS_SITE_KEY: SITE_KEY };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: SITE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "panel",
      command: `tsx e2e/support/prepare-db.ts && pnpm --filter panel exec next start --port ${PANEL_PORT}`,
      url: `${PANEL_URL}/api/v1/sites/${SITE_ID}/texts`,
      env: { DATABASE_URL: E2E_DATABASE_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: "site",
      command:
        `tsx e2e/support/wait-for.ts ${PANEL_URL} && ` +
        `pnpm --filter example-site exec next build && ` +
        `pnpm --filter example-site exec next start --port ${SITE_PORT}`,
      url: SITE_URL,
      env: { ...siteEnv, STILUS_API_URL: PANEL_URL, EXAMPLE_SITE_DIST_DIR: ".next-e2e" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      name: "site-offline",
      command:
        `pnpm --filter example-site exec next build && ` +
        `pnpm --filter example-site exec next start --port ${OFFLINE_SITE_PORT}`,
      url: `http://localhost:${OFFLINE_SITE_PORT}`,
      env: {
        ...siteEnv,
        STILUS_API_URL: `http://127.0.0.1:${DEAD_API_PORT}`,
        EXAMPLE_SITE_DIST_DIR: ".next-e2e-offline",
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
