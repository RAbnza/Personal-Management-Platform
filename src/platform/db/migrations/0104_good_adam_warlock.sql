CREATE TABLE "planning"."budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date_exclusive" date NOT NULL,
	"limit_minor" bigint NOT NULL,
	"basis" text DEFAULT 'net' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budget_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_budget_category_period" UNIQUE("workspace_id","category_id","start_date","end_date_exclusive"),
	CONSTRAINT "ck_budget_bounds" CHECK ("planning"."budget"."start_date" BETWEEN '1900-01-01'::date AND '2199-12-31'::date AND "planning"."budget"."end_date_exclusive">"planning"."budget"."start_date" AND "planning"."budget"."end_date_exclusive"<='2200-01-01'::date AND "planning"."budget"."end_date_exclusive"-"planning"."budget"."start_date"<=366 AND "planning"."budget"."limit_minor">=0 AND "planning"."budget"."basis" IN ('net','gross') AND "planning"."budget"."version">0 AND ("planning"."budget"."notes" IS NULL OR char_length("planning"."budget"."notes")<=2000))
);
--> statement-breakpoint
ALTER TABLE "planning"."budget" ADD CONSTRAINT "budget_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."budget" ADD CONSTRAINT "budget_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."budget" ADD CONSTRAINT "budget_workspace_id_category_id_category_workspace_id_id_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "core"."category"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning"."budget" ADD CONSTRAINT "budget_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_budget_category_period" ON "planning"."budget" USING btree ("workspace_id","category_id","start_date","end_date_exclusive");--> statement-breakpoint
CREATE INDEX "ix_budget_active_period" ON "planning"."budget" USING btree ("workspace_id","archived_at","start_date","end_date_exclusive","id");--> statement-breakpoint
CREATE INDEX "ix_budget_command" ON "planning"."budget" USING btree ("workspace_id","command_receipt_id");--> statement-breakpoint
CREATE INDEX "ix_budget_actor" ON "planning"."budget" USING btree ("recorded_by_user_id");