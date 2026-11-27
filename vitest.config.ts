import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const panelSrc = fileURLToPath(new URL("./apps/panel/src", import.meta.url));
// Tests read workspace packages from source, so `pnpm test` does not need a prior build.
const sharedSrc = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));
const alias = { "@": panelSrc, "@stilus/shared": sharedSrc };
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://stilus:stilus@localhost:54329/stilus_test";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/panel/src/**/*.test.ts"],
        },
      },
      {
        // Integration tests of the central API against a real Postgres (docker compose).
        resolve: { alias },
        test: {
          name: "panel-integration",
          include: ["apps/panel/test/**/*.test.ts"],
          globalSetup: ["apps/panel/test/global-setup.ts"],
          setupFiles: ["apps/panel/test/setup.ts"],
          fileParallelism: false,
          env: { DATABASE_URL: testDatabaseUrl },
        },
      },
    ],
  },
});
