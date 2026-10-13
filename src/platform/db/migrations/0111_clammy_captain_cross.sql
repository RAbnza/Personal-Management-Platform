CREATE TABLE "planning"."goal_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"reserved_minor" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"write_revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_goal_reservation_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_goal_reservation_account" UNIQUE("workspace_id","goal_id","financial_account_id"),
	CONSTRAINT "ck_goal_reservation_fields" CHECK ("planning"."goal_reservation"."reserved_minor">=0 AND "planning"."goal_reservation"."version">0 AND "planning"."goal_reservation"."write_revision">=0)
);
--> statement-breakpoint
CREATE TABLE "planning"."savings_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_minor" bigint NOT NULL,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"write_revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_savings_goal_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_savings_goal_fields" CHECK (char_length(btrim("planning"."savings_goal"."name")) BETWEEN 1 AND 200 AND "planning"."savings_goal"."target_minor">0 AND ("planning"."savings_goal"."target_date" IS NULL OR "planning"."savings_goal"."target_date" BETWEEN '1900-01-01'::date AND '2199-12-31'::date) AND "planning"."savings_goal"."status" IN ('active','completed','archived') AND ("planning"."savings_goal"."notes" IS NULL OR char_length("planning"."savings_goal"."notes")<=2000) AND "planning"."savings_goal"."version">0 AND "planning"."savings_goal"."write_revision">=0)
);
--> statement-breakpoint
ALTER TABLE "planning"."goal_reservation" ADD CONSTRAINT "goal_reservation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."goal_reservation" ADD CONSTRAINT "goal_reservation_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."goal_reservation" ADD CONSTRAINT "goal_reservation_workspace_id_goal_id_savings_goal_workspace_id_id_fk" FOREIGN KEY ("workspace_id","goal_id") REFERENCES "planning"."savings_goal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."goal_reservation" ADD CONSTRAINT "goal_reservation_workspace_id_financial_account_id_financial_account_workspace_id_id_fk" FOREIGN KEY ("workspace_id","financial_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."goal_reservation" ADD CONSTRAINT "goal_reservation_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."savings_goal" ADD CONSTRAINT "savings_goal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."savings_goal" ADD CONSTRAINT "savings_goal_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."savings_goal" ADD CONSTRAINT "savings_goal_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_goal_reservation_account" ON "planning"."goal_reservation" USING btree ("workspace_id","financial_account_id");--> statement-breakpoint
CREATE INDEX "ix_goal_reservation_command" ON "planning"."goal_reservation" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_goal_reservation_actor" ON "planning"."goal_reservation" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "ix_savings_goal_status_date" ON "planning"."savings_goal" USING btree ("workspace_id","status","target_date","id");--> statement-breakpoint
CREATE INDEX "ix_savings_goal_command" ON "planning"."savings_goal" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_savings_goal_actor" ON "planning"."savings_goal" USING btree ("recorded_by_user_id");