import "../../tests/setup/integration";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
const name = "pmp-m6-acceptance-web";
const label = "org.pmp.acceptance=m6";
const docker = (args: string[]) =>
  execFileSync("docker", args, { stdio: "inherit" });
if (process.argv[2] === "stop") {
  const marker = execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "org.pmp.acceptance"}}',
      name,
    ],
    { encoding: "utf8" },
  ).trim();
  if (marker !== "m6")
    throw Error("Refusing to stop an unlabelled acceptance container.");
  docker(["stop", name]);
  docker(["rm", name]);
} else if (process.argv[2] === "start") {
  const env: Record<string, string> = {
    NODE_ENV: "production",
    PMP_DEPLOYMENT_ENV: "local",
    BETTER_AUTH_URL: "http://localhost:3100",
    SHARED_EXPENSES_ENABLED: "true",
    FILES_ENABLED: "true",
    NOTIFICATIONS_ENABLED: "true",
    NOTIFICATIONS_EXTERNAL_ENABLED: "false",
    FILES_TEST_ADAPTER_DIR: "/tmp/pmp-m6-files",
  };
  for (const key of ["DATABASE_URL", "AUTH_DATABASE_URL"]) {
    const url = new URL(process.env[key]!);
    if (
      url.pathname !== "/personal_management_test" ||
      !["app_domain", "auth_adapter"].includes(url.username)
    )
      throw Error("Isolated runtime roles required");
    url.hostname = "host.docker.internal";
    env[key] = url.toString();
  }
  for (const key of [
    "BETTER_AUTH_SECRET",
    "EMAIL_PROVIDER",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_FROM_NAME",
    "MAILPIT_API_URL",
  ]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  const file = "out/m6-runtime.env";
  mkdirSync("out", { recursive: true });
  writeFileSync(
    file,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    { mode: 0o600 },
  );
  try {
    docker([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      label,
      "--user",
      "node",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--env-file",
      file,
      "-p",
      "127.0.0.1:3100:3100",
      "pmp-m6-acceptance-build",
      "pnpm",
      "exec",
      "next",
      "start",
      "--port",
      "3100",
      "--hostname",
      "0.0.0.0",
    ]);
  } finally {
    unlinkSync(file);
  }
} else throw Error("Use start or stop. Build pmp-m6-acceptance-build first.");
