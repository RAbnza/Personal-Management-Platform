CREATE SCHEMA "tracker";
--> statement-breakpoint
CREATE TABLE "tracker"."tracker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_tracker_tracker_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_tracker_lineage" UNIQUE("workspace_id","template_id","id")
);
--> statement-breakpoint
CREATE TABLE "tracker"."entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status_key" text,
	"deadline_date" date,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"notification_generation" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_tracker_entry_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_entry_parent" UNIQUE("workspace_id","tracker_id","id"),
	CONSTRAINT "tracker_entry_title" CHECK (length("tracker"."entry"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "tracker"."entry_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_revision_id" uuid,
	"values_json" jsonb NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "uq_tracker_revision_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_revision_number" UNIQUE("workspace_id","entry_id","revision_no"),
	CONSTRAINT "uq_tracker_revision_parent" UNIQUE("workspace_id","entry_id","template_version_id","id"),
	CONSTRAINT "tracker_values_object" CHECK (jsonb_typeof("tracker"."entry_revision"."values_json")='object' AND octet_length("tracker"."entry_revision"."values_json"::text)<=24000 AND "tracker"."entry_revision"."revision_no">0)
);
--> statement-breakpoint
CREATE TABLE "tracker"."field_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"required" boolean NOT NULL,
	"position" integer NOT NULL,
	"validation_json" jsonb NOT NULL,
	"default_json" jsonb,
	"retired" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_tracker_field_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_definition_field" UNIQUE("workspace_id","template_version_id","field_id"),
	CONSTRAINT "uq_tracker_definition_version" UNIQUE("workspace_id","template_version_id","id"),
	CONSTRAINT "tracker_field_type" CHECK ("tracker"."field_definition"."field_type" IN ('text','number','date','checkbox','single_select') AND "tracker"."field_definition"."position">=0 AND jsonb_typeof("tracker"."field_definition"."validation_json")='object')
);
--> statement-breakpoint
CREATE TABLE "tracker"."field_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	CONSTRAINT "uq_tracker_identity_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_identity_lineage" UNIQUE("workspace_id","template_id","id"),
	CONSTRAINT "uq_tracker_identity_key" UNIQUE("workspace_id","template_id","stable_key")
);
--> statement-breakpoint
CREATE TABLE "tracker"."field_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"option_key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_tracker_option_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_option_key" UNIQUE("workspace_id","field_definition_id","option_key")
);
--> statement-breakpoint
CREATE TABLE "tracker"."template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"preset_key" text,
	"preset_version" integer,
	"current_version_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_tracker_template_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "tracker_preset_pair" CHECK (("tracker"."template"."preset_key" IS NULL) = ("tracker"."template"."preset_version" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "tracker"."template_migration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"from_version_id" uuid NOT NULL,
	"to_version_id" uuid NOT NULL,
	"mapping_json" jsonb NOT NULL,
	"state" text DEFAULT 'preview' NOT NULL,
	"preview_counts_json" jsonb NOT NULL,
	"preview_hash" text NOT NULL,
	"last_entry_id" uuid,
	"migrated_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "uq_tracker_migration_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "tracker_migration_state" CHECK ("tracker"."template_migration"."from_version_id"<>"tracker"."template_migration"."to_version_id" AND "tracker"."template_migration"."state" IN ('preview','confirmed','running','completed','failed','cancelled') AND "tracker"."template_migration"."migrated_count">=0 AND jsonb_typeof("tracker"."template_migration"."mapping_json")='object')
);
--> statement-breakpoint
CREATE TABLE "tracker"."template_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"previous_version_id" uuid,
	"state" text DEFAULT 'building' NOT NULL,
	"name" text NOT NULL,
	"title_field_id" uuid NOT NULL,
	"status_field_id" uuid,
	"deadline_field_id" uuid,
	"completion_json" jsonb NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "uq_tracker_version_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_tracker_version_lineage" UNIQUE("workspace_id","template_id","id"),
	CONSTRAINT "uq_tracker_version_number" UNIQUE("workspace_id","template_id","version_no"),
	CONSTRAINT "tracker_version_state" CHECK ("tracker"."template_version"."state" IN ('building','published') AND "tracker"."template_version"."version_no">0)
);
--> statement-breakpoint
ALTER TABLE "tracker"."tracker" ADD CONSTRAINT "tracker_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."tracker" ADD CONSTRAINT "tracker_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."tracker" ADD CONSTRAINT "tracker_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."tracker" ADD CONSTRAINT "tracker_workspace_id_template_id_template_version_id_template_version_workspace_id_template_id_id_fk" FOREIGN KEY ("workspace_id","template_id","template_version_id") REFERENCES "tracker"."template_version"("workspace_id","template_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry" ADD CONSTRAINT "entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry" ADD CONSTRAINT "entry_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry" ADD CONSTRAINT "entry_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry" ADD CONSTRAINT "entry_workspace_id_tracker_id_tracker_workspace_id_id_fk" FOREIGN KEY ("workspace_id","tracker_id") REFERENCES "tracker"."tracker"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry" ADD CONSTRAINT "entry_workspace_id_template_version_id_template_version_workspace_id_id_fk" FOREIGN KEY ("workspace_id","template_version_id") REFERENCES "tracker"."template_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry_revision" ADD CONSTRAINT "entry_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry_revision" ADD CONSTRAINT "entry_revision_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry_revision" ADD CONSTRAINT "entry_revision_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry_revision" ADD CONSTRAINT "entry_revision_workspace_id_entry_id_entry_workspace_id_id_fk" FOREIGN KEY ("workspace_id","entry_id") REFERENCES "tracker"."entry"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."entry_revision" ADD CONSTRAINT "entry_revision_workspace_id_template_version_id_template_version_workspace_id_id_fk" FOREIGN KEY ("workspace_id","template_version_id") REFERENCES "tracker"."template_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_definition" ADD CONSTRAINT "field_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_definition" ADD CONSTRAINT "field_definition_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_definition" ADD CONSTRAINT "field_definition_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_definition" ADD CONSTRAINT "field_definition_workspace_id_template_id_template_version_id_template_version_workspace_id_template_id_id_fk" FOREIGN KEY ("workspace_id","template_id","template_version_id") REFERENCES "tracker"."template_version"("workspace_id","template_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_definition" ADD CONSTRAINT "field_definition_workspace_id_template_id_field_id_field_identity_workspace_id_template_id_id_fk" FOREIGN KEY ("workspace_id","template_id","field_id") REFERENCES "tracker"."field_identity"("workspace_id","template_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_identity" ADD CONSTRAINT "field_identity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_identity" ADD CONSTRAINT "field_identity_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_identity" ADD CONSTRAINT "field_identity_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_identity" ADD CONSTRAINT "field_identity_workspace_id_template_id_template_workspace_id_id_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "tracker"."template"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_option" ADD CONSTRAINT "field_option_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_option" ADD CONSTRAINT "field_option_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_option" ADD CONSTRAINT "field_option_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."field_option" ADD CONSTRAINT "field_option_workspace_id_field_definition_id_field_definition_workspace_id_id_fk" FOREIGN KEY ("workspace_id","field_definition_id") REFERENCES "tracker"."field_definition"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template" ADD CONSTRAINT "template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template" ADD CONSTRAINT "template_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template" ADD CONSTRAINT "template_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_tracker_id_tracker_workspace_id_id_fk" FOREIGN KEY ("workspace_id","tracker_id") REFERENCES "tracker"."tracker"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_from_version_id_template_version_workspace_id_id_fk" FOREIGN KEY ("workspace_id","from_version_id") REFERENCES "tracker"."template_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_to_version_id_template_version_workspace_id_id_fk" FOREIGN KEY ("workspace_id","to_version_id") REFERENCES "tracker"."template_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_migration" ADD CONSTRAINT "template_migration_workspace_id_tracker_id_last_entry_id_entry_workspace_id_tracker_id_id_fk" FOREIGN KEY ("workspace_id","tracker_id","last_entry_id") REFERENCES "tracker"."entry"("workspace_id","tracker_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_version" ADD CONSTRAINT "template_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_version" ADD CONSTRAINT "template_version_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_version" ADD CONSTRAINT "template_version_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker"."template_version" ADD CONSTRAINT "template_version_workspace_id_template_id_template_workspace_id_id_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "tracker"."template"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_tracker_entry_list" ON "tracker"."entry" USING btree ("workspace_id","tracker_id","status_key","id");--> statement-breakpoint
CREATE INDEX "ix_tracker_entry_deadline" ON "tracker"."entry" USING btree ("workspace_id","deadline_date","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tracker_running_migration" ON "tracker"."template_migration" USING btree ("workspace_id","tracker_id") WHERE "tracker"."template_migration"."state" IN ('confirmed','running','failed') OR ("tracker"."template_migration"."state"='cancelled' AND "tracker"."template_migration"."migrated_count">0);