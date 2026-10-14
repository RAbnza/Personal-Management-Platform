import { loadEnvFile } from "node:process";
import { PgBoss } from "pg-boss";
import { Client } from "pg";
import {
  SECURITY_EMAIL_QUEUE,
  SECURITY_EMAIL_DEAD_QUEUE,
  NOTIFICATION_EMAIL_QUEUE,
  NOTIFICATION_EMAIL_DEAD_QUEUE,
} from "../../src/platform/jobs/boss";

export async function migrateJobStorage(connectionString: string) {
  if (new URL(connectionString).username !== "migration_owner")
    throw new Error("Job deployment requires migration_owner.");
  const client = new Client({
    connectionString,
    application_name: "pmp-job-deployment",
  });
  await client.connect();
  const boss = new PgBoss({
    db: { executeSql: (text, values) => client.query(text, values) },
    schema: "pgboss",
    supervise: false,
    schedule: false,
    registerInstance: false,
    reindex: false,
  });
  boss.on("error", () => {});
  try {
    await boss.start();
    await boss.createQueue(SECURITY_EMAIL_DEAD_QUEUE, {
      retentionSeconds: 7 * 86400,
    });
    await boss.createQueue(SECURITY_EMAIL_QUEUE, {
      retryLimit: 6,
      retryDelay: 15,
      retryBackoff: true,
      expireInSeconds: 120,
      retentionSeconds: 7 * 86400,
      deadLetter: SECURITY_EMAIL_DEAD_QUEUE,
    });
    await boss.createQueue(NOTIFICATION_EMAIL_DEAD_QUEUE, {
      retentionSeconds: 7 * 86400,
    });
    await boss.createQueue(NOTIFICATION_EMAIL_QUEUE, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 120,
      retentionSeconds: 7 * 86400,
      deadLetter: NOTIFICATION_EMAIL_DEAD_QUEUE,
    });
    await client.query(`REVOKE ALL ON SCHEMA pgboss FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
      GRANT USAGE ON SCHEMA pgboss TO auth_adapter,queue_broker;
      REVOKE ALL ON ALL TABLES IN SCHEMA pgboss FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
      GRANT SELECT ON pgboss.version,pgboss.queue TO auth_adapter;
      GRANT INSERT,SELECT(id) ON pgboss.job,pgboss.job_common TO auth_adapter;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA pgboss TO queue_broker;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pgboss FROM PUBLIC;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO auth_adapter,queue_broker;`);
    await client.query(`GRANT USAGE ON SCHEMA pgboss TO worker_domain;
      GRANT SELECT ON pgboss.version,pgboss.queue TO worker_domain;
      GRANT INSERT,SELECT(id) ON pgboss.job,pgboss.job_common TO worker_domain;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO worker_domain;`);
  } finally {
    await boss.stop({ graceful: true });
    await client.end();
  }
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/jobs/migrate.ts")
) {
  async function main() {
    loadEnvFile(
      process.argv.includes("--test") ? ".env.test" : ".env.migration",
    );
    await migrateJobStorage(process.env.DATABASE_MIGRATION_URL ?? "");
    console.log(
      "Pinned pg-boss schema and restricted runtime grants verified.",
    );
  }
  void main().catch(() => {
    console.error(
      "Job deployment failed. No credentials or SQL details are logged.",
    );
    process.exitCode = 1;
  });
}
