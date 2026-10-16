import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  bigint,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { financeSchema } from "./namespaces";
import { workspace } from "./core";
import { ledgerAccount, financialAction, actionRevision } from "./finance";
import { commandReceipt } from "./core";
import { groupParticipant, sharedExpense, expenseRevision } from "./sharing";
import { groupSettlement, sharedRefund } from "./settlements";
const id = () => uuid("id").defaultRandom().primaryKey();
const ws = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspace.id);
export const groupLedgerBinding = financeSchema.table(
  "group_ledger_binding",
  {
    id: id(),
    workspaceId: ws(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    receivableLedgerAccountId: uuid("receivable_ledger_account_id").notNull(),
    payableLedgerAccountId: uuid("payable_ledger_account_id").notNull(),
  },
  (t) => [
    unique("uq_binding_scope").on(t.workspaceId, t.id),
    unique("uq_binding_person").on(t.workspaceId, t.groupId, t.participantId),
    unique("uq_binding_receivable").on(
      t.workspaceId,
      t.receivableLedgerAccountId,
    ),
    unique("uq_binding_payable").on(t.workspaceId, t.payableLedgerAccountId),
    foreignKey({
      name: "fk_binding_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_binding_receivable",
      columns: [t.workspaceId, t.receivableLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    }),
    foreignKey({
      name: "fk_binding_payable",
      columns: [t.workspaceId, t.payableLedgerAccountId],
      foreignColumns: [ledgerAccount.workspaceId, ledgerAccount.id],
    }),
  ],
);
export const privateGroupLink = financeSchema.table(
  "private_group_link",
  {
    id: id(),
    workspaceId: ws(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    expenseId: uuid("expense_id"),
    refundId: uuid("refund_id"),
    settlementId: uuid("settlement_id"),
    purpose: text("purpose").default("bill_adoption").notNull(),
    actionId: uuid("action_id").notNull(),
    currentLinkRevisionId: uuid("current_link_revision_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_private_link_scope").on(t.workspaceId, t.id),
    unique("uq_private_link_source").on(
      t.workspaceId,
      t.groupId,
      t.expenseId,
      t.purpose,
    ),
    unique("uq_private_link_action").on(t.workspaceId, t.actionId),
    unique("uq_private_link_refund").on(
      t.workspaceId,
      t.groupId,
      t.refundId,
      t.purpose,
    ),
    unique("uq_private_link_settlement").on(
      t.workspaceId,
      t.groupId,
      t.settlementId,
      t.purpose,
    ),
    foreignKey({
      name: "fk_private_link_refund",
      columns: [t.groupId, t.refundId],
      foreignColumns: [sharedRefund.groupId, sharedRefund.id],
    }),
    foreignKey({
      name: "fk_private_link_settlement",
      columns: [t.groupId, t.settlementId],
      foreignColumns: [groupSettlement.groupId, groupSettlement.id],
    }),
    foreignKey({
      name: "fk_private_link_participant",
      columns: [t.groupId, t.participantId],
      foreignColumns: [groupParticipant.groupId, groupParticipant.id],
    }),
    foreignKey({
      name: "fk_private_link_expense",
      columns: [t.groupId, t.expenseId],
      foreignColumns: [sharedExpense.groupId, sharedExpense.id],
    }),
    foreignKey({
      name: "fk_private_link_action",
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    check(
      "ck_private_link_purpose",
      sql`(${t.purpose}='bill_adoption' AND ${t.expenseId} IS NOT NULL AND ${t.refundId} IS NULL AND ${t.settlementId} IS NULL) OR (${t.purpose}='refund_adoption' AND ${t.expenseId} IS NULL AND ${t.refundId} IS NOT NULL AND ${t.settlementId} IS NULL) OR (${t.purpose} IN ('settlement_sent','settlement_received') AND ${t.expenseId} IS NULL AND ${t.refundId} IS NULL AND ${t.settlementId} IS NOT NULL)`,
    ),
  ],
);
export const privateGroupLinkRevision = financeSchema.table(
  "private_group_link_revision",
  {
    id: id(),
    workspaceId: ws(),
    linkId: uuid("link_id").notNull(),
    groupId: uuid("group_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    expenseId: uuid("expense_id"),
    sourceExpenseRevisionId: uuid("source_expense_revision_id"),
    sourceRefundId: uuid("source_refund_id"),
    sourceSettlementId: uuid("source_settlement_id"),
    sourceSettlementVersion: integer("source_settlement_version"),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousLinkRevisionId: uuid("previous_link_revision_id"),
    acceptedSourceHash: text("accepted_source_hash").notNull(),
    adoptionKind: text("adoption_kind").notNull(),
    paidMinor: bigint("paid_minor", { mode: "bigint" }).notNull(),
    shareMinor: bigint("share_minor", { mode: "bigint" }).notNull(),
    consentJson: jsonb("consent_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_private_link_revision_scope").on(t.workspaceId, t.id),
    unique("uq_private_link_revision_no").on(
      t.workspaceId,
      t.linkId,
      t.revisionNo,
    ),
    unique("uq_private_link_revision_identity").on(
      t.workspaceId,
      t.linkId,
      t.id,
    ),
    unique("uq_private_link_action_revision").on(
      t.workspaceId,
      t.actionRevisionId,
    ),
    foreignKey({
      name: "fk_private_revision_refund",
      columns: [t.groupId, t.sourceRefundId],
      foreignColumns: [sharedRefund.groupId, sharedRefund.id],
    }),
    foreignKey({
      name: "fk_private_revision_settlement",
      columns: [t.groupId, t.sourceSettlementId],
      foreignColumns: [groupSettlement.groupId, groupSettlement.id],
    }),
    foreignKey({
      name: "fk_private_revision_link",
      columns: [t.workspaceId, t.linkId],
      foreignColumns: [privateGroupLink.workspaceId, privateGroupLink.id],
    }),
    foreignKey({
      name: "fk_private_revision_source",
      columns: [t.groupId, t.expenseId, t.sourceExpenseRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_private_revision_action",
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    }),
    check(
      "ck_private_revision_shape",
      sql`${t.paidMinor}>=0 AND ${t.shareMinor}>=0 AND ${t.acceptedSourceHash} ~ '^[a-f0-9]{64}$' AND ${t.adoptionKind} IN ('new_posting','existing_action_reclassification','clearing_resolution') AND ((${t.expenseId} IS NOT NULL AND ${t.sourceExpenseRevisionId} IS NOT NULL AND ${t.sourceRefundId} IS NULL AND ${t.sourceSettlementId} IS NULL AND ${t.sourceSettlementVersion} IS NULL) OR (${t.expenseId} IS NULL AND ${t.sourceExpenseRevisionId} IS NULL AND ${t.sourceRefundId} IS NOT NULL AND ${t.sourceSettlementId} IS NULL AND ${t.sourceSettlementVersion} IS NULL) OR (${t.expenseId} IS NULL AND ${t.sourceExpenseRevisionId} IS NULL AND ${t.sourceRefundId} IS NULL AND ${t.sourceSettlementId} IS NOT NULL AND ${t.sourceSettlementVersion} IS NOT NULL AND ${t.sourceSettlementVersion}>0)) AND ((${t.revisionNo}=1 AND ${t.previousLinkRevisionId} IS NULL) OR (${t.revisionNo}>1 AND ${t.previousLinkRevisionId} IS NOT NULL))`,
    ),
  ],
);

export const privateGroupReview = financeSchema.table(
  "private_group_review",
  {
    id: id(),
    workspaceId: ws(),
    linkId: uuid("link_id").notNull(),
    acceptedLinkRevisionId: uuid("accepted_link_revision_id").notNull(),
    sourceHash: text("source_hash").notNull(),
    reviewedSourceJson: jsonb("reviewed_source_json").notNull(),
    decision: text("decision").default("retain_private_evidence").notNull(),
    reason: text("reason").notNull(),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_group_review_scope").on(t.workspaceId, t.id),
    unique("uq_group_review_receipt").on(t.workspaceId, t.commandReceiptId),
    foreignKey({
      name: "fk_group_review_link",
      columns: [t.workspaceId, t.linkId, t.acceptedLinkRevisionId],
      foreignColumns: [
        privateGroupLinkRevision.workspaceId,
        privateGroupLinkRevision.linkId,
        privateGroupLinkRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_group_review_receipt",
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    check(
      "ck_group_review_shape",
      sql`${t.sourceHash} ~ '^[a-f0-9]{64}$' AND ${t.decision}='retain_private_evidence' AND length(btrim(${t.reason})) BETWEEN 1 AND 2000 AND jsonb_typeof(${t.reviewedSourceJson})='object'`,
    ),
  ],
);
