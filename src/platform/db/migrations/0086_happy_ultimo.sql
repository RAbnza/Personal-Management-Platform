CREATE TABLE "finance"."card_installment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_revision_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"due_date" date,
	"principal_minor" bigint NOT NULL,
	"interest_minor" bigint,
	"fee_minor" bigint,
	"total_minor" bigint,
	"provider_reference" text,
	"notes" text,
	CONSTRAINT "uq_card_installment_line" UNIQUE("workspace_id","plan_revision_id","sequence_no"),
	CONSTRAINT "ck_card_installment_amount" CHECK ("finance"."card_installment"."principal_minor">=0 AND ("finance"."card_installment"."interest_minor" IS NULL OR "finance"."card_installment"."interest_minor">=0) AND ("finance"."card_installment"."fee_minor" IS NULL OR "finance"."card_installment"."fee_minor">=0) AND ("finance"."card_installment"."total_minor" IS NULL OR ("finance"."card_installment"."total_minor"::numeric>="finance"."card_installment"."principal_minor"::numeric+COALESCE("finance"."card_installment"."interest_minor",0)::numeric+COALESCE("finance"."card_installment"."fee_minor",0)::numeric AND ("finance"."card_installment"."interest_minor" IS NULL OR "finance"."card_installment"."fee_minor" IS NULL OR "finance"."card_installment"."total_minor"::numeric="finance"."card_installment"."principal_minor"::numeric+"finance"."card_installment"."interest_minor"::numeric+"finance"."card_installment"."fee_minor"::numeric)))),
	CONSTRAINT "ck_card_installment_line" CHECK ("finance"."card_installment"."sequence_no" BETWEEN 1 AND 360),
	CONSTRAINT "ck_card_installment_text" CHECK (("finance"."card_installment"."provider_reference" IS NULL OR char_length(btrim("finance"."card_installment"."provider_reference")) BETWEEN 1 AND 2000) AND ("finance"."card_installment"."notes" IS NULL OR char_length("finance"."card_installment"."notes")<=2000))
);
--> statement-breakpoint
CREATE TABLE "finance"."card_installment_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_revision_id" uuid NOT NULL,
	"installment_no" integer NOT NULL,
	"allocation_id" uuid NOT NULL,
	"principal_minor" bigint NOT NULL,
	"interest_minor" bigint NOT NULL,
	"fee_minor" bigint NOT NULL,
	"interest_action_revision_id" uuid,
	"fee_action_revision_id" uuid,
	"reverses_application_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"confirmation_kind" text NOT NULL,
	"confirmation_source" text NOT NULL,
	"confirmed_date" date NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_installment_application_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_installment_application_reversal" UNIQUE("workspace_id","reverses_application_id"),
	CONSTRAINT "uq_installment_application_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_installment_application_amount" CHECK ("finance"."card_installment_application"."principal_minor">=0 AND "finance"."card_installment_application"."interest_minor">=0 AND "finance"."card_installment_application"."fee_minor">=0 AND "finance"."card_installment_application"."principal_minor"::numeric+"finance"."card_installment_application"."interest_minor"::numeric+"finance"."card_installment_application"."fee_minor"::numeric>0 AND ("finance"."card_installment_application"."interest_minor"=0)=("finance"."card_installment_application"."interest_action_revision_id" IS NULL) AND ("finance"."card_installment_application"."fee_minor"=0)=("finance"."card_installment_application"."fee_action_revision_id" IS NULL)),
	CONSTRAINT "ck_installment_application_confirmation" CHECK ("finance"."card_installment_application"."confirmation_kind" IN ('provider','user') AND char_length(btrim("finance"."card_installment_application"."confirmation_source")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "finance"."card_installment_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"purchase_action_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_installment_plan_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_installment_plan_version" CHECK ("finance"."card_installment_plan"."version">0)
);
--> statement-breakpoint
CREATE TABLE "finance"."card_installment_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_revision_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"purchase_action_revision_id" uuid NOT NULL,
	"principal_minor" bigint NOT NULL,
	"installment_count" integer NOT NULL,
	"lifecycle" text NOT NULL,
	"provider_reference" text,
	"verification_source" text NOT NULL,
	"verified_date" date NOT NULL,
	"notes" text,
	"reason" text,
	"refund_evidence" jsonb NOT NULL,
	"state" text DEFAULT 'building' NOT NULL,
	"finalized_at" timestamp with time zone,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_installment_revision_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_installment_revision_parent" UNIQUE("workspace_id","plan_id","id"),
	CONSTRAINT "uq_installment_revision_number" UNIQUE("workspace_id","plan_id","revision_no"),
	CONSTRAINT "uq_installment_revision_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_installment_revision_count" CHECK ("finance"."card_installment_revision"."installment_count" BETWEEN 1 AND 360 AND "finance"."card_installment_revision"."principal_minor">0 AND "finance"."card_installment_revision"."principal_minor"<=100000000000),
	CONSTRAINT "ck_installment_revision_lifecycle" CHECK ("finance"."card_installment_revision"."lifecycle" IN ('active','cancelled')),
	CONSTRAINT "ck_installment_revision_source" CHECK (char_length(btrim("finance"."card_installment_revision"."verification_source")) BETWEEN 1 AND 2000 AND ("finance"."card_installment_revision"."provider_reference" IS NULL OR char_length(btrim("finance"."card_installment_revision"."provider_reference")) BETWEEN 1 AND 2000) AND ("finance"."card_installment_revision"."notes" IS NULL OR char_length("finance"."card_installment_revision"."notes")<=20000)),
	CONSTRAINT "ck_installment_revision_reason" CHECK (("finance"."card_installment_revision"."revision_no"=1 AND "finance"."card_installment_revision"."previous_revision_id" IS NULL AND "finance"."card_installment_revision"."reason" IS NULL) OR ("finance"."card_installment_revision"."revision_no">1 AND "finance"."card_installment_revision"."previous_revision_id" IS NOT NULL AND char_length(btrim("finance"."card_installment_revision"."reason")) BETWEEN 1 AND 20000)),
	CONSTRAINT "ck_installment_revision_state" CHECK (("finance"."card_installment_revision"."state"='building' AND "finance"."card_installment_revision"."finalized_at" IS NULL) OR ("finance"."card_installment_revision"."state"='verified' AND "finance"."card_installment_revision"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "finance"."card_installment" ADD CONSTRAINT "card_installment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment" ADD CONSTRAINT "card_installment_workspace_id_plan_revision_id_card_installment_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","plan_revision_id") REFERENCES "finance"."card_installment_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_plan_revision_id_installment_no_card_installment_workspace_id_plan_revision_id_sequence_no_fk" FOREIGN KEY ("workspace_id","plan_revision_id","installment_no") REFERENCES "finance"."card_installment"("workspace_id","plan_revision_id","sequence_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_allocation_id_card_statement_allocation_workspace_id_id_fk" FOREIGN KEY ("workspace_id","allocation_id") REFERENCES "finance"."card_statement_allocation"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_interest_action_revision_id_action_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","interest_action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_application" ADD CONSTRAINT "card_installment_application_workspace_id_fee_action_revision_id_action_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","fee_action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_plan" ADD CONSTRAINT "card_installment_plan_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_plan" ADD CONSTRAINT "card_installment_plan_workspace_id_card_id_credit_card_workspace_id_id_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "finance"."credit_card"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_plan" ADD CONSTRAINT "card_installment_plan_workspace_id_purchase_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","purchase_action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_revision" ADD CONSTRAINT "card_installment_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_revision" ADD CONSTRAINT "card_installment_revision_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_revision" ADD CONSTRAINT "card_installment_revision_workspace_id_plan_id_card_installment_plan_workspace_id_id_fk" FOREIGN KEY ("workspace_id","plan_id") REFERENCES "finance"."card_installment_plan"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_revision" ADD CONSTRAINT "card_installment_revision_workspace_id_purchase_action_revision_id_action_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","purchase_action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_installment_revision" ADD CONSTRAINT "card_installment_revision_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_card_installment_date" ON "finance"."card_installment" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "ix_installment_application_allocation" ON "finance"."card_installment_application" USING btree ("workspace_id","allocation_id");--> statement-breakpoint
CREATE INDEX "ix_installment_application_interest" ON "finance"."card_installment_application" USING btree ("workspace_id","interest_action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_installment_application_fee" ON "finance"."card_installment_application" USING btree ("workspace_id","fee_action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_installment_application_actor" ON "finance"."card_installment_application" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "ix_installment_plan_card" ON "finance"."card_installment_plan" USING btree ("workspace_id","card_id","id");--> statement-breakpoint
CREATE INDEX "ix_installment_plan_purchase" ON "finance"."card_installment_plan" USING btree ("workspace_id","purchase_action_id");--> statement-breakpoint
CREATE INDEX "ix_installment_revision_actor" ON "finance"."card_installment_revision" USING btree ("recorded_by_user_id");