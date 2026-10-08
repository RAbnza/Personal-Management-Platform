import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { opsSchema } from "./namespaces";
import { workspace, commandReceipt } from "./core";
import { user } from "./auth.generated";
export const exportRun = opsSchema.table(
  "export_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    exportKind: text("export_kind").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    filtersJson: jsonb("filters_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    state: text("state").notNull(),
    snapshotFinancialRevision: bigint("snapshot_financial_revision", {
      mode: "bigint",
    }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    rowCount: bigint("row_count", { mode: "bigint" }).notNull(),
    coverageJson: jsonb("coverage_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_export_run_scope_id").on(t.workspaceId, t.id),
    unique("uq_export_run_receipt").on(t.workspaceId, t.commandReceiptId),
    foreignKey({
      name: "fk_export_run_receipt",
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_export_run_scope_created").on(t.workspaceId, t.createdAt, t.id),
    check(
      "ck_export_run_kind",
      sql`${t.exportKind} IN ('transactions','debts','applications','report')`,
    ),
    check("ck_export_run_version", sql`${t.schemaVersion}>0`),
    check(
      "ck_export_run_completed",
      sql`${t.state}='completed' AND ${t.rowCount} BETWEEN 0 AND 10000 AND ${t.snapshotFinancialRevision}>=0`,
    ),
    check(
      "ck_export_run_manifest",
      sql`jsonb_typeof(${t.filtersJson})='object' AND jsonb_typeof(${t.coverageJson})='object'`,
    ),
  ],
);
