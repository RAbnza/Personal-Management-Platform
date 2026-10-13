import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { planningSchema } from "./namespaces";
import { workspace, commandReceipt, category } from "./core";
import { user } from "./auth.generated";
import { financialAccount, financialAction, actionRevision } from "./finance";

const identity = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
});
const evidence = () => ({
  commandReceiptId: uuid("command_receipt_id").notNull(),
  recordedByUserId: uuid("recorded_by_user_id")
    .notNull()
    .references(() => user.id),
  requestId: uuid("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const recurringObligation = planningSchema.table(
  "recurring_obligation",
  {
    ...identity(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    currentVersionId: uuid("current_version_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...evidence(),
  },
  (t) => [
    unique("uq_recurring_scope").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_recurring_active").on(t.workspaceId, t.archivedAt, t.id),
    index("ix_recurring_command").on(t.workspaceId, t.commandReceiptId),
    index("ix_recurring_actor").on(t.recordedByUserId),
    check(
      "ck_recurring_identity",
      sql`char_length(btrim(${t.name})) BETWEEN 1 AND 200 AND ${t.kind} IN ('income','bill','subscription') AND ${t.version}>0`,
    ),
  ],
);
export const recurrenceVersion = planningSchema.table(
  "recurrence_version",
  {
    ...identity(),
    obligationId: uuid("obligation_id").notNull(),
    versionNo: integer("version_no").notNull(),
    previousVersionId: uuid("previous_version_id"),
    effectiveFrom: date("effective_from").notNull(),
    frequency: text("frequency").notNull(),
    intervalCount: integer("interval_count").notNull(),
    weekdays: integer("weekdays").array(),
    dayOfMonth: integer("day_of_month"),
    shortMonthPolicy: text("short_month_policy"),
    endsOn: date("ends_on"),
    occurrenceLimit: integer("occurrence_limit"),
    expectedMinor: bigint("expected_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id"),
    defaultAccountId: uuid("default_account_id"),
    timezone: text("timezone").notNull(),
    reason: text("reason"),
    ...evidence(),
  },
  (t) => [
    unique("uq_recurrence_scope").on(t.workspaceId, t.id),
    unique("uq_recurrence_parent").on(t.workspaceId, t.obligationId, t.id),
    unique("uq_recurrence_number").on(
      t.workspaceId,
      t.obligationId,
      t.versionNo,
    ),
    unique("uq_recurrence_boundary").on(
      t.workspaceId,
      t.obligationId,
      t.effectiveFrom,
    ),
    foreignKey({
      columns: [t.workspaceId, t.obligationId],
      foreignColumns: [recurringObligation.workspaceId, recurringObligation.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.defaultAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }),
    index("ix_recurrence_window").on(
      t.workspaceId,
      t.obligationId,
      t.effectiveFrom,
    ),
    index("ix_recurrence_command").on(t.workspaceId, t.commandReceiptId),
    index("ix_recurrence_actor").on(t.recordedByUserId),
    index("ix_recurrence_account").on(t.workspaceId, t.defaultAccountId),
    index("ix_recurrence_category").on(t.workspaceId, t.categoryId),
    check(
      "ck_recurrence_bounds",
      sql`${t.versionNo}>0 AND ${t.expectedMinor}>0 AND ${t.expectedMinor}<=100000000000 AND ${t.currency}='PHP' AND ${t.effectiveFrom} BETWEEN '1900-01-01'::date AND '2199-12-31'::date AND (${t.endsOn} IS NULL OR ${t.endsOn}>=${t.effectiveFrom} AND ${t.endsOn}<='2199-12-31'::date) AND (${t.occurrenceLimit} IS NULL OR ${t.occurrenceLimit} BETWEEN 1 AND 10000)`,
    ),
    check(
      "ck_recurrence_grammar",
      sql`COALESCE((${t.frequency}='daily' AND ${t.intervalCount} BETWEEN 1 AND 365 AND ${t.weekdays} IS NULL AND ${t.dayOfMonth} IS NULL AND ${t.shortMonthPolicy} IS NULL) OR (${t.frequency}='weekly' AND ${t.intervalCount} BETWEEN 1 AND 52 AND cardinality(${t.weekdays}) BETWEEN 1 AND 7 AND ${t.weekdays}<@ARRAY[1,2,3,4,5,6,7] AND ${t.dayOfMonth} IS NULL AND ${t.shortMonthPolicy} IS NULL) OR (${t.frequency}='monthly' AND ${t.intervalCount} BETWEEN 1 AND 120 AND ${t.weekdays} IS NULL AND ${t.dayOfMonth} BETWEEN 1 AND 31 AND ${t.shortMonthPolicy} IN ('last_valid_day','skip')),false)`,
    ),
    check(
      "ck_recurrence_revision",
      sql`COALESCE((${t.versionNo}=1 AND ${t.previousVersionId} IS NULL AND ${t.reason} IS NULL) OR (${t.versionNo}>1 AND ${t.previousVersionId} IS NOT NULL AND char_length(btrim(${t.reason})) BETWEEN 1 AND 2000),false)`,
    ),
  ],
);
export const expectedOccurrence = planningSchema.table(
  "expected_occurrence",
  {
    ...identity(),
    obligationId: uuid("obligation_id").notNull(),
    recurrenceVersionId: uuid("recurrence_version_id").notNull(),
    logicalDate: date("logical_date").notNull(),
    generation: integer("generation").notNull(),
    dueDate: date("due_date").notNull(),
    expectedMinor: bigint("expected_minor", { mode: "bigint" }).notNull(),
    state: text("state").default("planned").notNull(),
    overrideReason: text("override_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notificationGeneration: integer("notification_generation")
      .default(1)
      .notNull(),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...evidence(),
  },
  (t) => [
    unique("uq_expected_scope").on(t.workspaceId, t.id),
    unique("uq_expected_generation").on(
      t.workspaceId,
      t.obligationId,
      t.logicalDate,
      t.generation,
    ),
    uniqueIndex("uq_expected_active")
      .on(t.workspaceId, t.obligationId, t.logicalDate)
      .where(sql`${t.state}<>'cancelled'`),
    foreignKey({
      columns: [t.workspaceId, t.obligationId, t.recurrenceVersionId],
      foreignColumns: [
        recurrenceVersion.workspaceId,
        recurrenceVersion.obligationId,
        recurrenceVersion.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_expected_due").on(t.workspaceId, t.state, t.dueDate, t.id),
    index("ix_expected_command").on(t.workspaceId, t.commandReceiptId),
    index("ix_expected_actor").on(t.recordedByUserId),
    index("ix_expected_obligation").on(
      t.workspaceId,
      t.obligationId,
      t.logicalDate,
      t.generation,
    ),
    check(
      "ck_expected_amount",
      sql`${t.expectedMinor}>0 AND ${t.expectedMinor}<=100000000000 AND ${t.version}>0 AND ${t.generation}>0 AND ${t.notificationGeneration}>0`,
    ),
    check(
      "ck_expected_state",
      sql`${t.state} IN ('planned','linked','completed','skipped','cancelled') AND (${t.state}='completed')=(${t.completedAt} IS NOT NULL) AND (${t.overrideReason} IS NULL OR char_length(btrim(${t.overrideReason})) BETWEEN 1 AND 2000)`,
    ),
    check(
      "ck_expected_dates",
      sql`${t.logicalDate} BETWEEN '1900-01-01'::date AND '2199-12-31'::date AND ${t.dueDate} BETWEEN '1900-01-01'::date AND '2199-12-31'::date`,
    ),
  ],
);
export const occurrenceActualLink = planningSchema.table(
  "occurrence_actual_link",
  {
    ...identity(),
    occurrenceId: uuid("occurrence_id").notNull(),
    actionId: uuid("action_id").notNull(),
    actionRevisionId: uuid("action_revision_id").notNull(),
    linkedMinor: bigint("linked_minor", { mode: "bigint" }).notNull(),
    reversesLinkId: uuid("reverses_link_id"),
    reason: text("reason"),
    ...evidence(),
  },
  (t) => [
    unique("uq_occurrence_link_scope").on(t.workspaceId, t.id),
    uniqueIndex("uq_occurrence_link_reversal")
      .on(t.workspaceId, t.reversesLinkId)
      .where(sql`${t.reversesLinkId} IS NOT NULL`),
    foreignKey({
      columns: [t.workspaceId, t.occurrenceId],
      foreignColumns: [expectedOccurrence.workspaceId, expectedOccurrence.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actionId, t.actionRevisionId],
      foreignColumns: [
        actionRevision.workspaceId,
        actionRevision.actionId,
        actionRevision.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_occurrence_link_source").on(
      t.workspaceId,
      t.actionId,
      t.occurrenceId,
    ),
    index("ix_occurrence_link_target").on(t.workspaceId, t.occurrenceId),
    index("ix_occurrence_link_command").on(t.workspaceId, t.commandReceiptId),
    index("ix_occurrence_link_actor").on(t.recordedByUserId),
    check(
      "ck_occurrence_link_amount",
      sql`COALESCE(${t.linkedMinor}>0 AND ${t.linkedMinor}<=100000000000 AND ((${t.reversesLinkId} IS NULL AND ${t.reason} IS NULL) OR (${t.reversesLinkId} IS NOT NULL AND char_length(btrim(${t.reason})) BETWEEN 1 AND 2000)),false)`,
    ),
  ],
);
