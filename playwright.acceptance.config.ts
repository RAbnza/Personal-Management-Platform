import { defineConfig } from "@playwright/test";
import "./tests/setup/integration";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
// Run against a separately started, guarded production test runtime. Never use
// the owner's preview. All artifact capture stays disabled for M6.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: [
    "m6-acceptance.spec.ts",
    "m4-workspaces.smoke.spec.ts",
    "m5-workspaces.smoke.spec.ts",
    "navigation-refinement.smoke.spec.ts",
    "redesign-m2-m3.smoke.spec.ts",
  ],
  workers: 1,
  globalSetup: "./scripts/testing/redesign-acceptance-ready.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "out/m6-browser-results.json" }]],
  outputDir: "out/m6-browser",
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    actionTimeout: 20_000,
    viewport: { width: 1440, height: 1000 },
    screenshot: "off",
    video: "off",
    trace: "off",
  },
});
