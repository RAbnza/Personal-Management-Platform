CREATE TABLE "ops"."deletion_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"target_user_id" uuid NOT NULL,
	"target_workspace_id" uuid NOT NULL,
	"client_command_id" uuid NOT NULL,
	"payload_hash" "bytea" NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"scope_manifest" jsonb NOT NULL,
	"scope_hash" "bytea" NOT NULL,
	"progress_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	CONSTRAINT "uq_deletion_command" UNIQUE("target_user_id","client_command_id"),
	CONSTRAINT "ck_deletion_state" CHECK ("ops"."deletion_request"."state" IN ('pending','cancelled','purging','completed','failed')),
	CONSTRAINT "ck_deletion_times" CHECK ("ops"."deletion_request"."purge_after">="ops"."deletion_request"."requested_at" AND (("ops"."deletion_request"."state"='completed')=("ops"."deletion_request"."completed_at" IS NOT NULL))),
	CONSTRAINT "ck_deletion_hash" CHECK (octet_length("ops"."deletion_request"."scope_hash")=32 AND octet_length("ops"."deletion_request"."payload_hash")=32),
	CONSTRAINT "ck_deletion_json" CHECK (jsonb_typeof("ops"."deletion_request"."scope_manifest")='object' AND jsonb_typeof("ops"."deletion_request"."progress_json")='object'),
	CONSTRAINT "ck_deletion_links" CHECK (("ops"."deletion_request"."state"='completed' AND "ops"."deletion_request"."user_id" IS NULL AND "ops"."deletion_request"."workspace_id" IS NULL) OR ("ops"."deletion_request"."state"<>'completed' AND "ops"."deletion_request"."user_id"="ops"."deletion_request"."target_user_id" AND "ops"."deletion_request"."workspace_id"="ops"."deletion_request"."target_workspace_id" AND "ops"."deletion_request"."user_id" IS NOT NULL AND "ops"."deletion_request"."workspace_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ops"."deletion_tombstone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_user_id" uuid NOT NULL,
	"target_workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"purged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"register_exported_at" timestamp with time zone,
	CONSTRAINT "uq_deletion_tombstone_target" UNIQUE("target_user_id","target_workspace_id"),
	CONSTRAINT "ck_tombstone_expiry" CHECK ("ops"."deletion_tombstone"."expires_at">="ops"."deletion_tombstone"."purged_at")
);
--> statement-breakpoint
CREATE TABLE "auth"."session_assurance" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	CONSTRAINT "ck_session_assurance_method" CHECK ("auth"."session_assurance"."method"='password')
);
--> statement-breakpoint
ALTER TABLE "ops"."deletion_request" ADD CONSTRAINT "deletion_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."deletion_request" ADD CONSTRAINT "deletion_request_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops"."deletion_tombstone" ADD CONSTRAINT "deletion_tombstone_request_id_deletion_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "ops"."deletion_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session_assurance" ADD CONSTRAINT "session_assurance_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "auth"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_deletion_active_user" ON "ops"."deletion_request" USING btree ("target_user_id") WHERE "ops"."deletion_request"."state" IN ('pending','purging','failed');--> statement-breakpoint
CREATE INDEX "ix_deletion_due" ON "ops"."deletion_request" USING btree ("state","purge_after","id");--> statement-breakpoint
CREATE INDEX "ix_tombstone_expiry" ON "ops"."deletion_tombstone" USING btree ("expires_at");