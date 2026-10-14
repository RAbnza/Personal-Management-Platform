import { PgBoss, type Db } from "pg-boss";
import type { Pool, PoolClient, Client } from "pg";

export const SECURITY_EMAIL_QUEUE = "v1-security-email";
export const SECURITY_EMAIL_DEAD_QUEUE = "v1-security-email-dead";
export const NOTIFICATION_EMAIL_QUEUE = "v2-notification-email";
export const NOTIFICATION_EMAIL_DEAD_QUEUE = "v2-notification-email-dead";
export function createRuntimeBoss(
  database: Pick<Pool | PoolClient | Client, "query">,
) {
  return createRuntimeBossWithDatabase({
    executeSql: (text, values) => database.query(text, values),
  });
}
export function createRuntimeBossWithDatabase(database: Db) {
  return new PgBoss({
    db: database,
    schema: "pgboss",
    migrate: false,
    supervise: false,
    schedule: false,
    registerInstance: false,
    reindex: false,
    monitorVacuum: false,
    persistWarnings: false,
    persistQueueStats: false,
  });
}
