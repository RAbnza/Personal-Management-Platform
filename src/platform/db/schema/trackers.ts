import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { trackerSchema } from "./namespaces";
import { workspace, commandReceipt } from "./core";
import { user } from "./auth.generated";
const root = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  commandReceiptId: uuid("command_receipt_id").notNull(),
  recordedByUserId: uuid("recorded_by_user_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
const owned = (
  t: {
    workspaceId: AnyPgColumn;
    id: AnyPgColumn;
    commandReceiptId: AnyPgColumn;
  },
  name: string,
) => [
  unique(`uq_tracker_${name}_scope`).on(t.workspaceId, t.id),
  foreignKey({
    columns: [t.workspaceId, t.commandReceiptId],
    foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
  }),
];
export const trackerTemplate = trackerSchema.table(
  "template",
  {
    ...root(),
    name: text("name").notNull(),
    presetKey: text("preset_key"),
    presetVersion: integer("preset_version"),
    currentVersionId: uuid("current_version_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
  },
  (t) => [
    ...owned(t, "template"),
    check(
      "tracker_preset_pair",
      sql`(${t.presetKey} IS NULL) = (${t.presetVersion} IS NULL)`,
    ),
  ],
);
export const trackerTemplateVersion = trackerSchema.table(
  "template_version",
  {
    ...root(),
    templateId: uuid("template_id").notNull(),
    versionNo: integer("version_no").notNull(),
    previousVersionId: uuid("previous_version_id"),
    state: text("state").default("building").notNull(),
    name: text("name").notNull(),
    titleFieldId: uuid("title_field_id").notNull(),
    statusFieldId: uuid("status_field_id"),
    deadlineFieldId: uuid("deadline_field_id"),
    completionJson: jsonb("completion_json").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    ...owned(t, "version"),
    unique("uq_tracker_version_lineage").on(t.workspaceId, t.templateId, t.id),
    unique("uq_tracker_version_number").on(
      t.workspaceId,
      t.templateId,
      t.versionNo,
    ),
    foreignKey({
      columns: [t.workspaceId, t.templateId],
      foreignColumns: [trackerTemplate.workspaceId, trackerTemplate.id],
    }),
    check(
      "tracker_version_state",
      sql`${t.state} IN ('building','published') AND ${t.versionNo}>0`,
    ),
  ],
);
export const trackerFieldIdentity = trackerSchema.table(
  "field_identity",
  {
    ...root(),
    templateId: uuid("template_id").notNull(),
    stableKey: text("stable_key").notNull(),
  },
  (t) => [
    ...owned(t, "identity"),
    unique("uq_tracker_identity_lineage").on(t.workspaceId, t.templateId, t.id),
    unique("uq_tracker_identity_key").on(
      t.workspaceId,
      t.templateId,
      t.stableKey,
    ),
    foreignKey({
      columns: [t.workspaceId, t.templateId],
      foreignColumns: [trackerTemplate.workspaceId, trackerTemplate.id],
    }),
  ],
);
export const trackerFieldDefinition = trackerSchema.table(
  "field_definition",
  {
    ...root(),
    templateId: uuid("template_id").notNull(),
    templateVersionId: uuid("template_version_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type").notNull(),
    required: boolean("required").notNull(),
    position: integer("position").notNull(),
    validationJson: jsonb("validation_json").notNull(),
    defaultJson: jsonb("default_json"),
    retired: boolean("retired").default(false).notNull(),
  },
  (t) => [
    ...owned(t, "field"),
    unique("uq_tracker_definition_field").on(
      t.workspaceId,
      t.templateVersionId,
      t.fieldId,
    ),
    unique("uq_tracker_definition_version").on(
      t.workspaceId,
      t.templateVersionId,
      t.id,
    ),
    foreignKey({
      columns: [t.workspaceId, t.templateId, t.templateVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.templateId,
        trackerTemplateVersion.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.templateId, t.fieldId],
      foreignColumns: [
        trackerFieldIdentity.workspaceId,
        trackerFieldIdentity.templateId,
        trackerFieldIdentity.id,
      ],
    }),
    check(
      "tracker_field_type",
      sql`${t.fieldType} IN ('text','number','date','checkbox','single_select') AND ${t.position}>=0 AND jsonb_typeof(${t.validationJson})='object'`,
    ),
  ],
);
export const trackerFieldOption = trackerSchema.table(
  "field_option",
  {
    ...root(),
    fieldDefinitionId: uuid("field_definition_id").notNull(),
    optionKey: text("option_key").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    retired: boolean("retired").default(false).notNull(),
  },
  (t) => [
    ...owned(t, "option"),
    unique("uq_tracker_option_key").on(
      t.workspaceId,
      t.fieldDefinitionId,
      t.optionKey,
    ),
    foreignKey({
      columns: [t.workspaceId, t.fieldDefinitionId],
      foreignColumns: [
        trackerFieldDefinition.workspaceId,
        trackerFieldDefinition.id,
      ],
    }),
  ],
);
export const privateTracker = trackerSchema.table(
  "tracker",
  {
    ...root(),
    templateId: uuid("template_id").notNull(),
    templateVersionId: uuid("template_version_id").notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
  },
  (t) => [
    ...owned(t, "tracker"),
    unique("uq_tracker_tracker_lineage").on(t.workspaceId, t.templateId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.templateId, t.templateVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.templateId,
        trackerTemplateVersion.id,
      ],
    }),
  ],
);
export const trackerEntry = trackerSchema.table(
  "entry",
  {
    ...root(),
    trackerId: uuid("tracker_id").notNull(),
    templateVersionId: uuid("template_version_id").notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    title: text("title").notNull(),
    statusKey: text("status_key"),
    deadlineDate: date("deadline_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    notificationGeneration: integer("notification_generation")
      .default(1)
      .notNull(),
    version: integer("version").default(1).notNull(),
  },
  (t) => [
    ...owned(t, "entry"),
    unique("uq_tracker_entry_parent").on(t.workspaceId, t.trackerId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.trackerId],
      foreignColumns: [privateTracker.workspaceId, privateTracker.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.templateVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.id,
      ],
    }),
    index("ix_tracker_entry_list").on(
      t.workspaceId,
      t.trackerId,
      t.statusKey,
      t.id,
    ),
    index("ix_tracker_entry_deadline").on(t.workspaceId, t.deadlineDate, t.id),
    check("tracker_entry_title", sql`length(${t.title}) BETWEEN 1 AND 200`),
  ],
);
export const trackerEntryRevision = trackerSchema.table(
  "entry_revision",
  {
    ...root(),
    entryId: uuid("entry_id").notNull(),
    templateVersionId: uuid("template_version_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    previousRevisionId: uuid("previous_revision_id"),
    valuesJson: jsonb("values_json").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    ...owned(t, "revision"),
    unique("uq_tracker_revision_number").on(
      t.workspaceId,
      t.entryId,
      t.revisionNo,
    ),
    unique("uq_tracker_revision_parent").on(
      t.workspaceId,
      t.entryId,
      t.templateVersionId,
      t.id,
    ),
    foreignKey({
      columns: [t.workspaceId, t.entryId],
      foreignColumns: [trackerEntry.workspaceId, trackerEntry.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.templateVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.id,
      ],
    }),
    check(
      "tracker_values_object",
      sql`jsonb_typeof(${t.valuesJson})='object' AND octet_length(${t.valuesJson}::text)<=24000 AND ${t.revisionNo}>0`,
    ),
  ],
);
export const trackerTemplateMigration = trackerSchema.table(
  "template_migration",
  {
    ...root(),
    trackerId: uuid("tracker_id").notNull(),
    fromVersionId: uuid("from_version_id").notNull(),
    toVersionId: uuid("to_version_id").notNull(),
    mappingJson: jsonb("mapping_json").notNull(),
    state: text("state").default("preview").notNull(),
    previewCountsJson: jsonb("preview_counts_json").notNull(),
    previewHash: text("preview_hash").notNull(),
    lastEntryId: uuid("last_entry_id"),
    migratedCount: integer("migrated_count").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    ...owned(t, "migration"),
    foreignKey({
      columns: [t.workspaceId, t.trackerId],
      foreignColumns: [privateTracker.workspaceId, privateTracker.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.fromVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.toVersionId],
      foreignColumns: [
        trackerTemplateVersion.workspaceId,
        trackerTemplateVersion.id,
      ],
    }),
    foreignKey({
      columns: [t.workspaceId, t.trackerId, t.lastEntryId],
      foreignColumns: [
        trackerEntry.workspaceId,
        trackerEntry.trackerId,
        trackerEntry.id,
      ],
    }),
    uniqueIndex("uq_tracker_running_migration")
      .on(t.workspaceId, t.trackerId)
      .where(
        sql`${t.state} IN ('confirmed','running','failed') OR (${t.state}='cancelled' AND ${t.migratedCount}>0)`,
      ),
    check(
      "tracker_migration_state",
      sql`${t.fromVersionId}<>${t.toVersionId} AND ${t.state} IN ('preview','confirmed','running','completed','failed','cancelled') AND ${t.migratedCount}>=0 AND jsonb_typeof(${t.mappingJson})='object'`,
    ),
  ],
);
