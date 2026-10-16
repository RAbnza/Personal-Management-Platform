import type { GraphDescriptor } from "./graph-registry";
export const trackerGraph: GraphDescriptor[] = [
  {
    kind: "tracker.tracker",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "template_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "template_version_id",
        type: "uuid",
        notNull: true,
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
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "template_id", "template_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "template_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.entry",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "tracker_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "template_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "current_revision_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "title",
        type: "text",
        notNull: true,
      },
      {
        name: "status_key",
        type: "text",
        notNull: false,
      },
      {
        name: "deadline_date",
        type: "date",
        notNull: false,
      },
      {
        name: "completed_at",
        type: "timestamp with time zone",
        notNull: false,
      },
      {
        name: "archived_at",
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
      {
        columns: ["workspace_id", "tracker_id"],
        target: "tracker.tracker",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "template_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.entry_revision",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "entry_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "template_version_id",
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
        name: "values_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
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
      {
        columns: ["workspace_id", "entry_id"],
        target: "tracker.entry",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "template_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.field_definition",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "template_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "template_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "field_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: true,
      },
      {
        name: "field_type",
        type: "text",
        notNull: true,
      },
      {
        name: "required",
        type: "boolean",
        notNull: true,
      },
      {
        name: "position",
        type: "integer",
        notNull: true,
      },
      {
        name: "validation_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "default_json",
        type: "jsonb",
        notNull: false,
      },
      {
        name: "retired",
        type: "boolean",
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
      {
        columns: ["workspace_id", "template_id", "template_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "template_id", "id"],
      },
      {
        columns: ["workspace_id", "template_id", "field_id"],
        target: "tracker.field_identity",
        targetColumns: ["workspace_id", "template_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.field_identity",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "template_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "stable_key",
        type: "text",
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
      {
        columns: ["workspace_id", "template_id"],
        target: "tracker.template",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.field_option",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "field_definition_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "option_key",
        type: "text",
        notNull: true,
      },
      {
        name: "label",
        type: "text",
        notNull: true,
      },
      {
        name: "position",
        type: "integer",
        notNull: true,
      },
      {
        name: "retired",
        type: "boolean",
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
      {
        columns: ["workspace_id", "field_definition_id"],
        target: "tracker.field_definition",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.template",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "preset_key",
        type: "text",
        notNull: false,
      },
      {
        name: "preset_version",
        type: "integer",
        notNull: false,
      },
      {
        name: "current_version_id",
        type: "uuid",
        notNull: true,
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
    kind: "tracker.template_migration",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "tracker_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "from_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "to_version_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "mapping_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "preview_counts_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "preview_hash",
        type: "text",
        notNull: true,
      },
      {
        name: "last_entry_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "migrated_count",
        type: "integer",
        notNull: true,
      },
      {
        name: "completed_at",
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
        columns: ["recorded_by_user_id"],
        target: "auth.user",
        targetColumns: ["id"],
      },
      {
        columns: ["workspace_id", "command_receipt_id"],
        target: "core.command_receipt",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "tracker_id"],
        target: "tracker.tracker",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "from_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "to_version_id"],
        target: "tracker.template_version",
        targetColumns: ["workspace_id", "id"],
      },
      {
        columns: ["workspace_id", "tracker_id", "last_entry_id"],
        target: "tracker.entry",
        targetColumns: ["workspace_id", "tracker_id", "id"],
      },
    ],
  },
  {
    kind: "tracker.template_version",
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
        name: "recorded_by_user_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "created_at",
        type: "timestamp with time zone",
        notNull: true,
      },
      {
        name: "template_id",
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
        name: "state",
        type: "text",
        notNull: true,
      },
      {
        name: "name",
        type: "text",
        notNull: true,
      },
      {
        name: "title_field_id",
        type: "uuid",
        notNull: true,
      },
      {
        name: "status_field_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "deadline_field_id",
        type: "uuid",
        notNull: false,
      },
      {
        name: "completion_json",
        type: "jsonb",
        notNull: true,
      },
      {
        name: "reason",
        type: "text",
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
      {
        columns: ["workspace_id", "template_id"],
        target: "tracker.template",
        targetColumns: ["workspace_id", "id"],
      },
    ],
  },
];
