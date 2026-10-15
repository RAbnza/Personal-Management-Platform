import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  text,
  uuid,
  timestamp,
  date,
  jsonb,
  check,
  unique,
  index,
  primaryKey,
  foreignKey,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { filesSchema, opsSchema } from "./namespaces";
import { workspace, commandReceipt } from "./core";
import { user } from "./auth.generated";
import { financialAction, financialAccount, debt } from "./finance";
import { debtSettlement } from "./debt-settlements";
import { reconciliation } from "./reconciliation";
import { cardStatementRevision } from "./card-statements";
import { jobApplication, applicationEvent, resumeVersion } from "./career";
import { exportRun } from "./exports";
const stamp = (n: string) => timestamp(n, { withTimezone: true });
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
const scope = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  createdAt: stamp("created_at").notNull().defaultNow(),
});
export const privateAttachment = filesSchema.table(
  "private_attachment",
  {
    ...scope(),
    unlinkedAt: stamp("unlinked_at"),
    scanLeaseUntil: stamp("scan_lease_until"),
    scanClaimId: uuid("scan_claim_id"),
    objectKey: text("object_key").notNull().unique(),
    bucketKey: text("bucket_key").notNull().default("evidence"),
    objectVersion: text("object_version"),
    originalFilename: text("original_filename").notNull(),
    declaredMime: text("declared_mime").notNull(),
    verifiedMime: text("verified_mime"),
    declaredBytes: bigint("declared_bytes", { mode: "bigint" }).notNull(),
    actualBytes: bigint("actual_bytes", { mode: "bigint" }),
    checksumSha256: bytes("checksum_sha256"),
    status: text("status").notNull().default("pending_upload"),
    scanEngineVersion: text("scan_engine_version"),
    scanResultCode: text("scan_result_code"),
    uploadedAt: stamp("uploaded_at"),
    scannedAt: stamp("scanned_at"),
    deletedAt: stamp("deleted_at"),
    expiresAt: stamp("expires_at").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => user.id),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("uq_attachment_scope_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_attachment_scope_status").on(
      t.workspaceId,
      t.status,
      t.createdAt,
      t.id,
    ),
    check(
      "ck_attachment_fields",
      sql`${t.version}>0 AND char_length(${t.originalFilename}) BETWEEN 1 AND 200 AND ${t.declaredBytes} BETWEEN 1 AND 10485760 AND (${t.actualBytes} IS NULL OR ${t.actualBytes} BETWEEN 1 AND ${t.declaredBytes}) AND (${t.checksumSha256} IS NULL OR octet_length(${t.checksumSha256})=32) AND ${t.status} IN ('pending_upload','quarantined','available','rejected','deleting','deleted') AND ${t.declaredMime} IN ('application/pdf','image/jpeg','image/png') AND (${t.status}<>'available' OR (${t.verifiedMime}=${t.declaredMime} AND ${t.actualBytes}=${t.declaredBytes} AND ${t.checksumSha256} IS NOT NULL AND ${t.scanResultCode}='passed' AND ${t.scanEngineVersion} IS NOT NULL AND ${t.scannedAt} IS NOT NULL AND ${t.uploadedAt} IS NOT NULL)) AND (${t.status}<>'deleted' OR ${t.deletedAt} IS NOT NULL)`,
    ),
  ],
);
function link(
  name: string,
  column: string,
  source: { workspaceId: AnyPgColumn; id: AnyPgColumn },
) {
  return filesSchema.table(
    name,
    {
      workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspace.id),
      sourceId: uuid(column).notNull(),
      attachmentId: uuid("attachment_id").notNull(),
      label: text("label"),
    },
    (t) => [
      primaryKey({
        name: name + "_pk",
        columns: [t.workspaceId, t.sourceId, t.attachmentId],
      }),
      foreignKey({
        name: name + "_source_fk",
        columns: [t.workspaceId, t.sourceId],
        foreignColumns: [source.workspaceId, source.id],
      }),
      foreignKey({
        name: name + "_attachment_fk",
        columns: [t.workspaceId, t.attachmentId],
        foreignColumns: [privateAttachment.workspaceId, privateAttachment.id],
      }),
      index(name + "_reverse").on(t.workspaceId, t.attachmentId, t.sourceId),
      check(
        name + "_label",
        sql`${t.label} IS NULL OR char_length(${t.label})<=200`,
      ),
    ],
  );
}
export const actionAttachment = link(
  "action_attachment",
  "action_id",
  financialAction,
);
export const debtAttachment = link("debt_attachment", "debt_id", debt);
export const settlementAttachment = link(
  "settlement_attachment",
  "settlement_id",
  debtSettlement,
);
export const reconciliationAttachment = link(
  "reconciliation_attachment",
  "reconciliation_id",
  reconciliation,
);
export const cardStatementAttachment = link(
  "card_statement_attachment",
  "card_statement_revision_id",
  cardStatementRevision,
);
export const applicationAttachment = link(
  "application_attachment",
  "application_id",
  jobApplication,
);
export const applicationEventAttachment = link(
  "application_event_attachment",
  "application_event_id",
  applicationEvent,
);
export const resumeAttachment = link(
  "resume_attachment",
  "resume_version_id",
  resumeVersion,
);
export const importBatch = opsSchema.table(
  "import_batch",
  {
    ...scope(),
    sourceFormat: text("source_format").notNull(),
    formatVersion: integer("format_version").notNull(),
    fileChecksum: bytes("file_checksum").notNull(),
    mappingJson: jsonb("mapping_json").notNull(),
    dateInterpretation: text("date_interpretation").notNull(),
    currency: text("currency").notNull(),
    targetAccountId: uuid("target_account_id").notNull(),
    cutoffStrategy: text("cutoff_strategy").notNull(),
    cutoffDate: date("cutoff_date").notNull(),
    previewHash: bytes("preview_hash").notNull(),
    confirmedPreviewHash: bytes("confirmed_preview_hash"),
    state: text("state").notNull().default("previewed"),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    previewJson: jsonb("preview_json").notNull(),
    decisionsJson: jsonb("decisions_json"),
    confirmedAt: stamp("confirmed_at"),
    expiresAt: stamp("expires_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("uq_import_batch_scope_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.targetAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    index("ix_import_checksum").on(t.workspaceId, t.fileChecksum),
    check(
      "ck_import_batch",
      sql`${t.formatVersion}=1 AND ${t.sourceFormat}='pmp-cash-activity' AND ${t.currency}='PHP' AND ${t.cutoffStrategy} IN ('after_opening','rebase_history') AND octet_length(${t.fileChecksum})=32 AND octet_length(${t.previewHash})=32 AND (${t.confirmedPreviewHash} IS NULL OR ${t.confirmedPreviewHash}=${t.previewHash}) AND ${t.state} IN ('previewed','confirmed','running','completed','partial','cancelled','failed') AND ${t.version}>0`,
    ),
  ],
);
export const importRow = opsSchema.table(
  "import_row",
  {
    ...scope(),
    batchId: uuid("batch_id").notNull(),
    rowNo: integer("row_no").notNull(),
    sourceRowHash: bytes("source_row_hash").notNull(),
    normalizedJson: jsonb("normalized_json"),
    validationErrorsJson: jsonb("validation_errors_json").notNull(),
    duplicateCandidateActionId: uuid("duplicate_candidate_action_id"),
    state: text("state").notNull(),
    clientCommandId: uuid("client_command_id").notNull(),
    commandReceiptId: uuid("command_receipt_id"),
    financialActionId: uuid("financial_action_id"),
    jobApplicationId: uuid("job_application_id"),
    safeErrorCode: text("safe_error_code"),
    processedAt: stamp("processed_at"),
  },
  (t) => [
    unique("uq_import_row_scope_id").on(t.workspaceId, t.id),
    unique("uq_import_row_number").on(t.workspaceId, t.batchId, t.rowNo),
    unique("uq_import_row_command").on(t.workspaceId, t.clientCommandId),
    foreignKey({
      columns: [t.workspaceId, t.batchId],
      foreignColumns: [importBatch.workspaceId, importBatch.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.financialActionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.duplicateCandidateActionId],
      foreignColumns: [financialAction.workspaceId, financialAction.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.jobApplicationId],
      foreignColumns: [jobApplication.workspaceId, jobApplication.id],
    }),
    check(
      "ck_import_row",
      sql`${t.rowNo} BETWEEN 1 AND 500 AND octet_length(${t.sourceRowHash})=32 AND ${t.state} IN ('invalid','ready','skipped','posted','failed') AND (${t.state}<>'posted' OR (${t.commandReceiptId} IS NOT NULL AND ${t.processedAt} IS NOT NULL AND ((${t.financialActionId} IS NOT NULL)::int+(${t.jobApplicationId} IS NOT NULL)::int)=1))`,
    ),
  ],
);
export const restoreRun = opsSchema.table(
  "restore_run",
  {
    ...scope(),
    manifestVersion: integer("manifest_version").notNull(),
    bundleChecksum: bytes("bundle_checksum").notNull(),
    mode: text("mode").notNull().default("replace_private_workspace"),
    state: text("state").notNull().default("previewed"),
    stagingReference: text("staging_reference").notNull(),
    previewJson: jsonb("preview_json").notNull(),
    previewHash: bytes("preview_hash").notNull(),
    bundleJson: jsonb("bundle_json").notNull(),
    recoveryJson: jsonb("recovery_json"),
    confirmedAt: stamp("confirmed_at"),
    startedAt: stamp("started_at"),
    completedAt: stamp("completed_at"),
    lastErrorCode: text("last_error_code"),
    expectedFinancialRevision: bigint("expected_financial_revision", {
      mode: "bigint",
    }).notNull(),
    applyTransaction: text("apply_transaction"),
    expiresAt: stamp("expires_at").notNull(),
    commandReceiptId: uuid("command_receipt_id").notNull(),
    recoveryExportRunId: uuid("recovery_export_run_id"),
  },
  (t) => [
    unique("uq_restore_run_scope_id").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.commandReceiptId],
      foreignColumns: [commandReceipt.workspaceId, commandReceipt.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.recoveryExportRunId],
      foreignColumns: [exportRun.workspaceId, exportRun.id],
    }),
    check(
      "ck_restore_run",
      sql`${t.mode}='replace_private_workspace' AND ${t.manifestVersion}>0 AND octet_length(${t.bundleChecksum})=32 AND octet_length(${t.previewHash})=32 AND ${t.state} IN ('previewed','applying','completed','failed','cancelled') AND ${t.expectedFinancialRevision}>=0`,
    ),
  ],
);
export const restoreIdMap = opsSchema.table(
  "restore_id_map",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    restoreRunId: uuid("restore_run_id").notNull(),
    entityKind: text("entity_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    targetId: uuid("target_id").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.restoreRunId, t.entityKind, t.sourceId],
    }),
    unique("uq_restore_target_id").on(
      t.workspaceId,
      t.restoreRunId,
      t.entityKind,
      t.targetId,
    ),
    foreignKey({
      columns: [t.workspaceId, t.restoreRunId],
      foreignColumns: [restoreRun.workspaceId, restoreRun.id],
    }),
  ],
);
