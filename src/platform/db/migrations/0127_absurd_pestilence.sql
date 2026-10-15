CREATE SCHEMA "files";
--> statement-breakpoint
CREATE TABLE "files"."action_attachment" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "action_attachment_pk" PRIMARY KEY("workspace_id","action_id","attachment_id"),
	CONSTRAINT "action_attachment_label" CHECK ("files"."action_attachment"."label" IS NULL OR char_length("files"."action_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "files"."application_attachment" (
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "application_attachment_pk" PRIMARY KEY("workspace_id","application_id","attachment_id"),
	CONSTRAINT "application_attachment_label" CHECK ("files"."application_attachment"."label" IS NULL OR char_length("files"."application_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "files"."application_event_attachment" (
	"workspace_id" uuid NOT NULL,
	"application_event_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "application_event_attachment_pk" PRIMARY KEY("workspace_id","application_event_id","attachment_id"),
	CONSTRAINT "application_event_attachment_label" CHECK ("files"."application_event_attachment"."label" IS NULL OR char_length("files"."application_event_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "files"."card_statement_attachment" (
	"workspace_id" uuid NOT NULL,
	"card_statement_revision_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "card_statement_attachment_pk" PRIMARY KEY("workspace_id","card_statement_revision_id","attachment_id"),
	CONSTRAINT "card_statement_attachment_label" CHECK ("files"."card_statement_attachment"."label" IS NULL OR char_length("files"."card_statement_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "files"."debt_attachment" (
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "debt_attachment_pk" PRIMARY KEY("workspace_id","debt_id","attachment_id"),
	CONSTRAINT "debt_attachment_label" CHECK ("files"."debt_attachment"."label" IS NULL OR char_length("files"."debt_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "ops"."import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_format" text NOT NULL,
	"format_version" integer NOT NULL,
	"file_checksum" "bytea" NOT NULL,
	"mapping_json" jsonb NOT NULL,
	"date_interpretation" text NOT NULL,
	"currency" text NOT NULL,
	"target_account_id" uuid NOT NULL,
	"cutoff_strategy" text NOT NULL,
	"cutoff_date" date NOT NULL,
	"preview_hash" "bytea" NOT NULL,
	"confirmed_preview_hash" "bytea",
	"state" text DEFAULT 'previewed' NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"preview_json" jsonb NOT NULL,
	"decisions_json" jsonb,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_import_batch_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_import_batch" CHECK ("ops"."import_batch"."format_version"=1 AND "ops"."import_batch"."source_format"='pmp-cash-activity' AND "ops"."import_batch"."currency"='PHP' AND "ops"."import_batch"."cutoff_strategy" IN ('after_opening','rebase_history') AND octet_length("ops"."import_batch"."file_checksum")=32 AND octet_length("ops"."import_batch"."preview_hash")=32 AND ("ops"."import_batch"."confirmed_preview_hash" IS NULL OR "ops"."import_batch"."confirmed_preview_hash"="ops"."import_batch"."preview_hash") AND "ops"."import_batch"."state" IN ('previewed','confirmed','running','completed','partial','cancelled','failed') AND "ops"."import_batch"."version">0)
);
--> statement-breakpoint
CREATE TABLE "ops"."import_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"source_row_hash" "bytea" NOT NULL,
	"normalized_json" jsonb,
	"validation_errors_json" jsonb NOT NULL,
	"duplicate_candidate_action_id" uuid,
	"state" text NOT NULL,
	"client_command_id" uuid NOT NULL,
	"command_receipt_id" uuid,
	"financial_action_id" uuid,
	"job_application_id" uuid,
	"safe_error_code" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "uq_import_row_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_import_row_number" UNIQUE("workspace_id","batch_id","row_no"),
	CONSTRAINT "uq_import_row_command" UNIQUE("workspace_id","client_command_id"),
	CONSTRAINT "ck_import_row" CHECK ("ops"."import_row"."row_no" BETWEEN 1 AND 500 AND octet_length("ops"."import_row"."source_row_hash")=32 AND "ops"."import_row"."state" IN ('invalid','ready','skipped','posted','failed') AND ("ops"."import_row"."state"<>'posted' OR ("ops"."import_row"."command_receipt_id" IS NOT NULL AND "ops"."import_row"."processed_at" IS NOT NULL AND (("ops"."import_row"."financial_action_id" IS NOT NULL)::int+("ops"."import_row"."job_application_id" IS NOT NULL)::int)=1)))
);
--> statement-breakpoint
CREATE TABLE "files"."private_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"object_key" text NOT NULL,
	"bucket_key" text DEFAULT 'evidence' NOT NULL,
	"object_version" text,
	"original_filename" text NOT NULL,
	"declared_mime" text NOT NULL,
	"verified_mime" text,
	"declared_bytes" bigint NOT NULL,
	"actual_bytes" bigint,
	"checksum_sha256" "bytea",
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"scan_engine_version" text,
	"scan_result_code" text,
	"uploaded_at" timestamp with time zone,
	"scanned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "private_attachment_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "uq_attachment_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_attachment_fields" CHECK ("files"."private_attachment"."version">0 AND char_length("files"."private_attachment"."original_filename") BETWEEN 1 AND 200 AND "files"."private_attachment"."declared_bytes" BETWEEN 1 AND 10485760 AND ("files"."private_attachment"."actual_bytes" IS NULL OR "files"."private_attachment"."actual_bytes" BETWEEN 1 AND "files"."private_attachment"."declared_bytes") AND ("files"."private_attachment"."checksum_sha256" IS NULL OR octet_length("files"."private_attachment"."checksum_sha256")=32) AND "files"."private_attachment"."status" IN ('pending_upload','quarantined','available','rejected','deleting','deleted') AND "files"."private_attachment"."declared_mime" IN ('application/pdf','image/jpeg','image/png') AND ("files"."private_attachment"."status"<>'available' OR ("files"."private_attachment"."verified_mime"="files"."private_attachment"."declared_mime" AND "files"."private_attachment"."actual_bytes"="files"."private_attachment"."declared_bytes" AND "files"."private_attachment"."checksum_sha256" IS NOT NULL AND "files"."private_attachment"."scan_result_code"='passed' AND "files"."private_attachment"."scan_engine_version" IS NOT NULL AND "files"."private_attachment"."scanned_at" IS NOT NULL AND "files"."private_attachment"."uploaded_at" IS NOT NULL)) AND ("files"."private_attachment"."status"<>'deleted' OR "files"."private_attachment"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "files"."reconciliation_attachment" (
	"workspace_id" uuid NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "reconciliation_attachment_pk" PRIMARY KEY("workspace_id","reconciliation_id","attachment_id"),
	CONSTRAINT "reconciliation_attachment_label" CHECK ("files"."reconciliation_attachment"."label" IS NULL OR char_length("files"."reconciliation_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "ops"."restore_id_map" (
	"workspace_id" uuid NOT NULL,
	"restore_run_id" uuid NOT NULL,
	"entity_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	CONSTRAINT "restore_id_map_workspace_id_restore_run_id_entity_kind_source_id_pk" PRIMARY KEY("workspace_id","restore_run_id","entity_kind","source_id"),
	CONSTRAINT "uq_restore_target_id" UNIQUE("workspace_id","restore_run_id","entity_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "ops"."restore_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manifest_version" integer NOT NULL,
	"bundle_checksum" "bytea" NOT NULL,
	"mode" text DEFAULT 'replace_private_workspace' NOT NULL,
	"state" text DEFAULT 'previewed' NOT NULL,
	"staging_reference" text NOT NULL,
	"preview_json" jsonb NOT NULL,
	"preview_hash" "bytea" NOT NULL,
	"bundle_json" jsonb NOT NULL,
	"recovery_json" jsonb,
	"confirmed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"expected_financial_revision" bigint NOT NULL,
	"apply_transaction" text,
	"expires_at" timestamp with time zone NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recovery_export_run_id" uuid,
	CONSTRAINT "uq_restore_run_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_restore_run" CHECK ("ops"."restore_run"."mode"='replace_private_workspace' AND "ops"."restore_run"."manifest_version">0 AND octet_length("ops"."restore_run"."bundle_checksum")=32 AND octet_length("ops"."restore_run"."preview_hash")=32 AND "ops"."restore_run"."state" IN ('previewed','applying','completed','failed','cancelled') AND "ops"."restore_run"."expected_financial_revision">=0)
);
--> statement-breakpoint
CREATE TABLE "files"."resume_attachment" (
	"workspace_id" uuid NOT NULL,
	"resume_version_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "resume_attachment_pk" PRIMARY KEY("workspace_id","resume_version_id","attachment_id"),
	CONSTRAINT "resume_attachment_label" CHECK ("files"."resume_attachment"."label" IS NULL OR char_length("files"."resume_attachment"."label")<=200)
);
--> statement-breakpoint
CREATE TABLE "files"."settlement_attachment" (
	"workspace_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "settlement_attachment_pk" PRIMARY KEY("workspace_id","settlement_id","attachment_id"),
	CONSTRAINT "settlement_attachment_label" CHECK ("files"."settlement_attachment"."label" IS NULL OR char_length("files"."settlement_attachment"."label")<=200)
);
--> statement-breakpoint
ALTER TABLE "files"."action_attachment" ADD CONSTRAINT "action_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."action_attachment" ADD CONSTRAINT "action_attachment_source_fk" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."action_attachment" ADD CONSTRAINT "action_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_attachment" ADD CONSTRAINT "application_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_attachment" ADD CONSTRAINT "application_attachment_source_fk" FOREIGN KEY ("workspace_id","application_id") REFERENCES "career"."job_application"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_attachment" ADD CONSTRAINT "application_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_event_attachment" ADD CONSTRAINT "application_event_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_event_attachment" ADD CONSTRAINT "application_event_attachment_source_fk" FOREIGN KEY ("workspace_id","application_event_id") REFERENCES "career"."application_event"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."application_event_attachment" ADD CONSTRAINT "application_event_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."card_statement_attachment" ADD CONSTRAINT "card_statement_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."card_statement_attachment" ADD CONSTRAINT "card_statement_attachment_source_fk" FOREIGN KEY ("workspace_id","card_statement_revision_id") REFERENCES "finance"."card_statement_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."card_statement_attachment" ADD CONSTRAINT "card_statement_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."debt_attachment" ADD CONSTRAINT "debt_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."debt_attachment" ADD CONSTRAINT "debt_attachment_source_fk" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."debt_attachment" ADD CONSTRAINT "debt_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_batch" ADD CONSTRAINT "import_batch_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_batch" ADD CONSTRAINT "import_batch_workspace_id_target_account_id_financial_account_workspace_id_id_fk" FOREIGN KEY ("workspace_id","target_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_batch" ADD CONSTRAINT "import_batch_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_batch_id_import_batch_workspace_id_id_fk" FOREIGN KEY ("workspace_id","batch_id") REFERENCES "ops"."import_batch"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_financial_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","financial_action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_duplicate_candidate_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","duplicate_candidate_action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."import_row" ADD CONSTRAINT "import_row_workspace_id_job_application_id_job_application_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_application_id") REFERENCES "career"."job_application"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."private_attachment" ADD CONSTRAINT "private_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."private_attachment" ADD CONSTRAINT "private_attachment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."private_attachment" ADD CONSTRAINT "private_attachment_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."reconciliation_attachment" ADD CONSTRAINT "reconciliation_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."reconciliation_attachment" ADD CONSTRAINT "reconciliation_attachment_source_fk" FOREIGN KEY ("workspace_id","reconciliation_id") REFERENCES "finance"."reconciliation"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."reconciliation_attachment" ADD CONSTRAINT "reconciliation_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."restore_id_map" ADD CONSTRAINT "restore_id_map_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."restore_id_map" ADD CONSTRAINT "restore_id_map_workspace_id_restore_run_id_restore_run_workspace_id_id_fk" FOREIGN KEY ("workspace_id","restore_run_id") REFERENCES "ops"."restore_run"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."restore_run" ADD CONSTRAINT "restore_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."restore_run" ADD CONSTRAINT "restore_run_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."restore_run" ADD CONSTRAINT "restore_run_workspace_id_recovery_export_run_id_export_run_workspace_id_id_fk" FOREIGN KEY ("workspace_id","recovery_export_run_id") REFERENCES "ops"."export_run"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."resume_attachment" ADD CONSTRAINT "resume_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."resume_attachment" ADD CONSTRAINT "resume_attachment_source_fk" FOREIGN KEY ("workspace_id","resume_version_id") REFERENCES "career"."resume_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."resume_attachment" ADD CONSTRAINT "resume_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."settlement_attachment" ADD CONSTRAINT "settlement_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."settlement_attachment" ADD CONSTRAINT "settlement_attachment_source_fk" FOREIGN KEY ("workspace_id","settlement_id") REFERENCES "finance"."debt_settlement"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files"."settlement_attachment" ADD CONSTRAINT "settlement_attachment_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "files"."private_attachment"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_attachment_reverse" ON "files"."action_attachment" USING btree ("workspace_id","attachment_id","action_id");--> statement-breakpoint
CREATE INDEX "application_attachment_reverse" ON "files"."application_attachment" USING btree ("workspace_id","attachment_id","application_id");--> statement-breakpoint
CREATE INDEX "application_event_attachment_reverse" ON "files"."application_event_attachment" USING btree ("workspace_id","attachment_id","application_event_id");--> statement-breakpoint
CREATE INDEX "card_statement_attachment_reverse" ON "files"."card_statement_attachment" USING btree ("workspace_id","attachment_id","card_statement_revision_id");--> statement-breakpoint
CREATE INDEX "debt_attachment_reverse" ON "files"."debt_attachment" USING btree ("workspace_id","attachment_id","debt_id");--> statement-breakpoint
CREATE INDEX "ix_import_checksum" ON "ops"."import_batch" USING btree ("workspace_id","file_checksum");--> statement-breakpoint
CREATE INDEX "ix_attachment_scope_status" ON "files"."private_attachment" USING btree ("workspace_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "reconciliation_attachment_reverse" ON "files"."reconciliation_attachment" USING btree ("workspace_id","attachment_id","reconciliation_id");--> statement-breakpoint
CREATE INDEX "resume_attachment_reverse" ON "files"."resume_attachment" USING btree ("workspace_id","attachment_id","resume_version_id");--> statement-breakpoint
CREATE INDEX "settlement_attachment_reverse" ON "files"."settlement_attachment" USING btree ("workspace_id","attachment_id","settlement_id");