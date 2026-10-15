CREATE SCHEMA "sharing";
--> statement-breakpoint
CREATE TABLE "sharing"."expense_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_group_shape" CHECK (length(btrim("sharing"."expense_group"."name")) BETWEEN 1 AND 200 AND "sharing"."expense_group"."currency"='PHP' AND "sharing"."expense_group"."version">0)
);
--> statement-breakpoint
CREATE TABLE "sharing"."expense_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_revision_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"actor_participant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"expense_date" date NOT NULL,
	"total_minor" bigint NOT NULL,
	"split_method" text NOT NULL,
	"category_label" text,
	"notes" text,
	"reason" text,
	"state" text DEFAULT 'building' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_expense_revision_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_expense_revision_identity" UNIQUE("group_id","expense_id","id"),
	CONSTRAINT "uq_expense_revision_no" UNIQUE("group_id","expense_id","revision_no"),
	CONSTRAINT "ck_expense_revision_shape" CHECK ("sharing"."expense_revision"."total_minor">0 AND "sharing"."expense_revision"."split_method" IN ('equal','exact') AND "sharing"."expense_revision"."state" IN ('building','finalized','void') AND length(btrim("sharing"."expense_revision"."description")) BETWEEN 1 AND 2000 AND (("sharing"."expense_revision"."revision_no"=1 AND "sharing"."expense_revision"."previous_revision_id" IS NULL) OR ("sharing"."expense_revision"."revision_no">1 AND "sharing"."expense_revision"."previous_revision_id" IS NOT NULL AND length(btrim("sharing"."expense_revision"."reason"))>0)))
);
--> statement-breakpoint
CREATE TABLE "sharing"."group_command_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"client_command_id" uuid NOT NULL,
	"actor_participant_id" uuid NOT NULL,
	"command_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"state" text DEFAULT 'claimed' NOT NULL,
	"result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "uq_group_receipt_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_group_command" UNIQUE("group_id","client_command_id"),
	CONSTRAINT "ck_group_receipt_shape" CHECK ("sharing"."group_command_receipt"."payload_hash" ~ '^[a-f0-9]{64}$' AND (("sharing"."group_command_receipt"."state"='claimed' AND "sharing"."group_command_receipt"."completed_at" IS NULL) OR ("sharing"."group_command_receipt"."state"='completed' AND "sharing"."group_command_receipt"."completed_at" IS NOT NULL AND "sharing"."group_command_receipt"."result_json" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "sharing"."invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"inviter_participant_id" uuid NOT NULL,
	"target_email_normalized" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"accepted_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_invitation_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_invitation_token" UNIQUE("token_hash"),
	CONSTRAINT "ck_invitation_shape" CHECK ("sharing"."invitation"."token_hash" ~ '^[a-f0-9]{64}$' AND "sharing"."invitation"."role"='member' AND "sharing"."invitation"."expires_at">"sharing"."invitation"."created_at" AND "sharing"."invitation"."state" IN ('pending','accepted','expired','revoked') AND (("sharing"."invitation"."state"='accepted' AND "sharing"."invitation"."accepted_user_id" IS NOT NULL AND "sharing"."invitation"."accepted_at" IS NOT NULL) OR ("sharing"."invitation"."state"<>'accepted' AND "sharing"."invitation"."accepted_user_id" IS NULL AND "sharing"."invitation"."accepted_at" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "sharing"."membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"exit_kind" text,
	"history_policy_version" integer DEFAULT 1 NOT NULL,
	"accepted_invitation_id" uuid,
	CONSTRAINT "uq_membership_scope" UNIQUE("group_id","id"),
	CONSTRAINT "ck_membership_shape" CHECK ("sharing"."membership"."role" IN ('owner','member') AND "sharing"."membership"."history_policy_version"=1 AND (("sharing"."membership"."left_at" IS NULL AND "sharing"."membership"."exit_kind" IS NULL) OR ("sharing"."membership"."left_at">="sharing"."membership"."joined_at" AND "sharing"."membership"."exit_kind" IN ('left','removed'))))
);
--> statement-breakpoint
CREATE TABLE "sharing"."participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"registered_user_id" uuid,
	"display_name" text NOT NULL,
	"identity_kind" text NOT NULL,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_participant_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_participant_user" UNIQUE("group_id","registered_user_id"),
	CONSTRAINT "ck_participant_identity" CHECK (length(btrim("sharing"."participant"."display_name")) BETWEEN 1 AND 200 AND (("sharing"."participant"."identity_kind"='registered' AND "sharing"."participant"."registered_user_id" IS NOT NULL AND "sharing"."participant"."linked_at" IS NOT NULL) OR ("sharing"."participant"."identity_kind" IN ('manual','deleted') AND "sharing"."participant"."registered_user_id" IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "audit"."group_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"actor_participant_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer NOT NULL,
	"operation" text NOT NULL,
	"after_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_group_audit_command" UNIQUE("group_id","command_receipt_id")
);
--> statement-breakpoint
CREATE TABLE "sharing"."member_record_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"visibility" text DEFAULT 'full' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_access_record" UNIQUE("group_id","membership_id","expense_id"),
	CONSTRAINT "ck_access_visibility" CHECK ("sharing"."member_record_access"."visibility"='full')
);
--> statement-breakpoint
CREATE TABLE "sharing"."participant_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"claiming_user_id" uuid,
	"balance_review_json" jsonb NOT NULL,
	"review_group_version" integer NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "uq_claim_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_claim_invitation" UNIQUE("group_id","invitation_id"),
	CONSTRAINT "ck_claim_state" CHECK ("sharing"."participant_claim"."state" IN ('pending','accepted','rejected','expired'))
);
--> statement-breakpoint
CREATE TABLE "sharing"."participant_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"expense_revision_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"rounding_rank" integer NOT NULL,
	"rounding_extra_minor" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_share_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_share_person" UNIQUE("group_id","expense_revision_id","participant_id"),
	CONSTRAINT "uq_share_rank" UNIQUE("group_id","expense_revision_id","rounding_rank"),
	CONSTRAINT "ck_share_amount" CHECK ("sharing"."participant_share"."amount_minor">=0 AND "sharing"."participant_share"."rounding_rank">=0 AND "sharing"."participant_share"."rounding_extra_minor" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE "sharing"."payer_contribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"expense_revision_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "uq_contribution_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_contribution_person" UNIQUE("group_id","expense_revision_id","participant_id"),
	CONSTRAINT "ck_contribution_amount" CHECK ("sharing"."payer_contribution"."amount_minor">0)
);
--> statement-breakpoint
CREATE TABLE "sharing"."shared_expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"original_command_receipt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_expense_scope" UNIQUE("group_id","id"),
	CONSTRAINT "uq_expense_receipt" UNIQUE("group_id","original_command_receipt_id")
);
--> statement-breakpoint
ALTER TABLE "sharing"."expense_revision" ADD CONSTRAINT "expense_revision_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."expense_revision" ADD CONSTRAINT "fk_revision_expense" FOREIGN KEY ("group_id","expense_id") REFERENCES "sharing"."shared_expense"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."expense_revision" ADD CONSTRAINT "fk_revision_receipt" FOREIGN KEY ("group_id","command_receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."expense_revision" ADD CONSTRAINT "fk_revision_actor" FOREIGN KEY ("group_id","actor_participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."group_command_receipt" ADD CONSTRAINT "group_command_receipt_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."group_command_receipt" ADD CONSTRAINT "fk_group_receipt_actor" FOREIGN KEY ("group_id","actor_participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."invitation" ADD CONSTRAINT "invitation_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."invitation" ADD CONSTRAINT "fk_invitation_actor" FOREIGN KEY ("group_id","inviter_participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."membership" ADD CONSTRAINT "membership_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."membership" ADD CONSTRAINT "fk_membership_participant" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant" ADD CONSTRAINT "participant_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."group_revision" ADD CONSTRAINT "group_revision_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."group_revision" ADD CONSTRAINT "fk_group_audit_actor" FOREIGN KEY ("group_id","actor_participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."group_revision" ADD CONSTRAINT "fk_group_audit_receipt" FOREIGN KEY ("group_id","command_receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."member_record_access" ADD CONSTRAINT "member_record_access_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."member_record_access" ADD CONSTRAINT "fk_access_membership" FOREIGN KEY ("group_id","membership_id") REFERENCES "sharing"."membership"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."member_record_access" ADD CONSTRAINT "fk_access_expense" FOREIGN KEY ("group_id","expense_id") REFERENCES "sharing"."shared_expense"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_claim" ADD CONSTRAINT "participant_claim_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_claim" ADD CONSTRAINT "fk_claim_participant" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_claim" ADD CONSTRAINT "fk_claim_invitation" FOREIGN KEY ("group_id","invitation_id") REFERENCES "sharing"."invitation"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_share" ADD CONSTRAINT "participant_share_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_share" ADD CONSTRAINT "fk_share_revision" FOREIGN KEY ("group_id","expense_id","expense_revision_id") REFERENCES "sharing"."expense_revision"("group_id","expense_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."participant_share" ADD CONSTRAINT "fk_share_person" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."payer_contribution" ADD CONSTRAINT "payer_contribution_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."payer_contribution" ADD CONSTRAINT "fk_contribution_revision" FOREIGN KEY ("group_id","expense_id","expense_revision_id") REFERENCES "sharing"."expense_revision"("group_id","expense_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."payer_contribution" ADD CONSTRAINT "fk_contribution_person" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."shared_expense" ADD CONSTRAINT "shared_expense_group_id_expense_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "sharing"."expense_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."shared_expense" ADD CONSTRAINT "fk_expense_creator" FOREIGN KEY ("group_id","created_by_participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing"."shared_expense" ADD CONSTRAINT "fk_expense_receipt" FOREIGN KEY ("group_id","original_command_receipt_id") REFERENCES "sharing"."group_command_receipt"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invitation_pending" ON "sharing"."invitation" USING btree ("group_id","target_email_normalized") WHERE "sharing"."invitation"."state"='pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_membership_active" ON "sharing"."membership" USING btree ("group_id","participant_id") WHERE "sharing"."membership"."left_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_claim_live" ON "sharing"."participant_claim" USING btree ("group_id","participant_id") WHERE "sharing"."participant_claim"."state"='pending';