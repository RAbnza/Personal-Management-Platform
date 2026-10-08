CREATE TABLE "ops"."export_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"export_kind" text NOT NULL,
	"schema_version" integer NOT NULL,
	"filters_json" jsonb NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"state" text NOT NULL,
	"snapshot_financial_revision" bigint NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"row_count" bigint NOT NULL,
	"coverage_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_export_run_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_export_run_receipt" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_export_run_kind" CHECK ("ops"."export_run"."export_kind" IN ('transactions','debts','applications','report')),
	CONSTRAINT "ck_export_run_version" CHECK ("ops"."export_run"."schema_version">0),
	CONSTRAINT "ck_export_run_completed" CHECK ("ops"."export_run"."state"='completed' AND "ops"."export_run"."row_count" BETWEEN 0 AND 10000 AND "ops"."export_run"."snapshot_financial_revision">=0),
	CONSTRAINT "ck_export_run_manifest" CHECK (jsonb_typeof("ops"."export_run"."filters_json")='object' AND jsonb_typeof("ops"."export_run"."coverage_json")='object')
);
--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD CONSTRAINT "export_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD CONSTRAINT "export_run_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD CONSTRAINT "fk_export_run_receipt" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_export_run_scope_created" ON "ops"."export_run" USING btree ("workspace_id","created_at","id");