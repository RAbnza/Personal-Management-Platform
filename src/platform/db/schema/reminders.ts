import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  time,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { workspace } from "./core";
import { personalEvent } from "./time";
import { applicationEvent } from "./career";
import { debtObligation } from "./finance";
import { cardStatement } from "./card-statements";
import { cardInstallment } from "./card-installments";
import { expectedOccurrence } from "./planning";
import { trackerEntry } from "./trackers";
import { timeSchema } from "./namespaces";

const scope = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
  personalEventId: uuid("personal_event_id"),
  applicationEventId: uuid("application_event_id"),
  debtObligationId: uuid("debt_obligation_id"),
  cardStatementId: uuid("card_statement_id"),
  cardInstallmentId: uuid("card_installment_id"),
  expectedOccurrenceId: uuid("expected_occurrence_id"),
  trackerEntryId: uuid("tracker_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  version: integer("version").default(1).notNull(),
});

const cardSourceConstraints = (
  t: {
    workspaceId: AnyPgColumn;
    cardStatementId: AnyPgColumn;
    cardInstallmentId: AnyPgColumn;
    expectedOccurrenceId: AnyPgColumn;
    trackerEntryId: AnyPgColumn;
  },
  name: string,
) => [
  foreignKey({
    name: `fk_${name}_tracker_entry`,
    columns: [t.workspaceId, t.trackerEntryId],
    foreignColumns: [trackerEntry.workspaceId, trackerEntry.id],
  })
    .onDelete("restrict")
    .onUpdate("restrict"),
  index(`ix_${name}_tracker_entry`).on(t.workspaceId, t.trackerEntryId),
  foreignKey({
    name: `fk_${name}_expected_occurrence`,
    columns: [t.workspaceId, t.expectedOccurrenceId],
    foreignColumns: [expectedOccurrence.workspaceId, expectedOccurrence.id],
  })
    .onDelete("restrict")
    .onUpdate("restrict"),
  index(`ix_${name}_expected_occurrence`).on(
    t.workspaceId,
    t.expectedOccurrenceId,
  ),
  foreignKey({
    name: `fk_${name}_card_statement`,
    columns: [t.workspaceId, t.cardStatementId],
    foreignColumns: [cardStatement.workspaceId, cardStatement.id],
  })
    .onDelete("restrict")
    .onUpdate("restrict"),
  foreignKey({
    name: `fk_${name}_card_installment`,
    columns: [t.workspaceId, t.cardInstallmentId],
    foreignColumns: [cardInstallment.workspaceId, cardInstallment.id],
  })
    .onDelete("restrict")
    .onUpdate("restrict"),
  index(`ix_${name}_card_statement`).on(t.workspaceId, t.cardStatementId),
  index(`ix_${name}_card_installment`).on(t.workspaceId, t.cardInstallmentId),
];

// Concrete, workspace-qualified source references are intentionally shared by
// all three tables. Generated Agenda items are never stored as appointments.
export const reminderRule = timeSchema.table(
  "reminder_rule",
  {
    ...scope(),
    moduleKey: text("module_key"),
    channel: text("channel").default("in_app").notNull(),
    offsetDays: integer("offset_days").default(0).notNull(),
    localTime: time("local_time").default("09:00").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    generation: integer("generation").default(1).notNull(),
  },
  (t) => [
    ...cardSourceConstraints(t, "reminder_rule"),
    unique("uq_reminder_rule_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_rule_logical")
      .on(
        t.workspaceId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
        t.cardStatementId,
        t.cardInstallmentId,
        t.expectedOccurrenceId,
        t.trackerEntryId,
        t.moduleKey,
        t.channel,
        t.offsetDays,
        t.localTime,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "fk_reminder_rule_personal",
      columns: [t.workspaceId, t.personalEventId],
      foreignColumns: [personalEvent.workspaceId, personalEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_rule_career",
      columns: [t.workspaceId, t.applicationEventId],
      foreignColumns: [applicationEvent.workspaceId, applicationEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_rule_debt",
      columns: [t.workspaceId, t.debtObligationId],
      foreignColumns: [debtObligation.workspaceId, debtObligation.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_reminder_rule_personal").on(t.workspaceId, t.personalEventId),
    index("ix_reminder_rule_career").on(t.workspaceId, t.applicationEventId),
    index("ix_reminder_rule_debt").on(t.workspaceId, t.debtObligationId),
    check(
      "ck_reminder_rule_source",
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId},${t.cardStatementId},${t.cardInstallmentId},${t.expectedOccurrenceId},${t.trackerEntryId},${t.moduleKey})=1 AND (${t.moduleKey} IS NULL OR ${t.moduleKey} IN ('money','career','time','trackers'))`,
    ),
    check(
      "ck_reminder_rule_shape",
      sql`${t.channel}='in_app' AND ${t.offsetDays} BETWEEN 0 AND 365 AND ${t.generation}>0 AND ${t.version}>0`,
    ),
  ],
);

export const sourceReminderSetting = timeSchema.table(
  "source_reminder_setting",
  {
    ...scope(),
    mode: text("mode").default("inherit").notNull(),
    // A resolved debt due can become actionable again after a correction in
    // the same immutable schedule. Keep its notification epoch in reminder
    // metadata; financial/obligation evidence remains untouched.
    notificationGeneration: integer("notification_generation")
      .default(1)
      .notNull(),
  },
  (t) => [
    ...cardSourceConstraints(t, "reminder_setting"),
    unique("uq_reminder_setting_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_setting_source")
      .on(
        t.workspaceId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
        t.cardStatementId,
        t.cardInstallmentId,
        t.expectedOccurrenceId,
        t.trackerEntryId,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "fk_reminder_setting_personal",
      columns: [t.workspaceId, t.personalEventId],
      foreignColumns: [personalEvent.workspaceId, personalEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_setting_career",
      columns: [t.workspaceId, t.applicationEventId],
      foreignColumns: [applicationEvent.workspaceId, applicationEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_setting_debt",
      columns: [t.workspaceId, t.debtObligationId],
      foreignColumns: [debtObligation.workspaceId, debtObligation.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_reminder_setting_personal").on(t.workspaceId, t.personalEventId),
    index("ix_reminder_setting_career").on(t.workspaceId, t.applicationEventId),
    index("ix_reminder_setting_debt").on(t.workspaceId, t.debtObligationId),
    check(
      "ck_reminder_setting_source",
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId},${t.cardStatementId},${t.cardInstallmentId},${t.expectedOccurrenceId},${t.trackerEntryId})=1`,
    ),
    check(
      "ck_reminder_setting_mode",
      sql`${t.mode} IN ('inherit','override','off') AND ${t.version}>0`,
    ),
    check(
      "ck_reminder_setting_generation",
      sql`${t.notificationGeneration}>0 AND (num_nonnulls(${t.debtObligationId},${t.cardStatementId},${t.cardInstallmentId},${t.expectedOccurrenceId},${t.trackerEntryId})=1 OR ${t.notificationGeneration}=1)`,
    ),
  ],
);

export const reminderOccurrence = timeSchema.table(
  "reminder_occurrence",
  {
    ...scope(),
    ruleId: uuid("rule_id").notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    sourceGeneration: integer("source_generation").notNull(),
    ruleGeneration: integer("rule_generation").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    state: text("state").default("active").notNull(),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
  },
  (t) => [
    ...cardSourceConstraints(t, "reminder_occurrence"),
    unique("uq_reminder_occurrence_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_occurrence_logical")
      .on(
        t.workspaceId,
        t.ruleId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
        t.cardStatementId,
        t.cardInstallmentId,
        t.expectedOccurrenceId,
        t.trackerEntryId,
        t.occurrenceKey,
        t.sourceGeneration,
        t.ruleGeneration,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "fk_reminder_occurrence_rule",
      columns: [t.workspaceId, t.ruleId],
      foreignColumns: [reminderRule.workspaceId, reminderRule.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_occurrence_personal",
      columns: [t.workspaceId, t.personalEventId],
      foreignColumns: [personalEvent.workspaceId, personalEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_occurrence_career",
      columns: [t.workspaceId, t.applicationEventId],
      foreignColumns: [applicationEvent.workspaceId, applicationEvent.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "fk_reminder_occurrence_debt",
      columns: [t.workspaceId, t.debtObligationId],
      foreignColumns: [debtObligation.workspaceId, debtObligation.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    index("ix_reminder_occurrence_due").on(
      t.workspaceId,
      t.state,
      t.scheduledFor,
      t.id,
    ),
    index("ix_reminder_occurrence_personal").on(
      t.workspaceId,
      t.personalEventId,
    ),
    index("ix_reminder_occurrence_career").on(
      t.workspaceId,
      t.applicationEventId,
    ),
    index("ix_reminder_occurrence_debt").on(t.workspaceId, t.debtObligationId),
    check(
      "ck_reminder_occurrence_source",
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId},${t.cardStatementId},${t.cardInstallmentId},${t.expectedOccurrenceId},${t.trackerEntryId})=1`,
    ),
    check(
      "ck_reminder_occurrence_identity",
      sql`${t.sourceGeneration}>0 AND ${t.ruleGeneration}>0 AND ${t.version}>0 AND char_length(${t.occurrenceKey}) BETWEEN 1 AND 200`,
    ),
    check(
      "ck_reminder_occurrence_state",
      sql`${t.state} IN ('active','dismissed','snoozed','cancelled') AND ((${t.state}='snoozed')=(${t.snoozedUntil} IS NOT NULL)) AND ((${t.state}='dismissed')=(${t.dismissedAt} IS NOT NULL)) AND ((${t.state}='cancelled')=(${t.cancellationReason} IS NOT NULL))`,
    ),
  ],
);
