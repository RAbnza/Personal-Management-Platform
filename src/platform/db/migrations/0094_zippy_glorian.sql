CREATE SCHEMA "planning";
--> statement-breakpoint
CREATE TABLE "planning"."expected_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"recurrence_version_id" uuid NOT NULL,
	"logical_date" date NOT NULL,
	"generation" integer NOT NULL,
	"due_date" date NOT NULL,
	"expected_minor" bigint NOT NULL,
	"state" text DEFAULT 'planned' NOT NULL,
	"override_reason" text,
	"completed_at" timestamp with time zone,
	"notification_generation" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_expected_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_expected_generation" UNIQUE("workspace_id","obligation_id","logical_date","generation"),
	CONSTRAINT "ck_expected_amount" CHECK ("planning"."expected_occurrence"."expected_minor">0 AND "planning"."expected_occurrence"."expected_minor"<=100000000000 AND "planning"."expected_occurrence"."version">0 AND "planning"."expected_occurrence"."generation">0 AND "planning"."expected_occurrence"."notification_generation">0),
	CONSTRAINT "ck_expected_state" CHECK ("planning"."expected_occurrence"."state" IN ('planned','linked','completed','skipped','cancelled') AND ("planning"."expected_occurrence"."state"='completed')=("planning"."expected_occurrence"."completed_at" IS NOT NULL) AND ("planning"."expected_occurrence"."override_reason" IS NULL OR char_length(btrim("planning"."expected_occurrence"."override_reason")) BETWEEN 1 AND 2000)),
	CONSTRAINT "ck_expected_dates" CHECK ("planning"."expected_occurrence"."logical_date" BETWEEN '1900-01-01'::date AND '2199-12-31'::date AND "planning"."expected_occurrence"."due_date" BETWEEN '1900-01-01'::date AND '2199-12-31'::date)
);
--> statement-breakpoint
CREATE TABLE "planning"."occurrence_actual_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"linked_minor" bigint NOT NULL,
	"reverses_link_id" uuid,
	"reason" text,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_occurrence_link_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_occurrence_link_amount" CHECK ("planning"."occurrence_actual_link"."linked_minor">0 AND "planning"."occurrence_actual_link"."linked_minor"<=100000000000 AND (("planning"."occurrence_actual_link"."reverses_link_id" IS NULL AND "planning"."occurrence_actual_link"."reason" IS NULL) OR ("planning"."occurrence_actual_link"."reverses_link_id" IS NOT NULL AND char_length(btrim("planning"."occurrence_actual_link"."reason")) BETWEEN 1 AND 2000)))
);
--> statement-breakpoint
CREATE TABLE "planning"."recurrence_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"previous_version_id" uuid,
	"effective_from" date NOT NULL,
	"frequency" text NOT NULL,
	"interval_count" integer NOT NULL,
	"weekdays" integer[],
	"day_of_month" integer,
	"short_month_policy" text,
	"ends_on" date,
	"occurrence_limit" integer,
	"expected_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"category_id" uuid,
	"default_account_id" uuid,
	"timezone" text NOT NULL,
	"reason" text,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_recurrence_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_recurrence_parent" UNIQUE("workspace_id","obligation_id","id"),
	CONSTRAINT "uq_recurrence_number" UNIQUE("workspace_id","obligation_id","version_no"),
	CONSTRAINT "uq_recurrence_boundary" UNIQUE("workspace_id","obligation_id","effective_from"),
	CONSTRAINT "ck_recurrence_bounds" CHECK ("planning"."recurrence_version"."version_no">0 AND "planning"."recurrence_version"."expected_minor">0 AND "planning"."recurrence_version"."expected_minor"<=100000000000 AND "planning"."recurrence_version"."currency"='PHP' AND "planning"."recurrence_version"."effective_from" BETWEEN '1900-01-01'::date AND '2199-12-31'::date AND ("planning"."recurrence_version"."ends_on" IS NULL OR "planning"."recurrence_version"."ends_on">="planning"."recurrence_version"."effective_from" AND "planning"."recurrence_version"."ends_on"<='2199-12-31'::date) AND ("planning"."recurrence_version"."occurrence_limit" IS NULL OR "planning"."recurrence_version"."occurrence_limit" BETWEEN 1 AND 10000)),
	CONSTRAINT "ck_recurrence_grammar" CHECK (("planning"."recurrence_version"."frequency"='daily' AND "planning"."recurrence_version"."interval_count" BETWEEN 1 AND 365 AND "planning"."recurrence_version"."weekdays" IS NULL AND "planning"."recurrence_version"."day_of_month" IS NULL AND "planning"."recurrence_version"."short_month_policy" IS NULL) OR ("planning"."recurrence_version"."frequency"='weekly' AND "planning"."recurrence_version"."interval_count" BETWEEN 1 AND 52 AND cardinality("planning"."recurrence_version"."weekdays") BETWEEN 1 AND 7 AND "planning"."recurrence_version"."weekdays"<@ARRAY[1,2,3,4,5,6,7] AND "planning"."recurrence_version"."day_of_month" IS NULL AND "planning"."recurrence_version"."short_month_policy" IS NULL) OR ("planning"."recurrence_version"."frequency"='monthly' AND "planning"."recurrence_version"."interval_count" BETWEEN 1 AND 120 AND "planning"."recurrence_version"."weekdays" IS NULL AND "planning"."recurrence_version"."day_of_month" BETWEEN 1 AND 31 AND "planning"."recurrence_version"."short_month_policy" IN ('last_valid_day','skip'))),
	CONSTRAINT "ck_recurrence_revision" CHECK (("planning"."recurrence_version"."version_no"=1 AND "planning"."recurrence_version"."previous_version_id" IS NULL AND "planning"."recurrence_version"."reason" IS NULL) OR ("planning"."recurrence_version"."version_no">1 AND "planning"."recurrence_version"."previous_version_id" IS NOT NULL AND char_length(btrim("planning"."recurrence_version"."reason")) BETWEEN 1 AND 2000))
);
--> statement-breakpoint
CREATE TABLE "planning"."recurring_obligation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"current_version_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_recurring_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_recurring_identity" CHECK (char_length(btrim("planning"."recurring_obligation"."name")) BETWEEN 1 AND 200 AND "planning"."recurring_obligation"."kind" IN ('income','bill','subscription') AND "planning"."recurring_obligation"."version">0)
);
--> statement-breakpoint
ALTER TABLE "planning"."expected_occurrence" ADD CONSTRAINT "expected_occurrence_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."expected_occurrence" ADD CONSTRAINT "expected_occurrence_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."expected_occurrence" ADD CONSTRAINT "expected_occurrence_workspace_id_obligation_id_recurrence_version_id_recurrence_version_workspace_id_obligation_id_id_fk" FOREIGN KEY ("workspace_id","obligation_id","recurrence_version_id") REFERENCES "planning"."recurrence_version"("workspace_id","obligation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."expected_occurrence" ADD CONSTRAINT "expected_occurrence_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_workspace_id_occurrence_id_expected_occurrence_workspace_id_id_fk" FOREIGN KEY ("workspace_id","occurrence_id") REFERENCES "planning"."expected_occurrence"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_workspace_id_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_workspace_id_action_id_action_revision_id_action_revision_workspace_id_action_id_id_fk" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."occurrence_actual_link" ADD CONSTRAINT "occurrence_actual_link_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_workspace_id_obligation_id_recurring_obligation_workspace_id_id_fk" FOREIGN KEY ("workspace_id","obligation_id") REFERENCES "planning"."recurring_obligation"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_workspace_id_category_id_category_workspace_id_id_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "core"."category"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurrence_version" ADD CONSTRAINT "recurrence_version_workspace_id_default_account_id_financial_account_workspace_id_id_fk" FOREIGN KEY ("workspace_id","default_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurring_obligation" ADD CONSTRAINT "recurring_obligation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurring_obligation" ADD CONSTRAINT "recurring_obligation_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."recurring_obligation" ADD CONSTRAINT "recurring_obligation_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_expected_active" ON "planning"."expected_occurrence" USING btree ("workspace_id","obligation_id","logical_date") WHERE "planning"."expected_occurrence"."state"<>'cancelled';--> statement-breakpoint
CREATE INDEX "ix_expected_due" ON "planning"."expected_occurrence" USING btree ("workspace_id","state","due_date","id");--> statement-breakpoint
CREATE INDEX "ix_expected_obligation" ON "planning"."expected_occurrence" USING btree ("workspace_id","obligation_id","logical_date","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occurrence_link_reversal" ON "planning"."occurrence_actual_link" USING btree ("workspace_id","reverses_link_id") WHERE "planning"."occurrence_actual_link"."reverses_link_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_occurrence_link_source" ON "planning"."occurrence_actual_link" USING btree ("workspace_id","action_id","occurrence_id");--> statement-breakpoint
CREATE INDEX "ix_occurrence_link_target" ON "planning"."occurrence_actual_link" USING btree ("workspace_id","occurrence_id");--> statement-breakpoint
CREATE INDEX "ix_recurrence_window" ON "planning"."recurrence_version" USING btree ("workspace_id","obligation_id","effective_from");--> statement-breakpoint
CREATE INDEX "ix_recurring_active" ON "planning"."recurring_obligation" USING btree ("workspace_id","archived_at","id");