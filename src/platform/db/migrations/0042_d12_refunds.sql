CREATE TABLE "finance"."refund_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"original_purchase_posting_id" uuid NOT NULL,
	"refund_posting_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"allocation_kind" text NOT NULL,
	CONSTRAINT "uq_refund_allocation_posting" UNIQUE("workspace_id","refund_posting_id"),
	CONSTRAINT "ck_refund_allocation" CHECK ("finance"."refund_allocation"."amount_minor">0 AND "finance"."refund_allocation"."amount_minor"<=100000000000 AND "finance"."refund_allocation"."allocation_kind" IN ('purchase','fee'))
);
--> statement-breakpoint
CREATE TABLE "finance"."refund_detail" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"purchase_action_id" uuid NOT NULL,
	"refund_minor" bigint NOT NULL,
	"destination_ledger_account_id" uuid NOT NULL,
	"reason" text,
	CONSTRAINT "refund_detail_workspace_id_action_revision_id_pk" PRIMARY KEY("workspace_id","action_revision_id"),
	CONSTRAINT "uq_refund_revision_action" UNIQUE("workspace_id","action_id","action_revision_id"),
	CONSTRAINT "ck_refund_amount" CHECK ("finance"."refund_detail"."refund_minor">0 AND "finance"."refund_detail"."refund_minor"<=100000000000)
);
--> statement-breakpoint
ALTER TABLE "finance"."refund_allocation" ADD CONSTRAINT "refund_allocation_workspace_id_action_id_action_revision_id_refund_detail_workspace_id_action_id_action_revision_id_fk" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."refund_detail"("workspace_id","action_id","action_revision_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_allocation" ADD CONSTRAINT "refund_allocation_workspace_id_original_purchase_posting_id_posting_workspace_id_id_fk" FOREIGN KEY ("workspace_id","original_purchase_posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_allocation" ADD CONSTRAINT "refund_allocation_workspace_id_action_revision_id_refund_posting_id_posting_workspace_id_action_revision_id_id_fk" FOREIGN KEY ("workspace_id","action_revision_id","refund_posting_id") REFERENCES "finance"."posting"("workspace_id","action_revision_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_detail" ADD CONSTRAINT "refund_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_detail" ADD CONSTRAINT "refund_detail_workspace_id_action_id_action_revision_id_action_revision_workspace_id_action_id_id_fk" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_detail" ADD CONSTRAINT "refund_detail_workspace_id_purchase_action_id_financial_action_workspace_id_id_fk" FOREIGN KEY ("workspace_id","purchase_action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."refund_detail" ADD CONSTRAINT "refund_detail_workspace_id_destination_ledger_account_id_ledger_account_workspace_id_id_fk" FOREIGN KEY ("workspace_id","destination_ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;