import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user as authUser } from "./auth.generated";
import { commandReceipt, tag, workspace } from "./core";
import { careerSchema } from "./namespaces";

export const resumeVersion = careerSchema.table(
  "resume_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    label: text("label").notNull(),
    referenceUrl: text("reference_url"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_resume_version_scope_id").on(table.workspaceId, table.id),
    unique("uq_resume_version_label").on(table.workspaceId, table.label),

    check(
      "ck_resume_version_label",
      sql`
        char_length(${table.label}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_resume_version_reference_url",
      sql`
        ${table.referenceUrl} IS NULL
        OR char_length(${table.referenceUrl}) <= 2048
      `,
    ),
    check(
      "ck_resume_version_notes",
      sql`
        ${table.notes} IS NULL
        OR char_length(${table.notes}) <= 20000
      `,
    ),
    check(
      "ck_resume_version_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_resume_version_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
  ],
);

export const jobApplication = careerSchema.table(
  "job_application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    companyName: text("company_name").notNull(),
    roleTitle: text("role_title").notNull(),

    postingUrl: text("posting_url"),
    sourceName: text("source_name"),
    roleDescriptionSnapshot: text("role_description_snapshot"),
    location: text("location"),
    workArrangement: text("work_arrangement"),

    salaryMinMinor: bigint("salary_min_minor", {
      mode: "bigint",
    }),
    salaryMaxMinor: bigint("salary_max_minor", {
      mode: "bigint",
    }),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),

    technologyTags: text("technology_tags")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),

    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),

    resumeVersionId: uuid("resume_version_id"),

    appliedDate: date("applied_date", {
      mode: "string",
    }),

    currentStage: text("current_stage").default("saved").notNull(),
    currentOutcome: text("current_outcome"),

    /**
     * job_application.current_history_id and
     * application_stage_history.application_id form a circular relationship.
     *
     * The required DEFERRABLE same-application foreign key is installed in
     * the reviewed S2 custom integrity migration after both tables exist.
     */
    currentHistoryId: uuid("current_history_id").notNull(),

    /**
     * The next-action pointer must reference an event owned by this exact
     * application. That same-application DEFERRABLE relationship is installed
     * in the reviewed S2 custom integrity migration.
     */
    nextActionEventId: uuid("next_action_event_id"),

    notes: text("notes"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
    }),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_job_application_scope_id").on(table.workspaceId, table.id),

    foreignKey({
      name: "fk_job_application_resume",
      columns: [table.workspaceId, table.resumeVersionId],
      foreignColumns: [resumeVersion.workspaceId, resumeVersion.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_job_application_list").on(
      table.workspaceId,
      table.archivedAt,
      table.currentStage,
      table.appliedDate.desc(),
      table.id.desc(),
    ),

    index("ix_job_application_company").on(
      table.workspaceId,
      table.companyName,
    ),

    check(
      "ck_job_application_company_name",
      sql`
        char_length(${table.companyName}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_job_application_role_title",
      sql`
        char_length(${table.roleTitle}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_job_application_posting_url",
      sql`
        ${table.postingUrl} IS NULL
        OR char_length(${table.postingUrl}) <= 2048
      `,
    ),
    check(
      "ck_job_application_role_snapshot",
      sql`
        ${table.roleDescriptionSnapshot} IS NULL
        OR char_length(${table.roleDescriptionSnapshot}) <= 20000
      `,
    ),
    check(
      "ck_job_application_work_arrangement",
      sql`
        ${table.workArrangement} IS NULL
        OR ${table.workArrangement}
          IN ('onsite', 'hybrid', 'remote', 'unspecified')
      `,
    ),
    check(
      "ck_job_application_salary_values",
      sql`
        (
          ${table.salaryMinMinor} IS NULL
          OR ${table.salaryMinMinor} >= 0
        )
        AND
        (
          ${table.salaryMaxMinor} IS NULL
          OR ${table.salaryMaxMinor} >= 0
        )
        AND
        (
          ${table.salaryMinMinor} IS NULL
          OR ${table.salaryMaxMinor} IS NULL
          OR ${table.salaryMinMinor} <= ${table.salaryMaxMinor}
        )
      `,
    ),
    check(
      "ck_job_application_salary_metadata",
      sql`
        (
          ${table.salaryMinMinor} IS NULL
          AND ${table.salaryMaxMinor} IS NULL
        )
        OR
        (
          ${table.salaryCurrency} IS NOT NULL
          AND ${table.salaryPeriod} IS NOT NULL
        )
      `,
    ),
    check(
      "ck_job_application_salary_currency",
      sql`
        ${table.salaryCurrency} IS NULL
        OR ${table.salaryCurrency} ~ '^[A-Z]{3}$'
      `,
    ),
    check(
      "ck_job_application_salary_period",
      sql`
        ${table.salaryPeriod} IS NULL
        OR ${table.salaryPeriod}
          IN ('hour', 'month', 'year')
      `,
    ),
    check(
      "ck_job_application_stage",
      sql`
        ${table.currentStage}
        IN (
          'saved',
          'applied',
          'screening',
          'interview',
          'technical_assessment',
          'final_interview',
          'offer',
          'accepted'
        )
      `,
    ),
    check(
      "ck_job_application_outcome",
      sql`
        ${table.currentOutcome} IS NULL
        OR ${table.currentOutcome}
          IN (
            'accepted',
            'rejected',
            'withdrawn',
            'offer_declined',
            'offer_expired',
            'employer_cancelled'
          )
      `,
    ),
    check(
      "ck_job_application_accepted_coherence",
      sql`
        (
          ${table.currentStage} = 'accepted'
          AND ${table.currentOutcome} = 'accepted'
        )
        OR
        (
          ${table.currentStage} <> 'accepted'
          AND ${table.currentOutcome} IS DISTINCT FROM 'accepted'
        )
      `,
    ),
    check(
      "ck_job_application_notes",
      sql`
        ${table.notes} IS NULL
        OR char_length(${table.notes}) <= 20000
      `,
    ),
    check(
      "ck_job_application_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_job_application_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
    check("ck_job_application_version", sql`${table.version} > 0`),
  ],
);

export const applicationStageHistory = careerSchema.table(
  "application_stage_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    applicationId: uuid("application_id").notNull(),
    sequenceNo: integer("sequence_no").notNull(),

    stage: text("stage").notNull(),
    outcome: text("outcome"),

    effectiveDate: date("effective_date", {
      mode: "string",
    }).notNull(),
    effectiveOrder: integer("effective_order").default(0).notNull(),

    /**
     * The reviewed S2 integrity migration adds the same-application
     * supersession foreign key. Keeping the raw UUID here avoids weakening
     * that relationship into a workspace-only reference.
     */
    supersedesHistoryId: uuid("supersedes_history_id"),

    reason: text("reason"),
    commandReceiptId: uuid("command_receipt_id").notNull(),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("uq_application_history_scope_id").on(table.workspaceId, table.id),

    unique("uq_application_history_sequence").on(
      table.workspaceId,
      table.applicationId,
      table.sequenceNo,
    ),

    unique("uq_application_history_app_id").on(
      table.workspaceId,
      table.applicationId,
      table.id,
    ),

    uniqueIndex("uq_application_history_supersedes")
      .on(table.workspaceId, table.applicationId, table.supersedesHistoryId)
      .where(sql`${table.supersedesHistoryId} IS NOT NULL`),

    foreignKey({
      name: "fk_application_history_application",
      columns: [table.workspaceId, table.applicationId],
      foreignColumns: [jobApplication.workspaceId, jobApplication.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_application_history_command",
      columns: [table.workspaceId, table.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_application_history_timeline").on(
      table.workspaceId,
      table.applicationId,
      table.effectiveDate,
      table.effectiveOrder,
      table.id,
    ),

    check("ck_application_history_sequence", sql`${table.sequenceNo} > 0`),
    check(
      "ck_application_history_effective_order",
      sql`${table.effectiveOrder} >= 0`,
    ),
    check(
      "ck_application_history_stage",
      sql`
        ${table.stage}
        IN (
          'saved',
          'applied',
          'screening',
          'interview',
          'technical_assessment',
          'final_interview',
          'offer',
          'accepted'
        )
      `,
    ),
    check(
      "ck_application_history_outcome",
      sql`
        ${table.outcome} IS NULL
        OR ${table.outcome}
          IN (
            'accepted',
            'rejected',
            'withdrawn',
            'offer_declined',
            'offer_expired',
            'employer_cancelled'
          )
      `,
    ),
    check(
      "ck_application_history_accepted",
      sql`
        (
          ${table.stage} = 'accepted'
          AND ${table.outcome} = 'accepted'
        )
        OR
        (
          ${table.stage} <> 'accepted'
          AND ${table.outcome} IS DISTINCT FROM 'accepted'
        )
      `,
    ),
    check(
      "ck_application_history_reason",
      sql`
        ${table.reason} IS NULL
        OR char_length(${table.reason}) <= 2000
      `,
    ),
    check(
      "ck_application_history_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_application_history_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
  ],
);

export const applicationEvent = careerSchema.table(
  "application_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    applicationId: uuid("application_id").notNull(),

    eventKind: text("event_kind").notNull(),
    title: text("title").notNull(),

    temporalKind: text("temporal_kind").notNull(),

    eventDate: date("event_date", {
      mode: "string",
    }),

    startsAt: timestamp("starts_at", {
      withTimezone: true,
    }),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
    }),
    timezone: text("timezone"),

    status: text("status").default("scheduled").notNull(),

    location: text("location"),
    meetingUrl: text("meeting_url"),
    preparationNotes: text("preparation_notes"),
    outcomeNotes: text("outcome_notes"),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    notificationGeneration: integer("notification_generation")
      .default(1)
      .notNull(),

    recordedByUserId: uuid("recorded_by_user_id").references(
      () => authUser.id,
      {
        onDelete: "restrict",
        onUpdate: "restrict",
      },
    ),
    actorKind: text("actor_kind").notNull(),
    requestId: uuid("request_id"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("uq_application_event_scope_id").on(table.workspaceId, table.id),

    unique("uq_application_event_app_id").on(
      table.workspaceId,
      table.applicationId,
      table.id,
    ),

    foreignKey({
      name: "fk_application_event_application",
      columns: [table.workspaceId, table.applicationId],
      foreignColumns: [jobApplication.workspaceId, jobApplication.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_application_event_date")
      .on(table.workspaceId, table.eventDate, table.id)
      .where(sql`${table.temporalKind} = 'date'`),

    index("ix_application_event_timed")
      .on(table.workspaceId, table.startsAt, table.id)
      .where(sql`${table.temporalKind} = 'timed'`),

    check(
      "ck_application_event_kind",
      sql`
        ${table.eventKind}
        IN (
          'interview',
          'assessment',
          'follow_up',
          'submission',
          'response',
          'offer',
          'no_response',
          'note'
        )
      `,
    ),
    check(
      "ck_application_event_title",
      sql`
        char_length(${table.title}) BETWEEN 1 AND 200
      `,
    ),
    check(
      "ck_application_event_temporal_kind",
      sql`${table.temporalKind} IN ('date', 'timed')`,
    ),
    check(
      "ck_application_event_temporal_shape",
      sql`
        (
          ${table.temporalKind} = 'date'
          AND ${table.eventDate} IS NOT NULL
          AND ${table.startsAt} IS NULL
          AND ${table.endsAt} IS NULL
          AND ${table.timezone} IS NULL
        )
        OR
        (
          ${table.temporalKind} = 'timed'
          AND ${table.eventDate} IS NULL
          AND ${table.startsAt} IS NOT NULL
          AND ${table.timezone} IS NOT NULL
          AND (
            ${table.endsAt} IS NULL
            OR ${table.endsAt} > ${table.startsAt}
          )
        )
      `,
    ),
    check(
      "ck_application_event_status",
      sql`
        ${table.status}
        IN ('scheduled', 'completed', 'cancelled')
      `,
    ),
    check(
      "ck_application_event_completion",
      sql`
        (
          ${table.status} = 'completed'
          AND ${table.completedAt} IS NOT NULL
        )
        OR
        (
          ${table.status} <> 'completed'
          AND ${table.completedAt} IS NULL
        )
      `,
    ),
    check(
      "ck_application_event_timezone",
      sql`
        ${table.timezone} IS NULL
        OR char_length(${table.timezone}) BETWEEN 1 AND 100
      `,
    ),
    check(
      "ck_application_event_meeting_url",
      sql`
        ${table.meetingUrl} IS NULL
        OR char_length(${table.meetingUrl}) <= 2048
      `,
    ),
    check(
      "ck_application_event_preparation_notes",
      sql`
        ${table.preparationNotes} IS NULL
        OR char_length(${table.preparationNotes}) <= 20000
      `,
    ),
    check(
      "ck_application_event_outcome_notes",
      sql`
        ${table.outcomeNotes} IS NULL
        OR char_length(${table.outcomeNotes}) <= 20000
      `,
    ),
    check(
      "ck_application_event_notification_generation",
      sql`${table.notificationGeneration} > 0`,
    ),
    check(
      "ck_application_event_actor_kind",
      sql`${table.actorKind} IN ('user', 'system', 'import')`,
    ),
    check(
      "ck_application_event_actor_user",
      sql`
        ${table.actorKind} <> 'user'
        OR ${table.recordedByUserId} IS NOT NULL
      `,
    ),
    check("ck_application_event_version", sql`${table.version} > 0`),
  ],
);

export const applicationTag = careerSchema.table(
  "application_tag",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),

    applicationId: uuid("application_id").notNull(),
    tagId: uuid("tag_id").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "pk_application_tag",
      columns: [table.workspaceId, table.applicationId, table.tagId],
    }),

    foreignKey({
      name: "fk_application_tag_application",
      columns: [table.workspaceId, table.applicationId],
      foreignColumns: [jobApplication.workspaceId, jobApplication.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    foreignKey({
      name: "fk_application_tag_tag",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tag.workspaceId, tag.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),

    index("ix_application_tag_tag").on(
      table.workspaceId,
      table.tagId,
      table.applicationId,
    ),
  ],
);
