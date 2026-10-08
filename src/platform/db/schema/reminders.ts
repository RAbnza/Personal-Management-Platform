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
} from "drizzle-orm/pg-core";
import { workspace } from "./core";
import { personalEvent } from "./time";
import { applicationEvent } from "./career";
import { debtObligation } from "./finance";
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  version: integer("version").default(1).notNull(),
});

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
    unique("uq_reminder_rule_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_rule_logical")
      .on(
        t.workspaceId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
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
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId},${t.moduleKey})=1 AND (${t.moduleKey} IS NULL OR ${t.moduleKey} IN ('money','career','time'))`,
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
  },
  (t) => [
    unique("uq_reminder_setting_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_setting_source")
      .on(
        t.workspaceId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
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
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId})=1`,
    ),
    check(
      "ck_reminder_setting_mode",
      sql`${t.mode} IN ('inherit','override','off') AND ${t.version}>0`,
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
    unique("uq_reminder_occurrence_scope_id").on(t.workspaceId, t.id),
    unique("uq_reminder_occurrence_logical")
      .on(
        t.workspaceId,
        t.ruleId,
        t.personalEventId,
        t.applicationEventId,
        t.debtObligationId,
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
      sql`num_nonnulls(${t.personalEventId},${t.applicationEventId},${t.debtObligationId})=1`,
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
