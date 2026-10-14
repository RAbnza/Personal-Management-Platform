CREATE TABLE "time"."notification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"outcome" text DEFAULT 'attempted' NOT NULL,
	"recipient_fingerprint" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "uq_notification_attempt_no" UNIQUE("workspace_id","delivery_id","attempt_no"),
	CONSTRAINT "ck_notification_attempt" CHECK ("time"."notification_attempt"."attempt_no" BETWEEN 1 AND 3 AND "time"."notification_attempt"."outcome" IN ('attempted','accepted','rejected','uncertain') AND "time"."notification_attempt"."recipient_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "time"."notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reminder_occurrence_id" uuid NOT NULL,
	"logical_key" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"provider_message_id" text,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "uq_notification_delivery_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_notification_delivery_key" UNIQUE("workspace_id","logical_key"),
	CONSTRAINT "uq_notification_delivery_occurrence" UNIQUE("workspace_id","reminder_occurrence_id"),
	CONSTRAINT "ck_notification_delivery_status" CHECK ("time"."notification_delivery"."status" IN ('scheduled','attempted','accepted','delivered','suppressed','cancelled','failed','bounced','uncertain') AND ("time"."notification_delivery"."accepted_at" IS NULL OR "time"."notification_delivery"."provider_message_id" IS NOT NULL) AND ("time"."notification_delivery"."delivered_at" IS NULL OR "time"."notification_delivery"."accepted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "time"."notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"timezone" text,
	"quiet_start" text,
	"quiet_end" text,
	"include_due_date" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notification_preference_workspace" UNIQUE("workspace_id"),
	CONSTRAINT "ck_notification_preference" CHECK ("time"."notification_preference"."version">0 AND ("time"."notification_preference"."enabled"=("time"."notification_preference"."enabled_at" IS NOT NULL)) AND (("time"."notification_preference"."quiet_start" IS NULL AND "time"."notification_preference"."quiet_end" IS NULL) OR ("time"."notification_preference"."quiet_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "time"."notification_preference"."quiet_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "time"."notification_preference"."quiet_start"<>"time"."notification_preference"."quiet_end")))
);
--> statement-breakpoint
CREATE TABLE "time"."notification_provider_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_provider_event_provider_event_id_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "ck_notification_event" CHECK ("time"."notification_provider_event"."event_type" IN ('email.sent','email.delivered','email.bounced','email.failed') AND char_length("time"."notification_provider_event"."provider_event_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "time"."notification_attempt" ADD CONSTRAINT "notification_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_attempt" ADD CONSTRAINT "notification_attempt_workspace_id_delivery_id_notification_delivery_workspace_id_id_fk" FOREIGN KEY ("workspace_id","delivery_id") REFERENCES "time"."notification_delivery"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_delivery" ADD CONSTRAINT "notification_delivery_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_delivery" ADD CONSTRAINT "notification_delivery_workspace_id_reminder_occurrence_id_reminder_occurrence_workspace_id_id_fk" FOREIGN KEY ("workspace_id","reminder_occurrence_id") REFERENCES "time"."reminder_occurrence"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_preference" ADD CONSTRAINT "notification_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_preference" ADD CONSTRAINT "notification_preference_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_provider_event" ADD CONSTRAINT "notification_provider_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time"."notification_provider_event" ADD CONSTRAINT "notification_provider_event_workspace_id_delivery_id_notification_delivery_workspace_id_id_fk" FOREIGN KEY ("workspace_id","delivery_id") REFERENCES "time"."notification_delivery"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notification_delivery_due" ON "time"."notification_delivery" USING btree ("status","scheduled_at","id");