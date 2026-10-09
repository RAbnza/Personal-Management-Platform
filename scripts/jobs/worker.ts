import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, Client } from "pg";
import { z } from "zod";
import { createServer } from "node:http";
import {
  createRuntimeBoss,
  SECURITY_EMAIL_QUEUE,
} from "../../src/platform/jobs/boss";
import { processSecurityEmail } from "../../src/platform/email/process-delivery";
import { purgeExpiredAuthMetadata } from "../../src/platform/auth/housekeeping";
import { purgeDeletionStep } from "../../src/platform/lifecycle/purge";
import { publishDeletionCheckpoint } from "../../src/platform/lifecycle/publish-deletion-checkpoint";
import { logOperationalEvent } from "../../src/platform/observability/logger";
import { getEmailEnvironment } from "../../src/platform/env/server";

async function main() {
  try {
    loadEnvFile(".env.worker");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (process.env.WORKER_PAUSED !== "false")
    throw new Error(
      "Worker must be explicitly enabled after deployment/restore review.",
    );
  const urls = z
    .object({
      QUEUE_DATABASE_URL: z.url(),
      AUTH_DATABASE_URL: z.url(),
      LIFECYCLE_DATABASE_URL: z.url(),
      EMAIL_PAYLOAD_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
      EMAIL_PAYLOAD_KEY_ID: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
    })
    .parse(process.env);
  for (const [url, role] of [
    [urls.QUEUE_DATABASE_URL, "queue_broker"],
    [urls.AUTH_DATABASE_URL, "auth_adapter"],
    [urls.LIFECYCLE_DATABASE_URL, "lifecycle_operator"],
  ]) {
    if (
      !url ||
      !/^postgres(?:ql)?:$/.test(new URL(url).protocol) ||
      decodeURIComponent(new URL(url).username) !== role ||
      (["staging", "production"].includes(
        process.env.PMP_DEPLOYMENT_ENV ?? "local",
      ) &&
        new URL(url).searchParams.get("sslmode") !== "verify-full")
    )
      throw new Error("Worker role configuration is invalid.");
  }
  getEmailEnvironment();
  const queue = new Pool({
    connectionString: urls.QUEUE_DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
    options:
      "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000",
    application_name: "pmp-worker-queue",
  });
  const auth = new Pool({
    connectionString: urls.AUTH_DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    options:
      "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000",
    application_name: "pmp-worker-auth-maintenance",
  });
  const operator = new Client({
    connectionString: urls.LIFECYCLE_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    application_name: "pmp-worker-lifecycle",
  });
  queue.on("error", () => logOperationalEvent("worker_error"));
  auth.on("error", () => logOperationalEvent("worker_error"));
  const boss = createRuntimeBoss(queue);
  boss.on("error", () => logOperationalEvent("worker_error"));
  boss.on("warning", () => logOperationalEvent("worker_error"));
  let stopping = false,
    maintenanceAt = 0;
  let ready = false;
  let heartbeatAt = 0;
  const health = createServer((_request, response) => {
    const healthy = ready && Date.now() - heartbeatAt < 90_000;
    response.writeHead(healthy ? 200 : 503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ status: healthy ? "ready" : "unavailable" }));
  });
  if (process.env.WORKER_HEALTH_PORT)
    health.listen(
      z.coerce
        .number()
        .int()
        .min(1024)
        .max(65535)
        .parse(process.env.WORKER_HEALTH_PORT),
      "127.0.0.1",
    );
  const abort = new AbortController();
  const stop = () => {
    stopping = true;
    abort.abort();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await operator.connect();
    await boss.start();
    logOperationalEvent("worker_started");
    ready = true;
    heartbeatAt = Date.now();
    while (!stopping) {
      const jobs = await boss.fetch<{ schemaVersion: 1; deliveryId: string }>(
        SECURITY_EMAIL_QUEUE,
        { includeMetadata: true, batchSize: 1 },
      );
      for (const job of jobs) {
        const client = await queue.connect();
        try {
          await processSecurityEmail(client, job.data, job.retryCount);
          await boss.complete(SECURITY_EMAIL_QUEUE, job.id);
        } catch {
          await boss.fail(SECURITY_EMAIL_QUEUE, job.id, {
            code: "security_email_retry",
          });
          logOperationalEvent("security_email_retry");
        } finally {
          client.release();
        }
      }
      if (Date.now() >= maintenanceAt) {
        await boss.supervise(); // DML-only: stats partitioning/reindex are disabled.
        await auth.query(
          "UPDATE ops.email_delivery SET status='expired',recipient_ciphertext=decode('','hex'),payload_ciphertext=NULL,updated_at=clock_timestamp() WHERE id IN(SELECT id FROM ops.email_delivery WHERE status IN ('queued','uncertain') AND expires_at<=clock_timestamp() ORDER BY expires_at LIMIT 500)",
        );
        await auth.query(
          "DELETE FROM ops.email_delivery WHERE id IN(SELECT id FROM ops.email_delivery WHERE status NOT IN ('queued','uncertain') AND updated_at<clock_timestamp()-interval '7 days' ORDER BY updated_at LIMIT 500)",
        );
        await purgeExpiredAuthMetadata(auth);
        // Until independent deletion-register storage is configured, retain
        // the manual reviewed operator path. Never automate an uncheckpointed purge.
        const requests =
          process.env.LIFECYCLE_AUTOMATION_ENABLED === "true"
            ? await operator.query(
                "SELECT id,target_user_id,target_workspace_id,requested_at,purge_after FROM ops.deletion_request WHERE state IN ('pending','purging','failed') AND purge_after<=clock_timestamp() ORDER BY purge_after LIMIT 5",
              )
            : { rows: [] };
        for (const request of requests.rows) {
          try {
            await publishDeletionCheckpoint({
              schemaVersion: 1,
              requestId: request.id,
              targetUserId: request.target_user_id,
              targetWorkspaceId: request.target_workspace_id,
              requestedAt: request.requested_at.toISOString(),
              purgeAfter: request.purge_after.toISOString(),
            });
            await purgeDeletionStep(operator, request.id);
          } catch {
            logOperationalEvent("lifecycle_error");
          }
        }
        const backlog = (
          await queue.query(
            "SELECT count(*)::int AS count,COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(created_at))*1000,0)::float8 AS age_ms FROM ops.email_delivery WHERE status IN ('queued','uncertain')",
          )
        ).rows[0];
        logOperationalEvent("worker_heartbeat", {
          count: backlog.count,
          durationMs: Math.max(0, backlog.age_ms),
        });
        maintenanceAt = Date.now() + 60_000;
      }
      heartbeatAt = Date.now();
      if (!jobs.length)
        await delay(1000, undefined, { signal: abort.signal }).catch(() => {});
    }
  } finally {
    ready = false;
    if (health.listening)
      await new Promise<void>((resolve) => health.close(() => resolve()));
    await boss.stop({ graceful: true });
    await Promise.all([queue.end(), auth.end(), operator.end()]);
    logOperationalEvent("worker_stopped");
  }
}
void main().catch(() => {
  logOperationalEvent("worker_error");
  process.exitCode = 1;
});
