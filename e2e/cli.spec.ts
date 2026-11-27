import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PANEL_URL, SITE_ID, SITE_KEY } from "./support/env";

const root = fileURLToPath(new URL("..", import.meta.url));

function stilus(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["packages/cli/dist/cli.js", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
}

test("stilus sync sends the example site keys to the central API", () => {
  const result = stilus(["sync", "apps/example-site"], {
    STILUS_SITE_ID: SITE_ID,
    STILUS_API_URL: PANEL_URL,
    STILUS_SITE_KEY: SITE_KEY,
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  // The e2e seed already has every key of the example site: nothing new, nothing orphaned.
  expect(result.stdout).toContain("Synced 35 text(s): 0 created, 0 orphaned, 35 unchanged.");
});

test("stilus sync is refused with a wrong site API key", () => {
  const result = stilus(["sync", "apps/example-site"], {
    STILUS_SITE_ID: SITE_ID,
    STILUS_API_URL: PANEL_URL,
    STILUS_SITE_KEY: "stilus_sk_wrong",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Sync failed (401)");
});
