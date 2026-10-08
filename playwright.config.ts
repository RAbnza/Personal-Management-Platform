import { defineConfig } from "@playwright/test";
import "./tests/setup/integration";
// Refuse development/production databases using the integration environment
// guard. Never reuse a user's existing application server or authentication.
const baseURL = "http://localhost:3100";
process.env.BETTER_AUTH_URL = baseURL;
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
    ...(process.env.PMP_BROWSER_CHANNEL
      ? { channel: process.env.PMP_BROWSER_CHANNEL }
      : {}),
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec next start --port 3100",
    url: `${baseURL}/auth/sign-in`,
    reuseExistingServer: false,
    env: { ...process.env, BETTER_AUTH_URL: baseURL },
    timeout: 60000,
  },
});
