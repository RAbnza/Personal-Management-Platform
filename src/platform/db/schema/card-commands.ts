import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { commandReceipt, workspace } from "./core";
import {
  actionRevision,
  financialAction,
  financialAccount,
  posting,
} from "./finance";
import { creditCard } from "./credit-cards";
import { cardStatementRevision } from "./card-statements";
import { financeSchema } from "./namespaces";

export const cardActionDetail = financeSchema.table(
  "card_action_detail",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    cardId: uuid("card_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    postingDate: date("posting_date", { mode: "string" }).notNull(),
    providerReference: text("provider_reference"),
    confirmationSource: text("confirmation_source").notNull(),
    payingAccountId: uuid("paying_account_id"),
    purchaseActionId: uuid("purchase_action_id"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.actionRevisionId] }),
    unique("uq_card_action_detail_parent").on(
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
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [creditCard.workspaceId, creditCard.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.payingAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.purchaseActionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    index("ix_card_action_card").on(t.workspaceId, t.cardId, t.postingDate),
    index("ix_card_action_purchase").on(t.workspaceId, t.purchaseActionId),
    check(
      "ck_card_action_amount",
      sql`${t.amountMinor}>0 AND ${t.amountMinor}<=100000000000`,
    ),
    check(
      "ck_card_action_confirmation",
      sql`char_length(btrim(${t.confirmationSource})) BETWEEN 1 AND 2000`,
    ),
    check(
      "ck_card_action_reference",
      sql`${t.providerReference} IS NULL OR char_length(btrim(${t.providerReference})) BETWEEN 1 AND 2000`,
    ),
  ],
);
export const cardRefundPart = financeSchema.table(
  "card_refund_part",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    originalPurchasePostingId: uuid("original_purchase_posting_id").notNull(),
    refundPostingId: uuid("refund_posting_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  },
  (t) => [
    unique("uq_card_refund_source").on(
      t.workspaceId,
      t.actionRevisionId,
      t.originalPurchasePostingId,
    ),
    unique("uq_card_refund_posting").on(t.workspaceId, t.refundPostingId),
    foreignKey({
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        cardActionDetail.workspaceId,
        cardActionDetail.actionId,
        cardActionDetail.actionRevisionId,
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
    index("ix_card_refund_source").on(
      t.workspaceId,
      t.originalPurchasePostingId,
    ),
    check(
      "ck_card_refund_part_amount",
      sql`${t.amountMinor}>0 AND ${t.amountMinor}<=100000000000`,
    ),
  ],
);
/** Immutable allocation/reversal commands. Superseded source/snapshot revisions are ineligible. */
export const cardStatementAllocation = financeSchema.table(
  "card_statement_allocation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    statementRevisionId: uuid("statement_revision_id").notNull(),
    sourceActionRevisionId: uuid("source_action_revision_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    reversesAllocationId: uuid("reverses_allocation_id"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    confirmationKind: text("confirmation_kind").notNull(),
    confirmationSource: text("confirmation_source").notNull(),
    confirmedDate: date("confirmed_date", { mode: "string" }).notNull(),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => user.id),
    requestId: uuid("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_card_allocation_scope").on(t.workspaceId, t.id),
    unique("uq_card_allocation_reversal").on(
      t.workspaceId,
      t.reversesAllocationId,
    ),
    unique("uq_card_allocation_command").on(t.workspaceId, t.commandReceiptId),
    foreignKey({
      columns: [t.workspaceId, t.statementRevisionId],
      foreignColumns: [
        cardStatementRevision.workspaceId,
        cardStatementRevision.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.sourceActionRevisionId],
      foreignColumns: [actionRevision.workspaceId, actionRevision.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_card_allocation_source").on(
      t.workspaceId,
      t.sourceActionRevisionId,
    ),
    index("ix_card_allocation_statement").on(
      t.workspaceId,
      t.statementRevisionId,
    ),
    index("ix_card_allocation_actor").on(t.recordedByUserId),
    check(
      "ck_card_allocation_amount",
      sql`${t.amountMinor}>0 AND ${t.amountMinor}<=100000000000`,
    ),
    check(
      "ck_card_allocation_confirmation",
      sql`${t.confirmationKind} IN ('provider','user') AND char_length(btrim(${t.confirmationSource})) BETWEEN 1 AND 2000`,
    ),
  ],
);
