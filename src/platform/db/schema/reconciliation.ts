import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user as authUser } from "./auth.generated";
import { commandReceipt, workspace } from "./core";
import { actionRevision, financialAccount, financialAction } from "./finance";
import { financeSchema } from "./namespaces";

// Immutable comparisons. Status is derived from current, immutable ledger
// sources; it is never a mutable "verified" flag that a later write can miss.
export const reconciliation = financeSchema.table(
  "reconciliation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    cutoffDate: date("cutoff_date").notNull(),
    observedMinor: bigint("observed_minor", { mode: "bigint" }).notNull(),
    calculatedMinor: bigint("calculated_minor", { mode: "bigint" }).notNull(),
    financialRevision: bigint("financial_revision", {
      mode: "bigint",
    }).notNull(),
    sourceJournalCount: bigint("source_journal_count", {
      mode: "bigint",
    }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    supersedesReconciliationId: uuid("supersedes_reconciliation_id"),
    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      { onDelete: "restrict", onUpdate: "restrict" },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_reconciliation_scope_id").on(t.workspaceId, t.id),
    unique("uq_reconciliation_account_id").on(
      t.workspaceId,
      t.financialAccountId,
      t.id,
    ),
    unique("uq_reconciliation_command").on(t.workspaceId, t.commandReceiptId),
    unique("uq_reconciliation_successor").on(
      t.workspaceId,
      t.supersedesReconciliationId,
    ),
    foreignKey({
      name: "fk_reconciliation_account",
      columns: [t.workspaceId, t.financialAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reconciliation_command",
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    // The same-account predecessor FK is installed by reviewed integrity SQL.
    index("ix_reconciliation_account_cutoff").on(
      t.workspaceId,
      t.financialAccountId,
      t.cutoffDate.desc(),
      t.id.desc(),
    ),
    check(
      "ck_reconciliation_source",
      sql`${t.financialRevision} >= 0 AND ${t.sourceJournalCount} >= 0`,
    ),
    check(
      "ck_reconciliation_actor",
      sql`${t.actorKind} IN ('user','system','import') AND (${t.actorKind} <> 'user' OR ${t.recordedByUserId} IS NOT NULL)`,
    ),
    check(
      "ck_reconciliation_text",
      sql`(${t.reference} IS NULL OR char_length(${t.reference}) <= 2000) AND (${t.notes} IS NULL OR char_length(${t.notes}) <= 20000)`,
    ),
    check(
      "ck_reconciliation_predecessor",
      sql`${t.supersedesReconciliationId} IS NULL OR ${t.supersedesReconciliationId} <> ${t.id}`,
    ),
  ],
);

export const adjustmentDetail = financeSchema.table(
  "adjustment_detail",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    financialAccountId: uuid("financial_account_id").notNull(),
    signedAdjustmentMinor: bigint("signed_adjustment_minor", {
      mode: "bigint",
    }).notNull(),
    reason: text("reason").notNull(),
    reconciliationId: uuid("reconciliation_id"),
  },
  (t) => [
    unique("uq_adjustment_scope_id").on(t.workspaceId, t.id),
    unique("uq_adjustment_revision").on(t.workspaceId, t.actionRevisionId),
    foreignKey({
      name: "fk_adjustment_account",
      columns: [t.workspaceId, t.financialAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_adjustment_action",
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_adjustment_revision",
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_adjustment_reconciliation",
      columns: [t.workspaceId, t.financialAccountId, t.reconciliationId],
      foreignColumns: [
        reconciliation.workspaceId,
        reconciliation.financialAccountId,
        reconciliation.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_adjustment_reconciliation").on(t.workspaceId, t.reconciliationId),
    check(
      "ck_adjustment_amount",
      sql`${t.signedAdjustmentMinor} <> 0 AND abs(${t.signedAdjustmentMinor}::numeric) <= 100000000000`,
    ),
    check(
      "ck_adjustment_reason",
      sql`char_length(btrim(${t.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);
