import { defineConfig } from "@playwright/test";

/**
 * Extension e2e. Loads the DEV build of dist/ (built by globalSetup) in a
 * persistent Chromium context; the fixture API on 127.0.0.1:8788 stands in
 * for openqr.uk (dev host permissions include it).
 */
export default defineConfig({
  testDir: "e2e/tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    headless: false,
    viewport: { width: 1280, height: 800 },
  },
  globalSetup: "e2e/global-setup.mts",
  webServer: {
    command: "node e2e/fixtures/api-server.mjs",
    port: 8788,
    reuseExistingServer: true,
  },
  outputDir: "test-results",
});
