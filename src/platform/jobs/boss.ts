import { PgBoss } from "pg-boss";
import type { Pool, PoolClient, Client } from "pg";

export const SECURITY_EMAIL_QUEUE = "v1-security-email";
export const SECURITY_EMAIL_DEAD_QUEUE = "v1-security-email-dead";
export function createRuntimeBoss(
  database: Pick<Pool | PoolClient | Client, "query">,
) {
  return new PgBoss({
    db: { executeSql: (text, values) => database.query(text, values) },
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
