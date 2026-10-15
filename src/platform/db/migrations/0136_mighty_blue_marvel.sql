ALTER TABLE "ops"."export_run" DROP CONSTRAINT "ck_export_run_kind";--> statement-breakpoint
ALTER TABLE "ops"."export_run" DROP CONSTRAINT "ck_export_run_completed";--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD COLUMN "bundle_json" jsonb;--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD CONSTRAINT "ck_export_run_kind" CHECK ("ops"."export_run"."export_kind" IN ('transactions','debts','applications','report','workspace_bundle'));--> statement-breakpoint
ALTER TABLE "ops"."export_run" ADD CONSTRAINT "ck_export_run_completed" CHECK ("ops"."export_run"."state" IN ('completed','expired') AND "ops"."export_run"."row_count" BETWEEN 0 AND 10000 AND "ops"."export_run"."snapshot_financial_revision">=0);