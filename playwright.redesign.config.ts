import { defineConfig } from "@playwright/test";

/** Synthetic, presentation-only checks: no database, workers or account fixtures. */
export default defineConfig({
  testDir: "./tests/redesign",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: "list",
  outputDir: "test-results/redesign-m1",
  use: {
    baseURL: "http://localhost:3200",
    channel: process.env.PMP_BROWSER_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --port 3200",
    url: "http://localhost:3200/dev/design",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
