import "../../tests/setup/integration";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

async function docker(args: string[], env?: Partial<NodeJS.ProcessEnv>) {
  return new Promise<{ code: number; out: string }>((resolve, reject) => {
    const child = spawn("docker", args, {
      shell: false,
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (b: Buffer) => {
      out += b.toString();
    });
    // Docker errors can contain configuration. Never forward raw stderr.
    child.stderr.resume();
    child.once("error", () => reject(new Error("Container tool unavailable.")));
    child.once("close", (code) => resolve({ code: code ?? 1, out }));
  });
}
async function main() {
  const network =
    process.env.PMP_TEST_DOCKER_NETWORK ??
    "personal-management-platform_default";
  const databaseHost =
    process.env.PMP_TEST_DOCKER_DATABASE_HOST ?? "pmp-postgres";
  assert.match(network, /^[a-zA-Z0-9_.-]+$/);
  assert.match(databaseHost, /^[a-zA-Z0-9_.-]+$/);
  const bootstrap = parseEnv(await readFile(".env.bootstrap", "utf8"));
  function connection(role: string, password: string) {
    const u = new URL(process.env.DATABASE_URL!);
    assert.equal(u.pathname, "/personal_management_test");
    u.hostname = databaseHost;
    u.port = "5432";
    u.username = role;
    u.password = password;
    return u.toString();
  }
  const prefix = process.env.PMP_TEST_IMAGE_PREFIX ?? "pmp-v1-c5";
  assert.match(prefix, /^[a-zA-Z0-9_./:-]+$/);
  const names: string[] = [];
  const image = (target: string) => `${prefix}-${target}`;
  const common = {
    PMP_DEPLOYMENT_ENV: "test",
    EMAIL_PROVIDER: "mailpit",
    EMAIL_FROM_ADDRESS: "container@example.test",
    EMAIL_FROM_NAME: "Container acceptance",
    MAILPIT_API_URL: "http://pmp-mailpit:8025",
    EMAIL_PAYLOAD_KEY: process.env.EMAIL_PAYLOAD_KEY!,
    EMAIL_PAYLOAD_KEY_ID: process.env.EMAIL_PAYLOAD_KEY_ID!,
  };
  async function run(target: string, env: Partial<NodeJS.ProcessEnv>) {
    const name = `pmp-c5-smoke-${target}-${randomUUID()}`;
    names.push(name);
    const result = await docker(
      [
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        ...Object.keys(env).flatMap((k) => ["--env", k]),
        image(target),
      ],
      env,
    );
    assert.equal(result.code, 0, "Container startup failed.");
    return name;
  }
  async function inside(name: string, code: string) {
    const result = await docker(["exec", name, "node", "--eval", code]);
    assert.equal(result.code, 0, "Container acceptance assertion failed.");
  }
  try {
    for (const target of ["web", "worker", "backup"]) {
      const result = await docker([
        "run",
        "--rm",
        "--entrypoint",
        "node",
        image(target),
        "--eval",
        "const a=require('node:assert/strict'),f=require('node:fs');a.notEqual(process.getuid(),0);for(const p of ['.env','.env.test','.env.bootstrap','.env.worker','.env.backup','node_modules/vitest','node_modules/@playwright/test','node_modules/drizzle-kit'])a.equal(f.existsSync(p),false,p)",
      ]);
      assert.equal(
        result.code,
        0,
        `${target} non-root/secret/dependency boundary failed.`,
      );
    }
    const web = await run("web", {
      ...common,
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      DATABASE_URL: connection("app_domain", bootstrap.APP_DOMAIN_PASSWORD!),
      AUTH_DATABASE_URL: connection(
        "auth_adapter",
        bootstrap.AUTH_ADAPTER_PASSWORD!,
      ),
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    const worker = await run("worker", {
      ...common,
      WORKER_PAUSED: "false",
      WORKER_HEALTH_PORT: "3201",
      LIFECYCLE_AUTOMATION_ENABLED: "false",
      QUEUE_DATABASE_URL: connection(
        "queue_broker",
        bootstrap.QUEUE_BROKER_PASSWORD!,
      ),
      AUTH_DATABASE_URL: connection(
        "auth_adapter",
        bootstrap.AUTH_ADAPTER_PASSWORD!,
      ),
      LIFECYCLE_DATABASE_URL: connection(
        "lifecycle_operator",
        bootstrap.LIFECYCLE_OPERATOR_PASSWORD!,
      ),
    });
    const health = (port: number) =>
      `fetch('http://127.0.0.1:${port}/api/health').then(async r=>{require('node:assert/strict').equal(r.status,200);require('node:assert/strict').equal(r.headers.get('cache-control'),'no-store');require('node:assert/strict').deepEqual(await r.json(),{status:'ready'})}).catch(()=>process.exit(1))`;
    for (const [name, port] of [
      [web, 3000],
      [worker, 3201],
    ] as const) {
      let ready = false;
      for (let n = 0; n < 30; n++) {
        if (
          (await docker(["exec", name, "node", "--eval", health(port)]))
            .code === 0
        ) {
          ready = true;
          break;
        }
        await delay(1000);
      }
      assert.ok(ready, "Container did not become ready.");
    }
    await inside(
      web,
      "require('node:assert/strict').equal(process.env.QUEUE_DATABASE_URL,undefined);require('node:assert/strict').equal(process.env.DATABASE_MIGRATION_URL,undefined);fetch('http://127.0.0.1:3000/api/v1/accounts').then(async r=>{require('node:assert/strict').equal(r.status,401);require('node:assert/strict').match(r.headers.get('cache-control'),/no-store/)}).catch(()=>process.exit(1))",
    );
    await inside(
      worker,
      "require('node:assert/strict').equal(process.env.DATABASE_URL,undefined);require('node:assert/strict').equal(process.env.DATABASE_MIGRATION_URL,undefined)",
    );
    const stopped = await docker(["stop", "--timeout", "35", worker]);
    assert.equal(stopped.code, 0);
    assert.equal(
      (
        await docker(["inspect", "--format", "{{.State.ExitCode}}", worker])
      ).out.trim(),
      "0",
    );
    const logs = (await docker(["logs", worker])).out;
    assert.match(logs, /worker_started/);
    assert.match(logs, /worker_heartbeat/);
    assert.match(logs, /worker_stopped/);
    assert.doesNotMatch(
      logs,
      /postgres(?:ql)?:\/\/|container@example\.test|recipient|ciphertext/,
    );
    const backupVersion = await docker([
      "run",
      "--rm",
      "--entrypoint",
      "pg_dump",
      image("backup"),
      "--version",
    ]);
    assert.equal(backupVersion.code, 0);
    assert.match(backupVersion.out, /17\.11/);
    const rejected = await docker(["run", "--rm", image("backup")]);
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.out, /^$/);
    await mkdir("test-results/containers", { recursive: true });
    await writeFile(
      "test-results/containers/evidence.json",
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          targets: ["web", "worker", "backup"],
          checks: [
            "non-root",
            "no environment files",
            "no development dependencies",
            "restricted web/worker roles",
            "web and worker health",
            "private API rejects anonymous",
            "bounded graceful worker shutdown",
            "PostgreSQL 17.11 backup client",
            "unconfigured backup fails closed",
          ],
          cloudBackupVerified: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Linux container acceptance passed: restricted roles, non-root artifacts, health, private API, worker shutdown and fail-closed backup tooling.",
    );
  } finally {
    for (const name of names) {
      assert.match(name, /^pmp-c5-smoke-(web|worker)-[a-f0-9-]{36}$/);
      await docker(["rm", "--force", name]);
    }
  }
}
void main().catch(() => {
  console.error(
    "Linux container acceptance failed; no credentials or private diagnostics are printed.",
  );
  process.exitCode = 1;
});
