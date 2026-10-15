import { processAttachment } from "../../src/platform/files/process-attachment";
import { createPrivateEvidenceStore } from "../../src/platform/files/object-store";
import { createClamScanner } from "../../src/platform/files/malware-scanner";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, Client } from "pg";
import { z } from "zod";
import { createServer } from "node:http";
import {
  createRuntimeBoss,
  SECURITY_EMAIL_QUEUE,
  NOTIFICATION_EMAIL_QUEUE,
  NOTIFICATION_EMAIL_DEAD_QUEUE,
} from "../../src/platform/jobs/boss";
import { processSecurityEmail } from "../../src/platform/email/process-delivery";
import {
  notificationsAllowed,
  processNotificationEmail,
  scanNotificationScope,
} from "../../src/platform/email/notification-delivery";
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
  const notificationUrl = process.env.NOTIFICATION_DATABASE_URL;
  if (
    process.env.NOTIFICATIONS_ENABLED === "true" &&
    (!notificationUrl ||
      new URL(notificationUrl).username !== "worker_domain" ||
      (["staging", "production"].includes(
        process.env.PMP_DEPLOYMENT_ENV ?? "local",
      ) &&
        new URL(notificationUrl).searchParams.get("sslmode") !== "verify-full"))
  )
    throw new Error(
      "Notification worker requires restricted verified configuration.",
    );
  const notifications =
    process.env.NOTIFICATIONS_ENABLED === "true"
      ? new Pool({
          connectionString: notificationUrl,
          max: 2,
          connectionTimeoutMillis: 5000,
          options:
            "-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000",
          application_name: "pmp-worker-notifications",
        })
      : null;
  notifications?.on("error", () => logOperationalEvent("worker_error"));
  const fileUrl = process.env.FILES_DATABASE_URL;
  if (
    process.env.FILES_ENABLED === "true" &&
    (!fileUrl ||
      new URL(fileUrl).username !== "worker_domain" ||
      (["staging", "production"].includes(
        process.env.PMP_DEPLOYMENT_ENV ?? "local",
      ) &&
        new URL(fileUrl).searchParams.get("sslmode") !== "verify-full"))
  )
    throw new Error("Restricted file worker configuration required.");
  const files =
    process.env.FILES_ENABLED === "true"
      ? new Pool({
          connectionString: fileUrl,
          max: 2,
          connectionTimeoutMillis: 5000,
          options: "-c statement_timeout=15000 -c lock_timeout=5000",
          application_name: "pmp-private-files",
        })
      : null;
  const fileStore = files ? createPrivateEvidenceStore() : null,
    fileScanner = files ? createClamScanner() : null;
  files?.on("error", () => logOperationalEvent("worker_error"));
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
  let fileTask: Promise<void> | null = null;
  let heartbeatAt = 0;
  let fileCursor = "00000000-0000-0000-0000-000000000000";
  let notificationCursor = "00000000-0000-0000-0000-000000000000";
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
      if (files && fileStore && fileScanner && !fileTask) {
        const fileJobs = await boss.fetch("v2-private-file-scan", {
          batchSize: 1,
        });
        for (const job of fileJobs) {
          fileTask = (async () => {
            try {
              const result = await processAttachment(
                files,
                job.data,
                fileStore,
                fileScanner,
                abort.signal,
              );
              if (result.processed)
                await boss.complete("v2-private-file-scan", job.id);
              else
                await boss.fail("v2-private-file-scan", job.id, {
                  code: "file_scan_unconfirmed",
                });
            } catch {
              await boss.fail("v2-private-file-scan", job.id, {
                code: "file_scan_unconfirmed",
              });
            } finally {
              fileTask = null;
            }
          })().catch(() => logOperationalEvent("worker_error"));
        }
      }
      if (notifications && notificationsAllowed()) {
        const notificationJobs = await boss.fetch(NOTIFICATION_EMAIL_QUEUE, {
          batchSize: 1,
        });
        for (const job of notificationJobs) {
          try {
            await processNotificationEmail(
              notifications,
              notifications,
              job.data,
            );
            await boss.complete(NOTIFICATION_EMAIL_QUEUE, job.id);
          } catch {
            await boss.fail(NOTIFICATION_EMAIL_QUEUE, job.id, {
              code: "notification_retry",
            });
            logOperationalEvent("notification_retry");
          }
        }
      }
      if (Date.now() >= maintenanceAt) {
        if (files) {
          const candidates = (
            await files.query("SELECT id FROM ops.file_candidates($1)", [
              fileCursor,
            ])
          ).rows;
          const producer = createRuntimeBoss(files);
          fileCursor =
            candidates.length === 100
              ? candidates[99].id
              : "00000000-0000-0000-0000-000000000000";
          for (const f of candidates)
            await producer.send(
              "v2-private-file-scan",
              { schemaVersion: 1, attachmentId: f.id },
              { singletonKey: f.id },
            );
        }
        if (notifications && notificationsAllowed()) {
          let after = notificationCursor;
          for (let page = 0; page < 100; page++) {
            const scopes = (
              await notifications.query(
                'SELECT user_id AS "userId",workspace_id AS "workspaceId" FROM ops.notification_scopes($1)',
                [after],
              )
            ).rows;
            for (const scope of scopes) {
              if (stopping) break;
              try {
                const result = await scanNotificationScope(
                  notifications,
                  scope,
                );
                logOperationalEvent("notification_scan", {
                  count: result.scheduled,
                });
              } catch {
                logOperationalEvent("notification_retry");
              }
              after = scope.workspaceId;
              heartbeatAt = Date.now();
            }
            if (scopes.length < 100 || stopping) {
              after = "00000000-0000-0000-0000-000000000000";
              break;
            }
          }
          notificationCursor = after;
          const backlog = (
            await notifications.query(
              "SELECT * FROM ops.notification_backlog()",
            )
          ).rows[0];
          logOperationalEvent("notification_backlog", {
            count: Number(backlog.due_count),
            durationMs: Math.max(0, backlog.age_ms),
          });
          logOperationalEvent("notification_uncertain", {
            count: Number(backlog.uncertain_count),
          });
          logOperationalEvent("notification_failed", {
            count: Number(backlog.failed_count),
          });
          const dead = await boss.getQueueStats(NOTIFICATION_EMAIL_DEAD_QUEUE);
          logOperationalEvent("notification_dead_letters", {
            count: dead[0]?.totalCount ?? 0,
          });
        }
        await operator.query(
          "SELECT ops.expire_portable_artifacts(),ops.expire_import_staging()",
        );
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
            await purgeDeletionStep(
              operator,
              request.id,
              10000,
              fileStore ?? undefined,
              abort.signal,
            );
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
    await fileTask;
    await boss.stop({ graceful: true });
    await Promise.all([
      queue.end(),
      auth.end(),
      operator.end(),
      notifications?.end(),
      files?.end(),
    ]);
    logOperationalEvent("worker_stopped");
  }
}
void main().catch(() => {
  logOperationalEvent("worker_error");
  process.exitCode = 1;
});
