import { trackerGraph } from "./tracker-graph";
/** Reviewed private graph registry. SQL names never come from an uploaded bundle. */
export type GraphDescriptor = {
  kind: string;
  columns: { name: string; type: string; notNull: boolean }[];
  primaryKey: string[];
  foreignKeys: { columns: string[]; target: string; targetColumns: string[] }[];
};
export const legacyV2GraphRegistry: GraphDescriptor[] = [
  {
    kind: "audit.private_activity",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "activity_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "subject_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "subject_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "summary_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "occurred_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "revision_id"],
        target: "audit.private_revision",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "audit.private_revision",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "subject_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "subject_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "subject_version",
        type: "integer",
        notNull: true,
      },
      {
        name: "operation",
        type: "text",
        notNull: true,
      },
      {
        name: "before_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "after_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "effective_date",
        type: "date",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "career.application_event",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "application_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "event_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "title",
        type: "text",
        notNull: true,
      },
      {
        name: "temporal_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "event_date",
        type: "date",
        notNull: false,
      },
      {
        name: "starts_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "ends_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "timezone",
        type: "text",
        notNull: false,
      },
      {
        name: "status",
        type: "text",
        notNull: true,
      },
      {
        name: "location",
        type: "text",
        notNull: false,
      },
      {
        name: "meeting_url",
        type: "text",
        notNull: false,
      },
      {
        name: "preparation_notes",
        type: "text",
        notNull: false,
      },
      {
        name: "outcome_notes",
        type: "text",
        notNull: false,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "notification_generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "application_id"],
        target: "career.job_application",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "career.application_stage_history",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "application_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "sequence_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "stage",
        type: "text",
        notNull: true,
      },
      {
        name: "outcome",
        type: "text",
        notNull: false,
      },
      {
        name: "effective_date",
        type: "date",
        notNull: true,
      },
      {
        name: "effective_order",
        type: "integer",
        notNull: true,
      },
      {
        name: "supersedes_history_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "application_id"],
        target: "career.job_application",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "career.application_tag",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "application_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "tag_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "application_id"],
        target: "career.job_application",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "tag_id"],
        target: "core.tag",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "career.job_application",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "company_name",
        type: "text",
        notNull: true,
      },
      {
        name: "role_title",
        type: "text",
        notNull: true,
      },
      {
        name: "posting_url",
        type: "text",
        notNull: false,
      },
      {
        name: "source_name",
        type: "text",
        notNull: false,
      },
      {
        name: "role_description_snapshot",
        type: "text",
        notNull: false,
      },
      {
        name: "location",
        type: "text",
        notNull: false,
      },
      {
        name: "work_arrangement",
        type: "text",
        notNull: false,
      },
      {
        name: "salary_min_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "salary_max_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "salary_currency",
        type: "text",
        notNull: false,
      },
      {
        name: "salary_period",
        type: "text",
        notNull: false,
      },
      {
        name: "technology_tags",
        type: "text[]",
        notNull: true,
      },
      {
        name: "contact_name",
        type: "text",
        notNull: false,
      },
      {
        name: "contact_email",
        type: "text",
        notNull: false,
      },
      {
        name: "contact_phone",
        type: "text",
        notNull: false,
      },
      {
        name: "resume_version_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "applied_date",
        type: "date",
        notNull: false,
      },
      {
        name: "current_stage",
        type: "text",
        notNull: true,
      },
      {
        name: "current_outcome",
        type: "text",
        notNull: false,
      },
      {
        name: "current_history_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "next_action_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "resume_version_id"],
        target: "career.resume_version",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "career.resume_version",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: true,
      },
      {
        name: "reference_url",
        type: "text",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.category",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "kind",
        type: "text",
        notNull: true,
      },
      {
        name: "code",
        type: "text",
        notNull: false,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "sort_order",
        type: "integer",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.command_receipt",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "client_command_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "command_type",
        type: "text",
        notNull: true,
      },
      {
        name: "payload_hash",
        type: "bytea",
        notNull: true,
      },
      {
        name: "hash_version",
        type: "integer",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "result_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "retain_until",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.module_preference",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "module_key",
        type: "text",
        notNull: true,
      },
      {
        name: "enabled",
        type: "boolean",
        notNull: true,
      },
      {
        name: "agenda_visible",
        type: "boolean",
        notNull: true,
      },
      {
        name: "reminders_enabled",
        type: "boolean",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.onboarding_step",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "guide_version",
        type: "integer",
        notNull: true,
      },
      {
        name: "step_key",
        type: "text",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.tag",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "color",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "core.workspace_preference",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "locale",
        type: "text",
        notNull: true,
      },
      {
        name: "theme",
        type: "text",
        notNull: true,
      },
      {
        name: "default_salary_account_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "getting_started_dismissed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["workspace_id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "files.action_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.application_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "application_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "application_id"],
        target: "career.job_application",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.application_event_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "application_event_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "application_event_id"],
        target: "career.application_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.card_statement_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "card_statement_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "card_statement_revision_id"],
        target: "finance.card_statement_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.debt_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.private_attachment",
    columns: [
      { name: "unlinked_at", type: "timestamp with time zone", notNull: false },
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "scan_lease_until",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "scan_claim_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "object_key",
        type: "text",
        notNull: true,
      },
      {
        name: "bucket_key",
        type: "text",
        notNull: true,
      },
      {
        name: "object_version",
        type: "text",
        notNull: false,
      },
      {
        name: "original_filename",
        type: "text",
        notNull: true,
      },
      {
        name: "declared_mime",
        type: "text",
        notNull: true,
      },
      {
        name: "verified_mime",
        type: "text",
        notNull: false,
      },
      {
        name: "declared_bytes",
        type: "bigint",
        notNull: true,
      },
      {
        name: "actual_bytes",
        type: "bigint",
        notNull: false,
      },
      {
        name: "checksum_sha256",
        type: "bytea",
        notNull: false,
      },
      {
        name: "status",
        type: "text",
        notNull: true,
      },
      {
        name: "scan_engine_version",
        type: "text",
        notNull: false,
      },
      {
        name: "scan_result_code",
        type: "text",
        notNull: false,
      },
      {
        name: "uploaded_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "scanned_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "deleted_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "expires_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "created_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["created_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.reconciliation_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "reconciliation_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "reconciliation_id"],
        target: "finance.reconciliation",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.resume_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "resume_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "resume_version_id"],
        target: "career.resume_version",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "files.settlement_attachment",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "settlement_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attachment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "settlement_id"],
        target: "finance.debt_settlement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "attachment_id"],
        target: "files.private_attachment",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.action_revision",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "revision_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "previous_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "change_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "action_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "primary_effective_date",
        type: "date",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "finalized_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
    ],
  },
  {
    kind: "finance.action_tag",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "tag_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "tag_id"],
        target: "core.tag",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.adjustment_detail",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "financial_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "signed_adjustment_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: true,
      },
      {
        name: "reconciliation_id",
        type: "uuid",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "financial_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "financial_account_id", "reconciliation_id"],
        target: "finance.reconciliation",
        targetColumns: ["workspace_id", "financial_account_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_action_detail",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "card_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "posting_date",
        type: "date",
        notNull: true,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "confirmation_source",
        type: "text",
        notNull: true,
      },
      {
        name: "paying_account_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "purchase_action_id",
        type: "uuid",
        notNull: false,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "card_id"],
        target: "finance.credit_card",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "paying_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "purchase_action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_activity",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "card_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "activity_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "transaction_date",
        type: "date",
        notNull: true,
      },
      {
        name: "posting_date",
        type: "date",
        notNull: true,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "signed_liability_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "card_id"],
        target: "finance.credit_card",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_installment",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "plan_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "sequence_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "due_date",
        type: "date",
        notNull: false,
      },
      {
        name: "principal_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "interest_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "fee_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "total_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "plan_revision_id"],
        target: "finance.card_installment_revision",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_installment_application",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "plan_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "installment_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "allocation_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "principal_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "interest_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "fee_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "interest_action_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "fee_action_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "reverses_application_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "confirmation_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "confirmation_source",
        type: "text",
        notNull: true,
      },
      {
        name: "confirmed_date",
        type: "date",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "plan_revision_id", "installment_no"],
        target: "finance.card_installment",
        targetColumns: ["workspace_id", "plan_revision_id", "sequence_no"],
      },
      {
        columns: ["workspace_id", "allocation_id"],
        target: "finance.card_statement_allocation",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "interest_action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "fee_action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_installment_plan",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "card_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "purchase_action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "current_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "card_id"],
        target: "finance.credit_card",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "purchase_action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_installment_revision",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "plan_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "revision_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "previous_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "purchase_action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "principal_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "installment_count",
        type: "integer",
        notNull: true,
      },
      {
        name: "lifecycle",
        type: "text",
        notNull: true,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "verification_source",
        type: "text",
        notNull: true,
      },
      {
        name: "verified_date",
        type: "date",
        notNull: true,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "refund_evidence",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "finalized_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "plan_id"],
        target: "finance.card_installment_plan",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "purchase_action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_refund_part",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "original_purchase_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "refund_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.card_action_detail",
        targetColumns: ["workspace_id", "action_id", "action_revision_id"],
      },
      {
        columns: ["workspace_id", "original_purchase_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_revision_id", "refund_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "action_revision_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_statement",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "card_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "current_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "card_id"],
        target: "finance.credit_card",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_statement_allocation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "statement_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "source_action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "reverses_allocation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "confirmation_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "confirmation_source",
        type: "text",
        notNull: true,
      },
      {
        name: "confirmed_date",
        type: "date",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "statement_revision_id"],
        target: "finance.card_statement_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "source_action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_statement_entry",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "statement_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "line_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "description",
        type: "text",
        notNull: true,
      },
      {
        name: "posting_date",
        type: "date",
        notNull: false,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "statement_revision_id"],
        target: "finance.card_statement_revision",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.card_statement_revision",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "statement_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "revision_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "previous_revision_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "cycle_start",
        type: "date",
        notNull: true,
      },
      {
        name: "cycle_end",
        type: "date",
        notNull: true,
      },
      {
        name: "statement_date",
        type: "date",
        notNull: true,
      },
      {
        name: "due_date",
        type: "date",
        notNull: true,
      },
      {
        name: "balance_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "minimum_due_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "opening_balance_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "verification_source",
        type: "text",
        notNull: true,
      },
      {
        name: "verified_date",
        type: "date",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "finalized_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "statement_id"],
        target: "finance.card_statement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.credit_card",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "issuer_name",
        type: "text",
        notNull: true,
      },
      {
        name: "liability_ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "credit_limit_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "limit_verified_date",
        type: "date",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "liability_ledger_account_id", "currency"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id", "currency"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
    ],
  },
  {
    kind: "finance.debt",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "lender_name",
        type: "text",
        notNull: true,
      },
      {
        name: "product_name",
        type: "text",
        notNull: false,
      },
      {
        name: "debt_type",
        type: "text",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "liability_ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "clearing_ledger_account_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "original_principal_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "start_date",
        type: "date",
        notNull: true,
      },
      {
        name: "opening_cutoff_date",
        type: "date",
        notNull: false,
      },
      {
        name: "breakdown_status",
        type: "text",
        notNull: true,
      },
      {
        name: "lifecycle",
        type: "text",
        notNull: true,
      },
      {
        name: "current_schedule_version_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "closed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
      {
        columns: ["workspace_id", "liability_ledger_account_id", "currency"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id", "currency"],
      },
      {
        columns: ["workspace_id", "clearing_ledger_account_id", "currency"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id", "currency"],
      },
    ],
  },
  {
    kind: "finance.debt_action_link",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "purpose",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.debt_obligation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "external_label",
        type: "text",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.debt_payment",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.debt_payment_revision",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "paid_against_schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "paying_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "actual_paid_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "contractual_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "external_fee_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "unapplied_contractual_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "allocation_certainty",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_id"],
        target: "finance.debt_payment",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "payment_id", "action_id"],
        target: "finance.debt_payment",
        targetColumns: ["workspace_id", "id", "action_id"],
      },
      {
        columns: [
          "workspace_id",
          "debt_id",
          "paid_against_schedule_version_id",
        ],
        target: "finance.debt_schedule_version",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "paying_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.debt_schedule_version",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "version_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "previous_version_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "effective_date",
        type: "date",
        notNull: true,
      },
      {
        name: "revision_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: true,
      },
      {
        name: "frequency",
        type: "text",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "finalized_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.debt_settlement",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "prior_schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "closing_schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "settlement_date",
        type: "date",
        notNull: true,
      },
      {
        name: "confirmed_payoff_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "actual_cash_paid_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "settlement_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "reason",
        type: "text",
        notNull: true,
      },
      {
        name: "resolved_unapplied_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "unapplied_resolution_note",
        type: "text",
        notNull: false,
      },
      {
        name: "confirmation_source",
        type: "text",
        notNull: true,
      },
      {
        name: "confirmation_note",
        type: "text",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_id"],
        target: "finance.debt_payment",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "prior_schedule_version_id"],
        target: "finance.debt_schedule_version",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "closing_schedule_version_id"],
        target: "finance.debt_schedule_version",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
    ],
  },
  {
    kind: "finance.fee_component",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "effective_date",
        type: "date",
        notNull: true,
      },
      {
        name: "bearing_ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "expense_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "treatment",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "bearing_ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_revision_id", "expense_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "action_revision_id", "id"],
      },
    ],
  },
  {
    kind: "finance.financial_account",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "account_type",
        type: "text",
        notNull: true,
      },
      {
        name: "institution_name",
        type: "text",
        notNull: false,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "opening_cutoff_date",
        type: "date",
        notNull: true,
      },
      {
        name: "opening_action_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
    ],
  },
  {
    kind: "finance.financial_action",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "original_command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "current_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "description",
        type: "text",
        notNull: true,
      },
      {
        name: "reference",
        type: "text",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "original_command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.journal",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "sequence_no",
        type: "smallint",
        notNull: true,
      },
      {
        name: "effective_date",
        type: "date",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "role",
        type: "text",
        notNull: true,
      },
      {
        name: "reverses_journal_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "finalized_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
    ],
  },
  {
    kind: "finance.ledger_account",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "code",
        type: "text",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "kind",
        type: "text",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "currency"],
        target: "core.workspace",
        targetColumns: ["id", "currency"],
      },
    ],
  },
  {
    kind: "finance.payment_component",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "disposition",
        type: "text",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "fee_component_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_revision_id"],
        target: "finance.debt_payment_revision",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "fee_component_id"],
        target: "finance.fee_component",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.payment_due_allocation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "installment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_revision_id"],
        target: "finance.debt_payment_revision",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: [
          "workspace_id",
          "debt_id",
          "schedule_version_id",
          "installment_id",
        ],
        target: "finance.scheduled_installment",
        targetColumns: ["workspace_id", "debt_id", "schedule_version_id", "id"],
      },
    ],
  },
  {
    kind: "finance.payment_reclassification",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "source_component_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "clearing_credit_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_id"],
        target: "finance.debt_payment",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "source_component_id"],
        target: "finance.payment_component",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: [
          "workspace_id",
          "action_revision_id",
          "clearing_credit_posting_id",
        ],
        target: "finance.posting",
        targetColumns: ["workspace_id", "action_revision_id", "id"],
      },
    ],
  },
  {
    kind: "finance.posting",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "journal_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "line_no",
        type: "smallint",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "category_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "expense_class",
        type: "text",
        notNull: true,
      },
      {
        name: "income_class",
        type: "text",
        notNull: true,
      },
      {
        name: "cash_flow_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "cash_flow_direction",
        type: "text",
        notNull: true,
      },
      {
        name: "liability_component",
        type: "text",
        notNull: false,
      },
      {
        name: "reverses_posting_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "memo",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: [
          "workspace_id",
          "action_revision_id",
          "journal_id",
          "currency",
        ],
        target: "finance.journal",
        targetColumns: ["workspace_id", "action_revision_id", "id", "currency"],
      },
      {
        columns: ["workspace_id", "ledger_account_id", "currency"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id", "currency"],
      },
      {
        columns: ["workspace_id", "category_id"],
        target: "core.category",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.purchase_detail",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "funding_ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "purchase_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "merchant_name",
        type: "text",
        notNull: false,
      },
      {
        name: "card_posting_date",
        type: "date",
        notNull: false,
      },
      {
        name: "card_provider_reference",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "funding_ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.receipt_detail",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "receiving_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "actual_received_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "sender_name",
        type: "text",
        notNull: false,
      },
      {
        name: "source_label",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "receiving_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.reconciliation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "financial_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "cutoff_date",
        type: "date",
        notNull: true,
      },
      {
        name: "observed_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "calculated_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "financial_revision",
        type: "bigint",
        notNull: true,
      },
      {
        name: "source_journal_count",
        type: "bigint",
        notNull: true,
      },
      {
        name: "reference",
        type: "text",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "supersedes_reconciliation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "financial_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.refund_allocation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "original_purchase_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "refund_posting_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "allocation_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.refund_detail",
        targetColumns: ["workspace_id", "action_id", "action_revision_id"],
      },
      {
        columns: ["workspace_id", "original_purchase_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_revision_id", "refund_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "action_revision_id", "id"],
      },
    ],
  },
  {
    kind: "finance.refund_detail",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "purchase_action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "refund_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "destination_ledger_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "purchase_action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "destination_ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.schedule_allocation_map",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "target_schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "payment_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "source_allocation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "source_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "target_installment_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "target_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id", "payment_revision_id"],
        target: "finance.debt_payment_revision",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: [
          "workspace_id",
          "debt_id",
          "payment_revision_id",
          "source_allocation_id",
        ],
        target: "finance.payment_due_allocation",
        targetColumns: ["workspace_id", "debt_id", "payment_revision_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "target_schedule_version_id"],
        target: "finance.debt_schedule_version",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: [
          "workspace_id",
          "debt_id",
          "target_schedule_version_id",
          "target_installment_id",
        ],
        target: "finance.scheduled_installment",
        targetColumns: ["workspace_id", "debt_id", "schedule_version_id", "id"],
      },
    ],
  },
  {
    kind: "finance.scheduled_installment",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "debt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "schedule_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "obligation_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "sequence_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "due_date",
        type: "date",
        notNull: true,
      },
      {
        name: "contractual_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "known_principal_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "known_interest_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "known_fee_minor",
        type: "bigint",
        notNull: false,
      },
      {
        name: "breakdown_complete",
        type: "boolean",
        notNull: true,
      },
      {
        name: "opening_satisfied_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "disposition",
        type: "text",
        notNull: true,
      },
      {
        name: "cancellation_reason",
        type: "text",
        notNull: false,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "debt_id"],
        target: "finance.debt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "schedule_version_id"],
        target: "finance.debt_schedule_version",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_id", "obligation_id"],
        target: "finance.debt_obligation",
        targetColumns: ["workspace_id", "debt_id", "id"],
      },
    ],
  },
  {
    kind: "finance.settlement_component",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "settlement_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "component_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "amount_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "recognized_source_posting_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "effect_posting_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "counter_posting_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "liability_component",
        type: "text",
        notNull: false,
      },
      {
        name: "rounding_treatment",
        type: "text",
        notNull: false,
      },
      {
        name: "unknown_opening",
        type: "boolean",
        notNull: true,
      },
      {
        name: "explanation",
        type: "text",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "settlement_id"],
        target: "finance.debt_settlement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "recognized_source_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "effect_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "counter_posting_id"],
        target: "finance.posting",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.transfer_detail",
    columns: [
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "source_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "destination_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "source_principal_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "destination_principal_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "withheld_fee_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: [],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "source_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "destination_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "ops.import_batch",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "source_format",
        type: "text",
        notNull: true,
      },
      {
        name: "format_version",
        type: "integer",
        notNull: true,
      },
      {
        name: "file_checksum",
        type: "bytea",
        notNull: true,
      },
      {
        name: "mapping_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "date_interpretation",
        type: "text",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "target_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "cutoff_strategy",
        type: "text",
        notNull: true,
      },
      {
        name: "cutoff_date",
        type: "date",
        notNull: true,
      },
      {
        name: "preview_hash",
        type: "bytea",
        notNull: true,
      },
      {
        name: "confirmed_preview_hash",
        type: "bytea",
        notNull: false,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "preview_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "decisions_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "confirmed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "expires_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "target_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "ops.import_row",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "batch_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "row_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "source_row_hash",
        type: "bytea",
        notNull: true,
      },
      {
        name: "normalized_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "validation_errors_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "duplicate_candidate_action_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "client_command_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "financial_action_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "job_application_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "safe_error_code",
        type: "text",
        notNull: false,
      },
      {
        name: "processed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "batch_id"],
        target: "ops.import_batch",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "financial_action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "duplicate_candidate_action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "job_application_id"],
        target: "career.job_application",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.budget",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "category_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "start_date",
        type: "date",
        notNull: true,
      },
      {
        name: "end_date_exclusive",
        type: "date",
        notNull: true,
      },
      {
        name: "limit_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "write_revision",
        type: "bigint",
        notNull: true,
      },
      {
        name: "basis",
        type: "text",
        notNull: true,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "category_id"],
        target: "core.category",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.expected_occurrence",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "obligation_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recurrence_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "logical_date",
        type: "date",
        notNull: true,
      },
      {
        name: "generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "due_date",
        type: "date",
        notNull: true,
      },
      {
        name: "expected_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "override_reason",
        type: "text",
        notNull: false,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "notification_generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "obligation_id", "recurrence_version_id"],
        target: "planning.recurrence_version",
        targetColumns: ["workspace_id", "obligation_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.goal_reservation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "goal_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "financial_account_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "reserved_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "write_revision",
        type: "bigint",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "goal_id"],
        target: "planning.savings_goal",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "financial_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.occurrence_actual_link",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "occurrence_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "action_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "linked_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "reverses_link_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "occurrence_id"],
        target: "planning.expected_occurrence",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.recurrence_version",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "obligation_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "version_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "previous_version_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "effective_from",
        type: "date",
        notNull: true,
      },
      {
        name: "frequency",
        type: "text",
        notNull: true,
      },
      {
        name: "interval_count",
        type: "integer",
        notNull: true,
      },
      {
        name: "weekdays",
        type: "integer[]",
        notNull: false,
      },
      {
        name: "day_of_month",
        type: "integer",
        notNull: false,
      },
      {
        name: "short_month_policy",
        type: "text",
        notNull: false,
      },
      {
        name: "ends_on",
        type: "date",
        notNull: false,
      },
      {
        name: "occurrence_limit",
        type: "integer",
        notNull: false,
      },
      {
        name: "expected_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "currency",
        type: "text",
        notNull: true,
      },
      {
        name: "category_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "default_account_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "timezone",
        type: "text",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
        notNull: false,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "obligation_id"],
        target: "planning.recurring_obligation",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "category_id"],
        target: "core.category",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "default_account_id"],
        target: "finance.financial_account",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.recurring_obligation",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "kind",
        type: "text",
        notNull: true,
      },
      {
        name: "current_version_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "archived_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "planning.savings_goal",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "target_minor",
        type: "bigint",
        notNull: true,
      },
      {
        name: "target_date",
        type: "date",
        notNull: false,
      },
      {
        name: "status",
        type: "text",
        notNull: true,
      },
      {
        name: "notes",
        type: "text",
        notNull: false,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "write_revision",
        type: "bigint",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.notification_attempt",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "delivery_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "attempt_no",
        type: "integer",
        notNull: true,
      },
      {
        name: "outcome",
        type: "text",
        notNull: true,
      },
      {
        name: "recipient_fingerprint",
        type: "text",
        notNull: true,
      },
      {
        name: "started_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "finished_at",
        type: "timestamp with time zone",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "delivery_id"],
        target: "time.notification_delivery",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.notification_delivery",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "reminder_occurrence_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "logical_key",
        type: "text",
        notNull: true,
      },
      {
        name: "status",
        type: "text",
        notNull: true,
      },
      {
        name: "scheduled_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "provider_message_id",
        type: "text",
        notNull: false,
      },
      {
        name: "accepted_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "delivered_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "last_error_code",
        type: "text",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "reminder_occurrence_id"],
        target: "time.reminder_occurrence",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.notification_preference",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "enabled",
        type: "boolean",
        notNull: true,
      },
      {
        name: "enabled_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "timezone",
        type: "text",
        notNull: false,
      },
      {
        name: "quiet_start",
        type: "text",
        notNull: false,
      },
      {
        name: "quiet_end",
        type: "text",
        notNull: false,
      },
      {
        name: "include_due_date",
        type: "boolean",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "command_receipt_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.notification_provider_event",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "delivery_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "provider_event_id",
        type: "text",
        notNull: true,
      },
      {
        name: "event_type",
        type: "text",
        notNull: true,
      },
      {
        name: "occurred_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "received_at",
        type: "timestamp with time zone",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "delivery_id"],
        target: "time.notification_delivery",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.personal_event",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "title",
        type: "text",
        notNull: true,
      },
      {
        name: "temporal_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "event_date",
        type: "date",
        notNull: false,
      },
      {
        name: "end_date_exclusive",
        type: "date",
        notNull: false,
      },
      {
        name: "starts_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "ends_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "timezone",
        type: "text",
        notNull: false,
      },
      {
        name: "status",
        type: "text",
        notNull: true,
      },
      {
        name: "description",
        type: "text",
        notNull: false,
      },
      {
        name: "location",
        type: "text",
        notNull: false,
      },
      {
        name: "reference_url",
        type: "text",
        notNull: false,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "notification_generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "actor_kind",
        type: "text",
        notNull: true,
      },
      {
        name: "request_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "time.reminder_occurrence",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "personal_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "application_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "debt_obligation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_statement_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_installment_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "expected_occurrence_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "rule_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "occurrence_key",
        type: "text",
        notNull: true,
      },
      {
        name: "source_generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "rule_generation",
        type: "integer",
        notNull: true,
      },
      {
        name: "scheduled_for",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "snoozed_until",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "dismissed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "cancellation_reason",
        type: "text",
        notNull: false,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "expected_occurrence_id"],
        target: "planning.expected_occurrence",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_statement_id"],
        target: "finance.card_statement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_installment_id"],
        target: "finance.card_installment",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "rule_id"],
        target: "time.reminder_rule",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "personal_event_id"],
        target: "time.personal_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "application_event_id"],
        target: "career.application_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_obligation_id"],
        target: "finance.debt_obligation",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.reminder_rule",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "personal_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "application_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "debt_obligation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_statement_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_installment_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "expected_occurrence_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "module_key",
        type: "text",
        notNull: false,
      },
      {
        name: "channel",
        type: "text",
        notNull: true,
      },
      {
        name: "offset_days",
        type: "integer",
        notNull: true,
      },
      {
        name: "local_time",
        type: "time",
        notNull: true,
      },
      {
        name: "enabled",
        type: "boolean",
        notNull: true,
      },
      {
        name: "generation",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "expected_occurrence_id"],
        target: "planning.expected_occurrence",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_statement_id"],
        target: "finance.card_statement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_installment_id"],
        target: "finance.card_installment",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "personal_event_id"],
        target: "time.personal_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "application_event_id"],
        target: "career.application_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_obligation_id"],
        target: "finance.debt_obligation",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "time.source_reminder_setting",
    columns: [
      {
        name: "id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "workspace_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "personal_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "application_event_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "debt_obligation_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_statement_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "card_installment_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "expected_occurrence_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "version",
        type: "integer",
        notNull: true,
      },
      {
        name: "mode",
        type: "text",
        notNull: true,
      },
      {
        name: "notification_generation",
        type: "integer",
        notNull: true,
      },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "expected_occurrence_id"],
        target: "planning.expected_occurrence",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_statement_id"],
        target: "finance.card_statement",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "card_installment_id"],
        target: "finance.card_installment",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "personal_event_id"],
        target: "time.personal_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "application_event_id"],
        target: "career.application_event",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "debt_obligation_id"],
        target: "finance.debt_obligation",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "finance.group_ledger_binding",
    columns: [
      { name: "id", type: "uuid", notNull: true },
      { name: "workspace_id", type: "uuid", notNull: true },
      { name: "group_id", type: "uuid", notNull: true },
      { name: "participant_id", type: "uuid", notNull: true },
      { name: "receivable_ledger_account_id", type: "uuid", notNull: true },
      { name: "payable_ledger_account_id", type: "uuid", notNull: true },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["group_id", "participant_id"],
        target: "sharing.participant",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["workspace_id", "payable_ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "receivable_ledger_account_id"],
        target: "finance.ledger_account",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "finance.private_group_link",
    columns: [
      { name: "id", type: "uuid", notNull: true },
      { name: "workspace_id", type: "uuid", notNull: true },
      { name: "group_id", type: "uuid", notNull: true },
      { name: "participant_id", type: "uuid", notNull: true },
      { name: "expense_id", type: "uuid", notNull: false },
      { name: "purpose", type: "text", notNull: true },
      { name: "action_id", type: "uuid", notNull: true },
      { name: "current_link_revision_id", type: "uuid", notNull: true },
      { name: "created_at", type: "timestamp with time zone", notNull: true },
      { name: "refund_id", type: "uuid", notNull: false },
      { name: "settlement_id", type: "uuid", notNull: false },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id", "action_id"],
        target: "finance.financial_action",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "id", "current_link_revision_id"],
        target: "finance.private_group_link_revision",
        targetColumns: ["workspace_id", "link_id", "id"],
      },
      {
        columns: ["group_id", "expense_id"],
        target: "sharing.shared_expense",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["group_id", "participant_id"],
        target: "sharing.participant",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["group_id", "refund_id"],
        target: "sharing.refund",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["group_id", "settlement_id"],
        target: "sharing.settlement",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "finance.private_group_link_revision",
    columns: [
      { name: "id", type: "uuid", notNull: true },
      { name: "workspace_id", type: "uuid", notNull: true },
      { name: "link_id", type: "uuid", notNull: true },
      { name: "group_id", type: "uuid", notNull: true },
      { name: "participant_id", type: "uuid", notNull: true },
      { name: "expense_id", type: "uuid", notNull: false },
      { name: "source_expense_revision_id", type: "uuid", notNull: false },
      { name: "action_id", type: "uuid", notNull: true },
      { name: "action_revision_id", type: "uuid", notNull: true },
      { name: "revision_no", type: "integer", notNull: true },
      { name: "previous_link_revision_id", type: "uuid", notNull: false },
      { name: "accepted_source_hash", type: "text", notNull: true },
      { name: "adoption_kind", type: "text", notNull: true },
      { name: "paid_minor", type: "bigint", notNull: true },
      { name: "share_minor", type: "bigint", notNull: true },
      { name: "consent_json", type: "jsonb", notNull: true },
      { name: "created_at", type: "timestamp with time zone", notNull: true },
      { name: "source_refund_id", type: "uuid", notNull: false },
      { name: "source_settlement_id", type: "uuid", notNull: false },
      { name: "source_settlement_version", type: "integer", notNull: false },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id", "link_id", "previous_link_revision_id"],
        target: "finance.private_group_link_revision",
        targetColumns: ["workspace_id", "link_id", "id"],
      },
      {
        columns: ["workspace_id", "action_id", "action_revision_id"],
        target: "finance.action_revision",
        targetColumns: ["workspace_id", "action_id", "id"],
      },
      {
        columns: ["workspace_id", "link_id"],
        target: "finance.private_group_link",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["group_id", "source_refund_id"],
        target: "sharing.refund",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["group_id", "source_settlement_id"],
        target: "sharing.settlement",
        targetColumns: ["group_id", "id"],
      },
      {
        columns: ["group_id", "expense_id", "source_expense_revision_id"],
        target: "sharing.expense_revision",
        targetColumns: ["group_id", "expense_id", "id"],
      },
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
  {
    kind: "finance.private_group_review",
    columns: [
      { name: "id", type: "uuid", notNull: true },
      { name: "workspace_id", type: "uuid", notNull: true },
      { name: "link_id", type: "uuid", notNull: true },
      { name: "accepted_link_revision_id", type: "uuid", notNull: true },
      { name: "source_hash", type: "text", notNull: true },
      { name: "reviewed_source_json", type: "jsonb", notNull: true },
      { name: "decision", type: "text", notNull: true },
      { name: "reason", type: "text", notNull: true },
      { name: "command_receipt_id", type: "uuid", notNull: true },
      { name: "created_at", type: "timestamp with time zone", notNull: true },
    ],
    primaryKey: ["id"],
    foreignKeys: [
      {
        columns: ["workspace_id", "link_id", "accepted_link_revision_id"],
        target: "finance.private_group_link_revision",
        targetColumns: ["workspace_id", "link_id", "id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id"],
        target: "core.workspace",
        targetColumns: ["id"],
      },
    ],
  },
];

const reminderKinds = new Set([
  "time.reminder_rule",
  "time.reminder_occurrence",
  "time.source_reminder_setting",
]);
export const graphRegistry: GraphDescriptor[] = legacyV2GraphRegistry
  .map((d) =>
    reminderKinds.has(d.kind)
      ? {
          ...d,
          columns: [
            ...d.columns,
            { name: "tracker_entry_id", type: "uuid", notNull: false },
          ],
          foreignKeys: [
            ...d.foreignKeys,
            {
              columns: ["workspace_id", "tracker_entry_id"],
              target: "tracker.entry",
              targetColumns: ["workspace_id", "id"],
            },
          ],
        }
      : d,
  )
  .concat(trackerGraph);
