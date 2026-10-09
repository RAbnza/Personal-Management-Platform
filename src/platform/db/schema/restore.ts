import { sql } from "drizzle-orm";
import { check, customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { opsSchema } from "./namespaces";
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
/** Offline recovery authorization, populated by the isolated restore job.
 * No web/auth/queue role can create or read recovery authorizations. */
export const restoreDeletionAuthorization = opsSchema.table(
  "restore_deletion_authorization",
  {
    requestId: uuid("request_id").primaryKey(),
    targetUserId: uuid("target_user_id").notNull(),
    targetWorkspaceId: uuid("target_workspace_id").notNull(),
    registerHash: bytea("register_hash").notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("ck_restore_register_hash", sql`octet_length(${t.registerHash})=32`),
    check(
      "ck_restore_isolated_database",
      sql`current_database() ~ '^pmp_restore_[a-f0-9]{32}$'`,
    ),
  ],
);
