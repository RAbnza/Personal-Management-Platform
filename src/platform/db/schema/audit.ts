import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { commandReceipt, workspace } from "./core";
import { auditSchema } from "./namespaces";

export const privateRevision = auditSchema.table(
  "private_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersion: integer("subject_version").notNull(),
    operation: text("operation").notNull(),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
    reason: text("reason"),
    effectiveDate: date("effective_date", {
      mode: "string",
    }),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_private_revision_scope_id").on(table.workspaceId, table.id),

    unique("uq_private_revision_command_subject").on(
      table.workspaceId,
      table.commandReceiptId,
      table.subjectKind,
      table.subjectId,
      table.subjectVersion,
      table.operation,
    ),

    foreignKey({
      name: "fk_private_revision_command",
      columns: [table.workspaceId, table.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_private_revision_subject").on(
      table.workspaceId,
      table.subjectKind,
      table.subjectId,
      table.subjectVersion,
    ),

    index("ix_private_revision_created").on(
      table.workspaceId,
      table.createdAt.desc(),
      table.id.desc(),
    ),

    check(
      "ck_private_revision_subject_version",
      sql`${table.subjectVersion} > 0`,
    ),
    check(
      "ck_private_revision_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_private_revision_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
    check(
      "ck_private_revision_before_json",
      sql`
        ${table.beforeJson} IS NULL
        OR jsonb_typeof(${table.beforeJson}) = 'object'
      `,
    ),
    check(
      "ck_private_revision_after_json",
      sql`
        ${table.afterJson} IS NULL
        OR jsonb_typeof(${table.afterJson}) = 'object'
      `,
    ),
    check(
      "ck_private_revision_reason",
      sql`
        ${table.reason} IS NULL
        OR char_length(${table.reason}) <= 20000
      `,
    ),
  ],
);

export const privateActivity = auditSchema.table(
  "private_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    revisionId: uuid("revision_id"),
    activityKind: text("activity_kind").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    summaryJson: jsonb("summary_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_private_activity_scope_id").on(table.workspaceId, table.id),

    uniqueIndex("uq_private_activity_revision_kind")
      .on(table.workspaceId, table.revisionId, table.activityKind)
      .where(sql`${table.revisionId} IS NOT NULL`),

    foreignKey({
      name: "fk_private_activity_revision",
      columns: [table.workspaceId, table.revisionId],
      foreignColumns: [privateRevision.workspaceId, privateRevision.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_private_activity_occurred").on(
      table.workspaceId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),

    check(
      "ck_private_activity_summary",
      sql`jsonb_typeof(${table.summaryJson}) = 'object'`,
    ),
  ],
);
