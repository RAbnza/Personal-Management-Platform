import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { financeSchema } from "./namespaces";
import { workspace, commandReceipt } from "./core";
import { user } from "./auth.generated";
import { creditCard } from "./credit-cards";
import { financialAction, actionRevision } from "./finance";
import { cardStatementAllocation } from "./card-commands";
const scope = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspace.id);
const attribution = () => ({
  recordedByUserId: uuid("recorded_by_user_id")
    .notNull()
    .references(() => user.id),
  requestId: uuid("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const cardInstallmentPlan = financeSchema.table(
  "card_installment_plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: scope(),
    cardId: uuid("card_id").notNull(),
    purchaseActionId: uuid("purchase_action_id").notNull(),
    currentRevisionId: uuid("current_revision_id"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_installment_plan_scope").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [creditCard.workspaceId, creditCard.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.purchaseActionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    index("ix_installment_plan_card").on(t.workspaceId, t.cardId, t.id),
    index("ix_installment_plan_purchase").on(t.workspaceId, t.purchaseActionId),
    check("ck_installment_plan_version", sql`${t.version}>0`),
  ],
);
export const cardInstallmentRevision = financeSchema.table(
  "card_installment_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: scope(),
    planId: uuid("plan_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    purchaseActionRevisionId: uuid("purchase_action_revision_id").notNull(),
    principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
    installmentCount: integer("installment_count").notNull(),
    lifecycle: text("lifecycle").notNull(),
    providerReference: text("provider_reference"),
    verificationSource: text("verification_source").notNull(),
    verifiedDate: date("verified_date", { mode: "string" }).notNull(),
    notes: text("notes"),
    reason: text("reason"),
    refundEvidence: jsonb("refund_evidence")
      .$type<Array<{ actionRevisionId: string; amountMinor: string }>>()
      .notNull(),
    state: text("state").default("building").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    ...attribution(),
  },
  (t) => [
    unique("uq_installment_revision_scope").on(t.workspaceId, t.id),
    unique("uq_installment_revision_parent").on(t.workspaceId, t.planId, t.id),
    unique("uq_installment_revision_number").on(
      t.workspaceId,
      t.planId,
      t.revisionNo,
    ),
    unique("uq_installment_revision_command").on(
      t.workspaceId,
      t.commandReceiptId,
    ),
    foreignKey({
      columns: [t.workspaceId, t.planId],
      foreignColumns: [cardInstallmentPlan.workspaceId, cardInstallmentPlan.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.purchaseActionRevisionId],
      foreignColumns: [actionRevision.workspaceId, actionRevision.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_installment_revision_actor").on(t.recordedByUserId),
    check(
      "ck_installment_revision_count",
      sql`${t.installmentCount} BETWEEN 1 AND 360 AND ${t.principalMinor}>0 AND ${t.principalMinor}<=100000000000`,
    ),
    check(
      "ck_installment_revision_lifecycle",
      sql`${t.lifecycle} IN ('active','cancelled')`,
    ),
    check(
      "ck_installment_revision_source",
      sql`char_length(btrim(${t.verificationSource})) BETWEEN 1 AND 2000 AND (${t.providerReference} IS NULL OR char_length(btrim(${t.providerReference})) BETWEEN 1 AND 2000) AND (${t.notes} IS NULL OR char_length(${t.notes})<=20000)`,
    ),
    check(
      "ck_installment_revision_reason",
      sql`(${t.revisionNo}=1 AND ${t.previousRevisionId} IS NULL AND ${t.reason} IS NULL) OR (${t.revisionNo}>1 AND ${t.previousRevisionId} IS NOT NULL AND char_length(btrim(${t.reason})) BETWEEN 1 AND 20000)`,
    ),
    check(
      "ck_installment_revision_state",
      sql`(${t.state}='building' AND ${t.finalizedAt} IS NULL) OR (${t.state}='verified' AND ${t.finalizedAt} IS NOT NULL)`,
    ),
  ],
);
export const cardInstallment = financeSchema.table(
  "card_installment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: scope(),
    planRevisionId: uuid("plan_revision_id").notNull(),
    sequenceNo: integer("sequence_no").notNull(),
    dueDate: date("due_date", { mode: "string" }),
    principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
    interestMinor: bigint("interest_minor", { mode: "bigint" }),
    feeMinor: bigint("fee_minor", { mode: "bigint" }),
    totalMinor: bigint("total_minor", { mode: "bigint" }),
    providerReference: text("provider_reference"),
    notes: text("notes"),
  },
  (t) => [
    unique("uq_card_installment_line").on(
      t.workspaceId,
      t.planRevisionId,
      t.sequenceNo,
    ),
    foreignKey({
      columns: [t.workspaceId, t.planRevisionId],
      foreignColumns: [
        cardInstallmentRevision.workspaceId,
        cardInstallmentRevision.id,
      ],
    }),
    index("ix_card_installment_date").on(t.workspaceId, t.dueDate),
    check(
      "ck_card_installment_amount",
      sql`${t.principalMinor}>=0 AND (${t.interestMinor} IS NULL OR ${t.interestMinor}>=0) AND (${t.feeMinor} IS NULL OR ${t.feeMinor}>=0) AND (${t.totalMinor} IS NULL OR (${t.totalMinor}::numeric>=${t.principalMinor}::numeric+COALESCE(${t.interestMinor},0)::numeric+COALESCE(${t.feeMinor},0)::numeric AND (${t.interestMinor} IS NULL OR ${t.feeMinor} IS NULL OR ${t.totalMinor}::numeric=${t.principalMinor}::numeric+${t.interestMinor}::numeric+${t.feeMinor}::numeric)))`,
    ),
    check("ck_card_installment_line", sql`${t.sequenceNo} BETWEEN 1 AND 360`),
    check(
      "ck_card_installment_text",
      sql`(${t.providerReference} IS NULL OR char_length(btrim(${t.providerReference})) BETWEEN 1 AND 2000) AND (${t.notes} IS NULL OR char_length(${t.notes})<=2000)`,
    ),
  ],
);
export const cardInstallmentApplication = financeSchema.table(
  "card_installment_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: scope(),
    planRevisionId: uuid("plan_revision_id").notNull(),
    installmentNo: integer("installment_no").notNull(),
    allocationId: uuid("allocation_id").notNull(),
    principalMinor: bigint("principal_minor", { mode: "bigint" }).notNull(),
    interestMinor: bigint("interest_minor", { mode: "bigint" }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "bigint" }).notNull(),
    interestActionRevisionId: uuid("interest_action_revision_id"),
    feeActionRevisionId: uuid("fee_action_revision_id"),
    reversesApplicationId: uuid("reverses_application_id"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    confirmationKind: text("confirmation_kind").notNull(),
    confirmationSource: text("confirmation_source").notNull(),
    confirmedDate: date("confirmed_date", { mode: "string" }).notNull(),
    ...attribution(),
  },
  (t) => [
    unique("uq_installment_application_scope").on(t.workspaceId, t.id),
    unique("uq_installment_application_reversal").on(
      t.workspaceId,
      t.reversesApplicationId,
    ),
    unique("uq_installment_application_command").on(
      t.workspaceId,
      t.commandReceiptId,
    ),
    foreignKey({
      columns: [t.workspaceId, t.planRevisionId, t.installmentNo],
      foreignColumns: [
        cardInstallment.workspaceId,
        cardInstallment.planRevisionId,
        cardInstallment.sequenceNo,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.allocationId],
      foreignColumns: [
        cardStatementAllocation.workspaceId,
        cardStatementAllocation.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.interestActionRevisionId],
      foreignColumns: [actionRevision.workspaceId, actionRevision.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.feeActionRevisionId],
      foreignColumns: [actionRevision.workspaceId, actionRevision.id],
    }),
    index("ix_installment_application_allocation").on(
      t.workspaceId,
      t.allocationId,
    ),
    index("ix_installment_application_interest").on(
      t.workspaceId,
      t.interestActionRevisionId,
    ),
    index("ix_installment_application_fee").on(
      t.workspaceId,
      t.feeActionRevisionId,
    ),
    index("ix_installment_application_actor").on(t.recordedByUserId),
    check(
      "ck_installment_application_amount",
      sql`${t.principalMinor}>=0 AND ${t.interestMinor}>=0 AND ${t.feeMinor}>=0 AND ${t.principalMinor}::numeric+${t.interestMinor}::numeric+${t.feeMinor}::numeric>0 AND (${t.interestMinor}=0)=(${t.interestActionRevisionId} IS NULL) AND (${t.feeMinor}=0)=(${t.feeActionRevisionId} IS NULL)`,
    ),
    check(
      "ck_installment_application_confirmation",
      sql`${t.confirmationKind} IN ('provider','user') AND char_length(btrim(${t.confirmationSource})) BETWEEN 1 AND 2000`,
    ),
  ],
);
