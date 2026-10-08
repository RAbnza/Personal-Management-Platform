import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authSchema, user, session } from "./auth.generated";
import { workspace } from "./core";
import { opsSchema } from "./namespaces";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
// App-managed proof is deliberately separate from library-owned generated schema.
export const sessionAssurance = authSchema.table(
  "session_assurance",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    method: text("method").notNull(),
  },
  (t) => [check("ck_session_assurance_method", sql`${t.method}='password'`)],
);

export const deletionRequest = opsSchema.table(
  "deletion_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").references(() => workspace.id, {
      onDelete: "restrict",
    }),
    targetUserId: uuid("target_user_id").notNull(),
    targetWorkspaceId: uuid("target_workspace_id").notNull(),
    clientCommandId: uuid("client_command_id").notNull(),
    payloadHash: bytea("payload_hash").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),
    state: text("state").default("pending").notNull(),
    scopeManifest: jsonb("scope_manifest")
      .$type<Record<string, unknown>>()
      .notNull(),
    scopeHash: bytea("scope_hash").notNull(),
    progressJson: jsonb("progress_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
  },
  (t) => [
    unique("uq_deletion_command").on(t.targetUserId, t.clientCommandId),
    uniqueIndex("uq_deletion_active_user")
      .on(t.targetUserId)
      .where(sql`${t.state} IN ('pending','purging','failed')`),
    index("ix_deletion_due").on(t.state, t.purgeAfter, t.id),
    check(
      "ck_deletion_state",
      sql`${t.state} IN ('pending','cancelled','purging','completed','failed')`,
    ),
    check(
      "ck_deletion_times",
      sql`${t.purgeAfter}>=${t.requestedAt} AND ((${t.state}='completed')=(${t.completedAt} IS NOT NULL))`,
    ),
    check(
      "ck_deletion_hash",
      sql`octet_length(${t.scopeHash})=32 AND octet_length(${t.payloadHash})=32`,
    ),
    check(
      "ck_deletion_json",
      sql`jsonb_typeof(${t.scopeManifest})='object' AND jsonb_typeof(${t.progressJson})='object'`,
    ),
    check(
      "ck_deletion_links",
      sql`(${t.state} IN ('completed','cancelled') AND ${t.userId} IS NULL AND ${t.workspaceId} IS NULL) OR (${t.state}<>'completed' AND ${t.userId}=${t.targetUserId} AND ${t.workspaceId}=${t.targetWorkspaceId} AND ${t.userId} IS NOT NULL AND ${t.workspaceId} IS NOT NULL)`,
    ),
  ],
);

export const deletionTombstone = opsSchema.table(
  "deletion_tombstone",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetUserId: uuid("target_user_id").notNull(),
    targetWorkspaceId: uuid("target_workspace_id").notNull(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => deletionRequest.id, { onDelete: "restrict" }),
    purgedAt: timestamp("purged_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    registerExportedAt: timestamp("register_exported_at", {
      withTimezone: true,
    }),
  },
  (t) => [
    unique("uq_deletion_tombstone_target").on(
      t.targetUserId,
      t.targetWorkspaceId,
    ),
    index("ix_tombstone_expiry").on(t.expiresAt),
    check("ck_tombstone_expiry", sql`${t.expiresAt}>=${t.purgedAt}`),
  ],
);
