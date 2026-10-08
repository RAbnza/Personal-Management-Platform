import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { workspace } from "./core";
import {
  actionRevision,
  debt,
  debtScheduleVersion,
  financialAction,
  posting,
} from "./finance";
import { debtPayment } from "./debt-payments";
import { financeSchema } from "./namespaces";
export const debtSettlement = financeSchema.table(
  "debt_settlement",
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
    paymentId: uuid("payment_id"),
    priorScheduleVersionId: uuid("prior_schedule_version_id").notNull(),
    closingScheduleVersionId: uuid("closing_schedule_version_id").notNull(),
    settlementDate: date("settlement_date").notNull(),
    confirmedPayoffMinor: bigint("confirmed_payoff_minor", {
      mode: "bigint",
    }).notNull(),
    actualCashPaidMinor: bigint("actual_cash_paid_minor", {
      mode: "bigint",
    }).notNull(),
    settlementKind: text("settlement_kind").notNull(),
    providerReference: text("provider_reference"),
    reason: text("reason").notNull(),
    resolvedUnappliedMinor: bigint("resolved_unapplied_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    unappliedResolutionNote: text("unapplied_resolution_note"),
    confirmationSource: text("confirmation_source").notNull(),
    confirmationNote: text("confirmation_note").notNull(),
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
    unique("uq_debt_settlement_scope_id").on(t.workspaceId, t.id),
    unique("uq_debt_settlement_revision").on(t.workspaceId, t.actionRevisionId),
    unique("uq_debt_settlement_debt").on(t.workspaceId, t.debtId),
    unique("uq_debt_settlement_closing").on(
      t.workspaceId,
      t.closingScheduleVersionId,
    ),
    foreignKey({
      name: "fk_settlement_debt",
      columns: [t.workspaceId, t.debtId],
      foreignColumns: [debt.workspaceId, debt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_settlement_action",
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_settlement_revision",
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
      name: "fk_settlement_payment",
      columns: [t.workspaceId, t.debtId, t.paymentId],
      foreignColumns: [
        debtPayment.workspaceId,
        debtPayment.debtId,
        debtPayment.id,
      ],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    ...[
      ["prior", t.priorScheduleVersionId],
      ["closing", t.closingScheduleVersionId],
    ].map(([name, col]) =>
      foreignKey({
        name: `fk_settlement_${name}_schedule`,
        columns: [
          t.workspaceId,
          t.debtId,
          col as typeof t.priorScheduleVersionId,
        ],
        foreignColumns: [
          debtScheduleVersion.workspaceId,
          debtScheduleVersion.debtId,
          debtScheduleVersion.id,
        ],
      })
        .onDelete("restrict")
        .onUpdate("restrict"),
    ),
    check(
      "ck_settlement_amounts",
      sql`${t.confirmedPayoffMinor}>=0 AND ${t.confirmedPayoffMinor}<=100000000000 AND ${t.actualCashPaidMinor}<=100000000000 AND ${t.actualCashPaidMinor}>=${t.confirmedPayoffMinor} AND ${t.resolvedUnappliedMinor}>=0`,
    ),
    check("ck_settlement_kind", sql`${t.settlementKind} IN ('normal','early')`),
    check(
      "ck_settlement_confirmation",
      sql`${t.confirmationSource} IN ('user','provider') AND length(trim(${t.confirmationNote}))>0 AND length(trim(${t.reason}))>0 AND (${t.resolvedUnappliedMinor}=0 OR COALESCE(length(trim(${t.unappliedResolutionNote})),0)>0)`,
    ),
    check(
      "ck_settlement_actor",
      sql`${t.actorKind} IN ('user','system','import') AND (${t.actorKind}<>'user' OR ${t.recordedByUserId} IS NOT NULL)`,
    ),
    index("ix_settlement_debt_date").on(
      t.workspaceId,
      t.debtId,
      t.settlementDate,
    ),
  ],
);
export const settlementComponent = financeSchema.table(
  "settlement_component",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    settlementId: uuid("settlement_id").notNull(),
    componentKind: text("component_kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    recognizedSourcePostingId: uuid("recognized_source_posting_id"),
    effectPostingId: uuid("effect_posting_id"),
    counterPostingId: uuid("counter_posting_id"),
    liabilityComponent: text("liability_component"),
    roundingTreatment: text("rounding_treatment"),
    unknownOpening: boolean("unknown_opening").notNull().default(false),
    explanation: text("explanation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("uq_settlement_component_scope_id").on(t.workspaceId, t.id),
    unique("uq_settlement_component_effect").on(
      t.workspaceId,
      t.effectPostingId,
    ),
    unique("uq_settlement_component_counter").on(
      t.workspaceId,
      t.counterPostingId,
    ),
    foreignKey({
      name: "fk_settlement_component_parent",
      columns: [t.workspaceId, t.settlementId],
      foreignColumns: [debtSettlement.workspaceId, debtSettlement.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    ...[
      ["source", t.recognizedSourcePostingId],
      ["effect", t.effectPostingId],
      ["counter", t.counterPostingId],
    ].map(([name, col]) =>
      foreignKey({
        name: `fk_settlement_component_${name}`,
        columns: [t.workspaceId, col as typeof t.effectPostingId],
        foreignColumns: [posting.workspaceId, posting.id],
      })
        .onDelete("restrict")
        .onUpdate("restrict"),
    ),
    check(
      "ck_settlement_component_kind",
      sql`${t.componentKind} IN ('recognized_charge','recognized_waiver','avoided_future_charge','rounding_correction')`,
    ),
    check(
      "ck_settlement_component_amount",
      sql`${t.amountMinor}>0 AND ${t.amountMinor}<=100000000000 AND length(trim(${t.explanation}))>0`,
    ),
    check(
      "ck_settlement_rounding_treatment",
      sql`(${t.componentKind}='rounding_correction' AND ${t.roundingTreatment} IS NOT NULL AND ${t.roundingTreatment} IN ('recognized_charge','recognized_waiver')) OR (${t.componentKind}<>'rounding_correction' AND ${t.roundingTreatment} IS NULL)`,
    ),
    check(
      "ck_settlement_component_shape",
      sql`(${t.componentKind}='avoided_future_charge' AND ${t.effectPostingId} IS NULL AND ${t.counterPostingId} IS NULL AND ${t.recognizedSourcePostingId} IS NULL AND ${t.liabilityComponent} IS NULL AND NOT ${t.unknownOpening}) OR (${t.componentKind}<>'avoided_future_charge' AND ${t.effectPostingId} IS NOT NULL AND ${t.counterPostingId} IS NOT NULL AND ${t.liabilityComponent} IS NOT NULL AND ${t.liabilityComponent} IN ('principal','interest','fee','penalty','unclassified'))`,
    ),
    index("ix_settlement_component_parent").on(t.workspaceId, t.settlementId),
    index("ix_settlement_component_source").on(
      t.workspaceId,
      t.recognizedSourcePostingId,
    ),
  ],
);
