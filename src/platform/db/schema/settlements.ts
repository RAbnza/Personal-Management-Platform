import { sql } from "drizzle-orm";
import {
  uuid,
  text,
  integer,
  timestamp,
  date,
  bigint,
  unique,
  foreignKey,
  check,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sharingSchema } from "./namespaces";
import {
  expenseGroup,
  groupParticipant,
  groupCommandReceipt,
  sharedExpense,
  expenseRevision,
} from "./sharing";

const id = () => uuid("id").defaultRandom().primaryKey();
const group = () =>
  uuid("group_id")
    .notNull()
    .references(() => expenseGroup.id);
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const person = (name: string, g: AnyPgColumn, p: AnyPgColumn) =>
  foreignKey({
    name,
    columns: [g, p],
    foreignColumns: [groupParticipant.groupId, groupParticipant.id],
  });

export const groupSettlement = sharingSchema.table(
  "settlement",
  {
    id: id(),
    groupId: group(),
    senderId: uuid("sender_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    reportedBy: uuid("reported_by").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    advanceMinor: bigint("advance_minor", { mode: "bigint" }).notNull(),
    mode: text("mode").notNull(),
    paymentDate: date("payment_date").notNull(),
    note: text("note"),
    state: text("state").default("pending").notNull(),
    version: integer("version").default(1).notNull(),
    originalReceiptId: uuid("original_receipt_id").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_settlement_scope").on(t.groupId, t.id),
    unique("uq_settlement_receipt").on(t.groupId, t.originalReceiptId),
    person("fk_settlement_sender", t.groupId, t.senderId),
    person("fk_settlement_recipient", t.groupId, t.recipientId),
    person("fk_settlement_reporter", t.groupId, t.reportedBy),
    foreignKey({
      name: "fk_settlement_receipt",
      columns: [t.groupId, t.originalReceiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
    check(
      "ck_settlement_shape",
      sql`${t.senderId}<>${t.recipientId} AND ${t.amountMinor}>0 AND ${t.advanceMinor}>=0 AND ${t.advanceMinor}<=${t.amountMinor} AND ${t.mode} IN ('full','custom','selected') AND ${t.state} IN ('pending','disputed','confirmed','cancelled','reversed') AND ${t.version}>0 AND length(coalesce(${t.note},''))<=2000`,
    ),
    index("ix_settlement_state").on(t.groupId, t.state, t.createdAt),
  ],
);
export const settlementAllocation = sharingSchema.table(
  "settlement_allocation",
  {
    id: id(),
    groupId: group(),
    settlementId: uuid("settlement_id").notNull(),
    expenseId: uuid("expense_id").notNull(),
    sourceRevisionId: uuid("source_revision_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  },
  (t) => [
    unique("uq_settlement_allocation_bill").on(
      t.groupId,
      t.settlementId,
      t.expenseId,
    ),
    foreignKey({
      name: "fk_settlement_allocation_parent",
      columns: [t.groupId, t.settlementId],
      foreignColumns: [groupSettlement.groupId, groupSettlement.id],
    }),
    foreignKey({
      name: "fk_settlement_allocation_source",
      columns: [t.groupId, t.expenseId, t.sourceRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    check("ck_settlement_allocation_amount", sql`${t.amountMinor}>0`),
  ],
);
export const settlementEvent = sharingSchema.table(
  "settlement_event",
  {
    id: id(),
    groupId: group(),
    settlementId: uuid("settlement_id").notNull(),
    version: integer("version").notNull(),
    actorId: uuid("actor_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    confirmationType: text("confirmation_type").notNull(),
    reason: text("reason").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_settlement_event_version").on(
      t.groupId,
      t.settlementId,
      t.version,
    ),
    unique("uq_settlement_event_receipt").on(t.groupId, t.receiptId),
    foreignKey({
      name: "fk_settlement_event_parent",
      columns: [t.groupId, t.settlementId],
      foreignColumns: [groupSettlement.groupId, groupSettlement.id],
    }),
    foreignKey({
      name: "fk_settlement_event_receipt",
      columns: [t.groupId, t.receiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
    person("fk_settlement_event_actor", t.groupId, t.actorId),
    check(
      "ck_settlement_event_shape",
      sql`${t.version}>0 AND ${t.toState} IN ('pending','disputed','confirmed','cancelled','reversed') AND ${t.confirmationType} IN ('reported','recipient_authenticated','manual_entry','participant_transition') AND length(btrim(${t.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);
export const sharedRefund = sharingSchema.table(
  "refund",
  {
    id: id(),
    groupId: group(),
    expenseId: uuid("expense_id").notNull(),
    sourceRevisionId: uuid("source_revision_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    refundDate: date("refund_date").notNull(),
    reason: text("reason").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("uq_shared_refund_scope").on(t.groupId, t.id),
    unique("uq_shared_refund_receipt").on(t.groupId, t.receiptId),
    foreignKey({
      name: "fk_shared_refund_expense",
      columns: [t.groupId, t.expenseId],
      foreignColumns: [sharedExpense.groupId, sharedExpense.id],
    }),
    foreignKey({
      name: "fk_shared_refund_revision",
      columns: [t.groupId, t.expenseId, t.sourceRevisionId],
      foreignColumns: [
        expenseRevision.groupId,
        expenseRevision.expenseId,
        expenseRevision.id,
      ],
    }),
    foreignKey({
      name: "fk_shared_refund_receipt",
      columns: [t.groupId, t.receiptId],
      foreignColumns: [groupCommandReceipt.groupId, groupCommandReceipt.id],
    }),
    person("fk_shared_refund_actor", t.groupId, t.actorId),
    check(
      "ck_shared_refund_shape",
      sql`${t.totalMinor}>0 AND length(btrim(${t.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);
export const sharedRefundAllocation = sharingSchema.table(
  "refund_allocation",
  {
    id: id(),
    groupId: group(),
    refundId: uuid("refund_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    axis: text("axis").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  },
  (t) => [
    unique("uq_refund_allocation_person").on(
      t.groupId,
      t.refundId,
      t.axis,
      t.participantId,
    ),
    foreignKey({
      name: "fk_refund_allocation_parent",
      columns: [t.groupId, t.refundId],
      foreignColumns: [sharedRefund.groupId, sharedRefund.id],
    }),
    person("fk_refund_allocation_person", t.groupId, t.participantId),
    check(
      "ck_refund_allocation_shape",
      sql`${t.axis} IN ('received','share_credit') AND ${t.amountMinor}>0`,
    ),
  ],
);
