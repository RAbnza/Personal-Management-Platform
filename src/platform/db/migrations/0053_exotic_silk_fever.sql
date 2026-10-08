CREATE TABLE "time"."reminder_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"personal_event_id" uuid,
	"application_event_id" uuid,
	"debt_obligation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rule_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"source_generation" integer NOT NULL,
	"rule_generation" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "uq_reminder_occurrence_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_reminder_occurrence_logical" UNIQUE NULLS NOT DISTINCT("workspace_id","rule_id","personal_event_id","application_event_id","debt_obligation_id","occurrence_key","source_generation","rule_generation"),
	CONSTRAINT "ck_reminder_occurrence_source" CHECK (num_nonnulls("time"."reminder_occurrence"."personal_event_id","time"."reminder_occurrence"."application_event_id","time"."reminder_occurrence"."debt_obligation_id")=1),
	CONSTRAINT "ck_reminder_occurrence_identity" CHECK ("time"."reminder_occurrence"."source_generation">0 AND "time"."reminder_occurrence"."rule_generation">0 AND "time"."reminder_occurrence"."version">0 AND char_length("time"."reminder_occurrence"."occurrence_key") BETWEEN 1 AND 200),
	CONSTRAINT "ck_reminder_occurrence_state" CHECK ("time"."reminder_occurrence"."state" IN ('active','dismissed','snoozed','cancelled') AND (("time"."reminder_occurrence"."state"='snoozed')=("time"."reminder_occurrence"."snoozed_until" IS NOT NULL)) AND (("time"."reminder_occurrence"."state"='dismissed')=("time"."reminder_occurrence"."dismissed_at" IS NOT NULL)) AND (("time"."reminder_occurrence"."state"='cancelled')=("time"."reminder_occurrence"."cancellation_reason" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "time"."reminder_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"personal_event_id" uuid,
	"application_event_id" uuid,
	"debt_obligation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"module_key" text,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"local_time" time DEFAULT '09:00' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_reminder_rule_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_reminder_rule_logical" UNIQUE NULLS NOT DISTINCT("workspace_id","personal_event_id","application_event_id","debt_obligation_id","module_key","channel","offset_days","local_time"),
	CONSTRAINT "ck_reminder_rule_source" CHECK (num_nonnulls("time"."reminder_rule"."personal_event_id","time"."reminder_rule"."application_event_id","time"."reminder_rule"."debt_obligation_id","time"."reminder_rule"."module_key")=1 AND ("time"."reminder_rule"."module_key" IS NULL OR "time"."reminder_rule"."module_key" IN ('money','career','time'))),
	CONSTRAINT "ck_reminder_rule_shape" CHECK ("time"."reminder_rule"."channel"='in_app' AND "time"."reminder_rule"."offset_days" BETWEEN 0 AND 365 AND "time"."reminder_rule"."generation">0 AND "time"."reminder_rule"."version">0)
);
--> statement-breakpoint
CREATE TABLE "time"."source_reminder_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"personal_event_id" uuid,
	"application_event_id" uuid,
	"debt_obligation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'inherit' NOT NULL,
	CONSTRAINT "uq_reminder_setting_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_reminder_setting_source" UNIQUE NULLS NOT DISTINCT("workspace_id","personal_event_id","application_event_id","debt_obligation_id"),
	CONSTRAINT "ck_reminder_setting_source" CHECK (num_nonnulls("time"."source_reminder_setting"."personal_event_id","time"."source_reminder_setting"."application_event_id","time"."source_reminder_setting"."debt_obligation_id")=1),
	CONSTRAINT "ck_reminder_setting_mode" CHECK ("time"."source_reminder_setting"."mode" IN ('inherit','override','off') AND "time"."source_reminder_setting"."version">0)
);
--> statement-breakpoint
ALTER TABLE "time"."reminder_occurrence" ADD CONSTRAINT "reminder_occurrence_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_occurrence" ADD CONSTRAINT "fk_reminder_occurrence_rule" FOREIGN KEY ("workspace_id","rule_id") REFERENCES "time"."reminder_rule"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_occurrence" ADD CONSTRAINT "fk_reminder_occurrence_personal" FOREIGN KEY ("workspace_id","personal_event_id") REFERENCES "time"."personal_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_occurrence" ADD CONSTRAINT "fk_reminder_occurrence_career" FOREIGN KEY ("workspace_id","application_event_id") REFERENCES "career"."application_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_occurrence" ADD CONSTRAINT "fk_reminder_occurrence_debt" FOREIGN KEY ("workspace_id","debt_obligation_id") REFERENCES "finance"."debt_obligation"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_rule" ADD CONSTRAINT "reminder_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_rule" ADD CONSTRAINT "fk_reminder_rule_personal" FOREIGN KEY ("workspace_id","personal_event_id") REFERENCES "time"."personal_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_rule" ADD CONSTRAINT "fk_reminder_rule_career" FOREIGN KEY ("workspace_id","application_event_id") REFERENCES "career"."application_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."reminder_rule" ADD CONSTRAINT "fk_reminder_rule_debt" FOREIGN KEY ("workspace_id","debt_obligation_id") REFERENCES "finance"."debt_obligation"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."source_reminder_setting" ADD CONSTRAINT "source_reminder_setting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."source_reminder_setting" ADD CONSTRAINT "fk_reminder_setting_personal" FOREIGN KEY ("workspace_id","personal_event_id") REFERENCES "time"."personal_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."source_reminder_setting" ADD CONSTRAINT "fk_reminder_setting_career" FOREIGN KEY ("workspace_id","application_event_id") REFERENCES "career"."application_event"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."source_reminder_setting" ADD CONSTRAINT "fk_reminder_setting_debt" FOREIGN KEY ("workspace_id","debt_obligation_id") REFERENCES "finance"."debt_obligation"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_reminder_occurrence_due" ON "time"."reminder_occurrence" USING btree ("workspace_id","state","scheduled_for","id");--> statement-breakpoint
CREATE INDEX "ix_reminder_occurrence_personal" ON "time"."reminder_occurrence" USING btree ("workspace_id","personal_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_occurrence_career" ON "time"."reminder_occurrence" USING btree ("workspace_id","application_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_occurrence_debt" ON "time"."reminder_occurrence" USING btree ("workspace_id","debt_obligation_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_rule_personal" ON "time"."reminder_rule" USING btree ("workspace_id","personal_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_rule_career" ON "time"."reminder_rule" USING btree ("workspace_id","application_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_rule_debt" ON "time"."reminder_rule" USING btree ("workspace_id","debt_obligation_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_setting_personal" ON "time"."source_reminder_setting" USING btree ("workspace_id","personal_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_setting_career" ON "time"."source_reminder_setting" USING btree ("workspace_id","application_event_id");--> statement-breakpoint
CREATE INDEX "ix_reminder_setting_debt" ON "time"."source_reminder_setting" USING btree ("workspace_id","debt_obligation_id");