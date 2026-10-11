CREATE TABLE "finance"."card_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_card_statement_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_card_statement_version" CHECK ("finance"."card_statement"."version">0)
);
--> statement-breakpoint
CREATE TABLE "finance"."card_statement_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"statement_revision_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"posting_date" date,
	"amount_minor" bigint,
	"provider_reference" text,
	"action_revision_id" uuid,
	CONSTRAINT "uq_statement_entry_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_statement_entry_line" UNIQUE("workspace_id","statement_revision_id","line_no"),
	CONSTRAINT "uq_statement_entry_source" UNIQUE("workspace_id","statement_revision_id","action_revision_id"),
	CONSTRAINT "ck_statement_entry_line" CHECK ("finance"."card_statement_entry"."line_no" BETWEEN 1 AND 100),
	CONSTRAINT "ck_statement_entry_description" CHECK (char_length(btrim("finance"."card_statement_entry"."description")) BETWEEN 1 AND 2000),
	CONSTRAINT "ck_statement_entry_reference" CHECK ("finance"."card_statement_entry"."provider_reference" IS NULL OR char_length(btrim("finance"."card_statement_entry"."provider_reference")) BETWEEN 1 AND 2000),
	CONSTRAINT "ck_statement_entry_link_evidence" CHECK ("finance"."card_statement_entry"."action_revision_id" IS NULL OR ("finance"."card_statement_entry"."posting_date" IS NOT NULL AND "finance"."card_statement_entry"."amount_minor" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "finance"."card_statement_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_revision_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"cycle_start" date NOT NULL,
	"cycle_end" date NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date NOT NULL,
	"balance_minor" bigint NOT NULL,
	"minimum_due_minor" bigint NOT NULL,
	"opening_balance_minor" bigint,
	"provider_reference" text,
	"verification_source" text NOT NULL,
	"verified_date" date NOT NULL,
	"reason" text,
	"state" text DEFAULT 'building' NOT NULL,
	"finalized_at" timestamp with time zone,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_statement_revision_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_statement_revision_parent" UNIQUE("workspace_id","statement_id","id"),
	CONSTRAINT "uq_statement_revision_number" UNIQUE("workspace_id","statement_id","revision_no"),
	CONSTRAINT "uq_statement_revision_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_statement_revision_number" CHECK ("finance"."card_statement_revision"."revision_no">0),
	CONSTRAINT "ck_statement_revision_dates" CHECK ("finance"."card_statement_revision"."cycle_start"<="finance"."card_statement_revision"."cycle_end" AND "finance"."card_statement_revision"."cycle_end"<="finance"."card_statement_revision"."statement_date" AND "finance"."card_statement_revision"."statement_date"<="finance"."card_statement_revision"."due_date"),
	CONSTRAINT "ck_statement_revision_minimum" CHECK ("finance"."card_statement_revision"."minimum_due_minor">=0 AND "finance"."card_statement_revision"."minimum_due_minor"<=GREATEST("finance"."card_statement_revision"."balance_minor",0)),
	CONSTRAINT "ck_statement_revision_source" CHECK (char_length(btrim("finance"."card_statement_revision"."verification_source")) BETWEEN 1 AND 2000),
	CONSTRAINT "ck_statement_revision_reference" CHECK ("finance"."card_statement_revision"."provider_reference" IS NULL OR char_length(btrim("finance"."card_statement_revision"."provider_reference")) BETWEEN 1 AND 2000),
	CONSTRAINT "ck_statement_revision_reason" CHECK (("finance"."card_statement_revision"."revision_no"=1 AND "finance"."card_statement_revision"."previous_revision_id" IS NULL AND "finance"."card_statement_revision"."reason" IS NULL) OR ("finance"."card_statement_revision"."revision_no">1 AND "finance"."card_statement_revision"."previous_revision_id" IS NOT NULL AND char_length(btrim("finance"."card_statement_revision"."reason")) BETWEEN 1 AND 20000)),
	CONSTRAINT "ck_statement_revision_state" CHECK (("finance"."card_statement_revision"."state"='building' AND "finance"."card_statement_revision"."finalized_at" IS NULL) OR ("finance"."card_statement_revision"."state"='verified' AND "finance"."card_statement_revision"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "finance"."card_statement" ADD CONSTRAINT "card_statement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement" ADD CONSTRAINT "fk_card_statement_card" FOREIGN KEY ("workspace_id","card_id") REFERENCES "finance"."credit_card"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_entry" ADD CONSTRAINT "card_statement_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_entry" ADD CONSTRAINT "fk_statement_entry_revision" FOREIGN KEY ("workspace_id","statement_revision_id") REFERENCES "finance"."card_statement_revision"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_entry" ADD CONSTRAINT "fk_statement_entry_activity" FOREIGN KEY ("workspace_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_revision" ADD CONSTRAINT "card_statement_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_revision" ADD CONSTRAINT "card_statement_revision_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_revision" ADD CONSTRAINT "fk_statement_revision_root" FOREIGN KEY ("workspace_id","statement_id") REFERENCES "finance"."card_statement"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_revision" ADD CONSTRAINT "fk_statement_revision_command" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_card_statement_card" ON "finance"."card_statement" USING btree ("workspace_id","card_id","id");--> statement-breakpoint
CREATE INDEX "ix_statement_entry_activity" ON "finance"."card_statement_entry" USING btree ("workspace_id","action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_statement_revision_actor" ON "finance"."card_statement_revision" USING btree ("recorded_by_user_id");