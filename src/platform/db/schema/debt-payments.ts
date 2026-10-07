import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user as authUser } from "./auth.generated";
import { workspace } from "./core";
import {
  actionRevision,
  debt,
  debtScheduleVersion,
  feeComponent,
  financialAccount,
  financialAction,
  posting,
  scheduledInstallment,
} from "./finance";
import { financeSchema } from "./namespaces";

// Accounting components and contractual satisfaction are independent evidence.
// Lifecycle, aggregate totals, and workspace serialization are installed by the
// reviewed D8a security/integrity migration.

export const debtPayment = financeSchema.table(
  "debt_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    debtId: uuid("debt_id").notNull(),
    actionId: uuid("action_id").notNull(),
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
    unique("uq_debt_payment_scope_id").on(t.workspaceId, t.id),
    unique("uq_debt_payment_action").on(t.workspaceId, t.actionId),
    unique("uq_debt_payment_debt_id").on(t.workspaceId, t.debtId, t.id),
    unique("uq_debt_payment_identity").on(t.workspaceId, t.id, t.actionId),
    foreignKey({
      name: "fk_debt_payment_debt",
      columns: [t.workspaceId, t.debtId],
      foreignColumns: [debt.workspaceId, debt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_debt_payment_action",
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    check(
      "ck_debt_payment_actor_kind",
      sql`${t.actorKind} IN ('user','system','import')`,
    ),
    check(
      "ck_debt_payment_actor_user",
      sql`${t.actorKind} <> 'user' OR ${t.recordedByUserId} IS NOT NULL`,
    ),
  ],
);

export const debtPaymentRevision = financeSchema.table(
  "debt_payment_revision",
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
    paymentId: uuid("payment_id").notNull(),
    debtId: uuid("debt_id").notNull(),
    paidAgainstScheduleVersionId: uuid(
      "paid_against_schedule_version_id",
    ).notNull(),
    payingAccountId: uuid("paying_account_id").notNull(),
    actualPaidMinor: bigint("actual_paid_minor", { mode: "bigint" }).notNull(),
    contractualMinor: bigint("contractual_minor", { mode: "bigint" }).notNull(),
    externalFeeMinor: bigint("external_fee_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    unappliedContractualMinor: bigint("unapplied_contractual_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    allocationCertainty: text("allocation_certainty").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_debt_payment_revision_scope_id").on(t.workspaceId, t.id),
    unique("uq_debt_payment_revision_revision").on(
      t.workspaceId,
      t.actionRevisionId,
    ),
    unique("uq_debt_payment_revision_debt_id").on(
      t.workspaceId,
      t.debtId,
      t.id,
    ),
    unique("uq_debt_payment_revision_payment_id").on(
      t.workspaceId,
      t.debtId,
      t.paymentId,
      t.id,
    ),
    foreignKey({
      name: "fk_debt_payment_revision_action_revision",
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
      name: "fk_debt_payment_revision_payment",
      columns: [t.workspaceId, t.debtId, t.paymentId],
      foreignColumns: [
        debtPayment.workspaceId,
        debtPayment.debtId,
        debtPayment.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_debt_payment_revision_payment_action",
      columns: [t.workspaceId, t.paymentId, t.actionId],
      foreignColumns: [
        debtPayment.workspaceId,
        debtPayment.id,
        debtPayment.actionId,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_debt_payment_revision_schedule",
      columns: [t.workspaceId, t.debtId, t.paidAgainstScheduleVersionId],
      foreignColumns: [
        debtScheduleVersion.workspaceId,
        debtScheduleVersion.debtId,
        debtScheduleVersion.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_debt_payment_revision_account",
      columns: [t.workspaceId, t.payingAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_debt_payment_revision_payment").on(t.workspaceId, t.paymentId),
    index("ix_debt_payment_revision_schedule").on(
      t.workspaceId,
      t.debtId,
      t.paidAgainstScheduleVersionId,
    ),
    index("ix_debt_payment_revision_account").on(
      t.workspaceId,
      t.payingAccountId,
    ),
    check(
      "ck_debt_payment_revision_amounts",
      sql`${t.actualPaidMinor} > 0 AND ${t.actualPaidMinor} <= 100000000000 AND ${t.contractualMinor} >= 0 AND ${t.externalFeeMinor} >= 0 AND ${t.unappliedContractualMinor} >= 0 AND ${t.unappliedContractualMinor} <= ${t.contractualMinor} AND ${t.actualPaidMinor}::numeric = ${t.contractualMinor}::numeric + ${t.externalFeeMinor}::numeric`,
    ),
    check(
      "ck_debt_payment_revision_certainty",
      sql`${t.allocationCertainty} IN ('confirmed_total','known_components','unresolved')`,
    ),
  ],
);

export const paymentComponent = financeSchema.table(
  "payment_component",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    debtId: uuid("debt_id").notNull(),
    paymentRevisionId: uuid("payment_revision_id").notNull(),
    postingId: uuid("posting_id").notNull(),
    disposition: text("disposition").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    feeComponentId: uuid("fee_component_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_payment_component_scope_id").on(t.workspaceId, t.id),
    unique("uq_payment_component_posting").on(
      t.workspaceId,
      t.paymentRevisionId,
      t.postingId,
    ),
    unique("uq_payment_component_debt_id").on(t.workspaceId, t.debtId, t.id),
    foreignKey({
      name: "fk_payment_component_payment_revision",
      columns: [t.workspaceId, t.debtId, t.paymentRevisionId],
      foreignColumns: [
        debtPaymentRevision.workspaceId,
        debtPaymentRevision.debtId,
        debtPaymentRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_payment_component_posting",
      columns: [t.workspaceId, t.postingId],
      foreignColumns: [posting.workspaceId, posting.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_payment_component_fee",
      columns: [t.workspaceId, t.feeComponentId],
      foreignColumns: [feeComponent.workspaceId, feeComponent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_payment_component_posting").on(t.workspaceId, t.postingId),
    index("ix_payment_component_fee").on(t.workspaceId, t.feeComponentId),
    check(
      "ck_payment_component_amount",
      sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 100000000000`,
    ),
    check(
      "ck_payment_component_disposition",
      sql`${t.disposition} IN ('liability_reduction','new_interest','new_fee','new_penalty','clearing','advance','external_fee')`,
    ),
  ],
);

export const paymentDueAllocation = financeSchema.table(
  "payment_due_allocation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    debtId: uuid("debt_id").notNull(),
    paymentRevisionId: uuid("payment_revision_id").notNull(),
    scheduleVersionId: uuid("schedule_version_id").notNull(),
    installmentId: uuid("installment_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_payment_due_allocation_scope_id").on(t.workspaceId, t.id),
    unique("uq_payment_due_allocation_installment").on(
      t.workspaceId,
      t.paymentRevisionId,
      t.installmentId,
    ),
    unique("uq_payment_due_allocation_debt_id").on(
      t.workspaceId,
      t.debtId,
      t.id,
    ),
    unique("uq_payment_due_allocation_source").on(
      t.workspaceId,
      t.debtId,
      t.paymentRevisionId,
      t.id,
    ),
    foreignKey({
      name: "fk_payment_due_allocation_payment_revision",
      columns: [t.workspaceId, t.debtId, t.paymentRevisionId],
      foreignColumns: [
        debtPaymentRevision.workspaceId,
        debtPaymentRevision.debtId,
        debtPaymentRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_payment_due_allocation_installment",
      columns: [t.workspaceId, t.debtId, t.scheduleVersionId, t.installmentId],
      foreignColumns: [
        scheduledInstallment.workspaceId,
        scheduledInstallment.debtId,
        scheduledInstallment.scheduleVersionId,
        scheduledInstallment.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_payment_due_allocation_installment").on(
      t.workspaceId,
      t.installmentId,
      t.paymentRevisionId,
    ),
    index("ix_payment_due_allocation_schedule").on(
      t.workspaceId,
      t.debtId,
      t.scheduleVersionId,
      t.installmentId,
    ),
    check(
      "ck_payment_due_allocation_amount",
      sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 100000000000`,
    ),
  ],
);

export const scheduleAllocationMap = financeSchema.table(
  "schedule_allocation_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    debtId: uuid("debt_id").notNull(),
    targetScheduleVersionId: uuid("target_schedule_version_id").notNull(),
    paymentRevisionId: uuid("payment_revision_id").notNull(),
    sourceAllocationId: uuid("source_allocation_id"),
    sourceKind: text("source_kind").notNull(),
    targetInstallmentId: uuid("target_installment_id"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    targetKind: text("target_kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_schedule_allocation_map_scope_id").on(t.workspaceId, t.id),
    unique("uq_schedule_allocation_map_path")
      .on(
        t.workspaceId,
        t.targetScheduleVersionId,
        t.paymentRevisionId,
        t.sourceAllocationId,
        t.targetInstallmentId,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "fk_schedule_allocation_map_payment_revision",
      columns: [t.workspaceId, t.debtId, t.paymentRevisionId],
      foreignColumns: [
        debtPaymentRevision.workspaceId,
        debtPaymentRevision.debtId,
        debtPaymentRevision.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_schedule_allocation_map_source",
      columns: [
        t.workspaceId,
        t.debtId,
        t.paymentRevisionId,
        t.sourceAllocationId,
      ],
      foreignColumns: [
        paymentDueAllocation.workspaceId,
        paymentDueAllocation.debtId,
        paymentDueAllocation.paymentRevisionId,
        paymentDueAllocation.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_schedule_allocation_map_target_schedule",
      columns: [t.workspaceId, t.debtId, t.targetScheduleVersionId],
      foreignColumns: [
        debtScheduleVersion.workspaceId,
        debtScheduleVersion.debtId,
        debtScheduleVersion.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_schedule_allocation_map_target_entry",
      columns: [
        t.workspaceId,
        t.debtId,
        t.targetScheduleVersionId,
        t.targetInstallmentId,
      ],
      foreignColumns: [
        scheduledInstallment.workspaceId,
        scheduledInstallment.debtId,
        scheduledInstallment.scheduleVersionId,
        scheduledInstallment.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_schedule_allocation_map_source").on(
      t.workspaceId,
      t.debtId,
      t.paymentRevisionId,
      t.sourceAllocationId,
    ),
    index("ix_schedule_allocation_map_target").on(
      t.workspaceId,
      t.debtId,
      t.targetScheduleVersionId,
      t.targetInstallmentId,
    ),
    check(
      "ck_schedule_allocation_map_amount",
      sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 100000000000`,
    ),
    check(
      "ck_schedule_allocation_map_source_shape",
      sql`(${t.sourceKind} = 'allocation' AND ${t.sourceAllocationId} IS NOT NULL) OR (${t.sourceKind} = 'unapplied' AND ${t.sourceAllocationId} IS NULL)`,
    ),
    check(
      "ck_schedule_allocation_map_target_shape",
      sql`(${t.targetKind} = 'installment' AND ${t.targetInstallmentId} IS NOT NULL) OR (${t.targetKind} = 'unapplied' AND ${t.targetInstallmentId} IS NULL)`,
    ),
  ],
);

export const paymentReclassification = financeSchema.table(
  "payment_reclassification",
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
    debtId: uuid("debt_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    sourceComponentId: uuid("source_component_id").notNull(),
    clearingCreditPostingId: uuid("clearing_credit_posting_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_payment_reclassification_scope_id").on(t.workspaceId, t.id),
    unique("uq_payment_reclassification_credit").on(
      t.workspaceId,
      t.clearingCreditPostingId,
    ),
    foreignKey({
      name: "fk_payment_reclassification_action_revision",
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
      name: "fk_payment_reclassification_payment",
      columns: [t.workspaceId, t.debtId, t.paymentId],
      foreignColumns: [
        debtPayment.workspaceId,
        debtPayment.debtId,
        debtPayment.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_payment_reclassification_component",
      columns: [t.workspaceId, t.debtId, t.sourceComponentId],
      foreignColumns: [
        paymentComponent.workspaceId,
        paymentComponent.debtId,
        paymentComponent.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_payment_reclassification_credit",
      columns: [t.workspaceId, t.actionRevisionId, t.clearingCreditPostingId],
      foreignColumns: [
        posting.workspaceId,
        posting.actionRevisionId,
        posting.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_payment_reclassification_component").on(
      t.workspaceId,
      t.debtId,
      t.sourceComponentId,
    ),
    index("ix_payment_reclassification_payment").on(
      t.workspaceId,
      t.debtId,
      t.paymentId,
    ),
    check(
      "ck_payment_reclassification_amount",
      sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 100000000000`,
    ),
    check(
      "ck_payment_reclassification_reason",
      sql`char_length(btrim(${t.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);
