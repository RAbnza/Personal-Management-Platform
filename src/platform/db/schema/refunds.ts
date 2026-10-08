import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./core";
import {
  actionRevision,
  financialAction,
  ledgerAccount,
  posting,
} from "./finance";
import { financeSchema } from "./namespaces";
export const refundDetail = financeSchema.table(
  "refund_detail",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    purchaseActionId: uuid("purchase_action_id").notNull(),
    refundMinor: bigint("refund_minor", { mode: "bigint" }).notNull(),
    destinationLedgerAccountId: uuid("destination_ledger_account_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.actionRevisionId] }),
    index("ix_refund_purchase").on(t.workspaceId, t.purchaseActionId),
    index("ix_refund_destination").on(
      t.workspaceId,
      t.destinationLedgerAccountId,
    ),
    unique("uq_refund_revision_action").on(
      t.workspaceId,
      t.actionId,
      t.actionRevisionId,
    ),
    foreignKey({
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.purchaseActionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.destinationLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    }),
    check(
      "ck_refund_amount",
      sql`${t.refundMinor}>0 AND ${t.refundMinor}<=100000000000`,
    ),
  ],
);
export const refundAllocation = financeSchema.table(
  "refund_allocation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    originalPurchasePostingId: uuid("original_purchase_posting_id").notNull(),
    refundPostingId: uuid("refund_posting_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    allocationKind: text("allocation_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_refund_allocation_scope").on(t.workspaceId, t.id),
    index("ix_refund_original_posting").on(
      t.workspaceId,
      t.originalPurchasePostingId,
    ),
    unique("uq_refund_allocation_posting").on(t.workspaceId, t.refundPostingId),
    foreignKey({
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        refundDetail.workspaceId,
        refundDetail.actionId,
        refundDetail.actionRevisionId,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.originalPurchasePostingId],
      foreignColumns: [posting.workspaceId, posting.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actionRevisionId, t.refundPostingId],
      foreignColumns: [
        posting.workspaceId,
        posting.actionRevisionId,
        posting.id,
      ],
    }),
    check(
      "ck_refund_allocation",
      sql`${t.amountMinor}>0 AND ${t.amountMinor}<=100000000000 AND ${t.allocationKind} IN ('purchase','fee')`,
    ),
  ],
);
