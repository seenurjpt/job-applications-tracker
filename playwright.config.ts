import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Generous timeouts: E2E runs against `next dev`, which compiles routes on
  // first hit (production builds refuse E2E_TEST_MODE by design).
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  webServer: {
    command: "node e2e/start-server.mjs",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
