import { defineConfig } from "@playwright/test";
import "./tests/setup/integration";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const bootstrap = parseEnv(readFileSync(".env.bootstrap", "utf8"));
const queueUrl = new URL(process.env.AUTH_DATABASE_URL!);
queueUrl.username = "queue_broker";
queueUrl.password = bootstrap.QUEUE_BROKER_PASSWORD!;
const lifecycleUrl = new URL(process.env.AUTH_DATABASE_URL!);
lifecycleUrl.username = "lifecycle_operator";
lifecycleUrl.password = bootstrap.LIFECYCLE_OPERATOR_PASSWORD!;
// Refuse development/production databases using the integration environment
// guard. Never reuse a user's existing application server or authentication.
const baseURL = "http://localhost:3100";
// The test runner provisions fixtures; child web/worker processes receive only
// their runtime credentials. An inherited administrator/migration URL must
// never become part of those process environments.
const runtimeEnvironment = {
  ...process.env,
  DATABASE_MIGRATION_URL: "",
  TEST_DATABASE_ADMIN_URL: "",
  BOOTSTRAP_DATABASE_URL: "",
  MIGRATION_OWNER_PASSWORD: "",
  POSTGRES_PASSWORD: "",
  APP_DOMAIN_PASSWORD: "",
  AUTH_ADAPTER_PASSWORD: "",
  QUEUE_BROKER_PASSWORD: "",
  WORKER_DOMAIN_PASSWORD: "",
  LIFECYCLE_OPERATOR_PASSWORD: "",
};
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
  webServer: [
    {
      command: "pnpm exec next start --port 3100",
      url: `${baseURL}/auth/sign-in`,
      reuseExistingServer: false,
      env: { ...runtimeEnvironment, BETTER_AUTH_URL: baseURL },
      timeout: 60000,
    },
    {
      command: "pnpm exec tsx scripts/jobs/worker.ts",
      url: "http://127.0.0.1:3101",
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        ...runtimeEnvironment,
        DATABASE_URL: "",
        QUEUE_DATABASE_URL: queueUrl.toString(),
        LIFECYCLE_DATABASE_URL: lifecycleUrl.toString(),
        WORKER_PAUSED: "false",
        WORKER_HEALTH_PORT: "3101",
        LIFECYCLE_AUTOMATION_ENABLED: "false",
      },
    },
  ],
});
