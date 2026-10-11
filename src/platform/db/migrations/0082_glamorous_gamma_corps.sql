CREATE TABLE "finance"."card_action_detail" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"posting_date" date NOT NULL,
	"provider_reference" text,
	"confirmation_source" text NOT NULL,
	"paying_account_id" uuid,
	"purchase_action_id" uuid,
	CONSTRAINT "card_action_detail_workspace_id_action_revision_id_pk" PRIMARY KEY("workspace_id","action_revision_id"),
	CONSTRAINT "uq_card_action_detail_parent" UNIQUE("workspace_id","action_id","action_revision_id"),
	CONSTRAINT "ck_card_action_amount" CHECK ("finance"."card_action_detail"."amount_minor">0 AND "finance"."card_action_detail"."amount_minor"<=100000000000),
	CONSTRAINT "ck_card_action_confirmation" CHECK (char_length(btrim("finance"."card_action_detail"."confirmation_source")) BETWEEN 1 AND 2000),
	CONSTRAINT "ck_card_action_reference" CHECK ("finance"."card_action_detail"."provider_reference" IS NULL OR char_length(btrim("finance"."card_action_detail"."provider_reference")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "finance"."card_refund_part" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"original_purchase_posting_id" uuid NOT NULL,
	"refund_posting_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "uq_card_refund_source" UNIQUE("workspace_id","action_revision_id","original_purchase_posting_id"),
	CONSTRAINT "uq_card_refund_posting" UNIQUE("workspace_id","refund_posting_id"),
	CONSTRAINT "ck_card_refund_part_amount" CHECK ("finance"."card_refund_part"."amount_minor">0 AND "finance"."card_refund_part"."amount_minor"<=100000000000)
);
--> statement-breakpoint
CREATE TABLE "finance"."card_statement_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"statement_revision_id" uuid NOT NULL,
	"source_action_revision_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reverses_allocation_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"confirmation_kind" text NOT NULL,
	"confirmation_source" text NOT NULL,
	"confirmed_date" date NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_card_allocation_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_card_allocation_reversal" UNIQUE("workspace_id","reverses_allocation_id"),
	CONSTRAINT "uq_card_allocation_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_card_allocation_amount" CHECK ("finance"."card_statement_allocation"."amount_minor">0 AND "finance"."card_statement_allocation"."amount_minor"<=100000000000),
	CONSTRAINT "ck_card_allocation_confirmation" CHECK ("finance"."card_statement_allocation"."confirmation_kind" IN ('provider','user') AND char_length(btrim("finance"."card_statement_allocation"."confirmation_source")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "finance"."card_action_detail" ADD CONSTRAINT "card_action_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_action_detail" ADD CONSTRAINT "card_action_detail_workspace_id_action_id_action_revision_id_action_revision_workspace_id_action_id_id_fk" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_action_detail" ADD CONSTRAINT "card_action_detail_workspace_id_card_id_credit_card_workspace_id_id_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "finance"."credit_card"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_action_detail" ADD CONSTRAINT "card_action_detail_workspace_id_paying_account_id_financial_account_workspace_id_id_fk" FOREIGN KEY ("workspace_id","paying_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_action_detail" ADD CONSTRAINT "card_action_detail_workspace_id_purchase_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","purchase_action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_refund_part" ADD CONSTRAINT "card_refund_part_workspace_id_action_id_action_revision_id_card_action_detail_workspace_id_action_id_action_revision_id_fk" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."card_action_detail"("workspace_id","action_id","action_revision_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_refund_part" ADD CONSTRAINT "card_refund_part_workspace_id_original_purchase_posting_id_posting_workspace_id_id_fk" FOREIGN KEY ("workspace_id","original_purchase_posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_refund_part" ADD CONSTRAINT "card_refund_part_workspace_id_action_revision_id_refund_posting_id_posting_workspace_id_action_revision_id_id_fk" FOREIGN KEY ("workspace_id","action_revision_id","refund_posting_id") REFERENCES "finance"."posting"("workspace_id","action_revision_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_allocation" ADD CONSTRAINT "card_statement_allocation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_allocation" ADD CONSTRAINT "card_statement_allocation_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_allocation" ADD CONSTRAINT "card_statement_allocation_workspace_id_statement_revision_id_card_statement_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","statement_revision_id") REFERENCES "finance"."card_statement_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_allocation" ADD CONSTRAINT "card_statement_allocation_workspace_id_source_action_revision_id_action_revision_workspace_id_id_fk" FOREIGN KEY ("workspace_id","source_action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."card_statement_allocation" ADD CONSTRAINT "card_statement_allocation_workspace_id_command_receipt_id_command_receipt_workspace_id_id_fk" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_card_action_card" ON "finance"."card_action_detail" USING btree ("workspace_id","card_id","posting_date");--> statement-breakpoint
CREATE INDEX "ix_card_action_purchase" ON "finance"."card_action_detail" USING btree ("workspace_id","purchase_action_id");--> statement-breakpoint
CREATE INDEX "ix_card_refund_source" ON "finance"."card_refund_part" USING btree ("workspace_id","original_purchase_posting_id");--> statement-breakpoint
CREATE INDEX "ix_card_allocation_source" ON "finance"."card_statement_allocation" USING btree ("workspace_id","source_action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_card_allocation_statement" ON "finance"."card_statement_allocation" USING btree ("workspace_id","statement_revision_id");--> statement-breakpoint
CREATE INDEX "ix_card_allocation_actor" ON "finance"."card_statement_allocation" USING btree ("recorded_by_user_id");