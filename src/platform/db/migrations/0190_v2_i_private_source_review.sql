CREATE TABLE "finance"."private_group_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"accepted_link_revision_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"reviewed_source_json" jsonb NOT NULL,
	"decision" text DEFAULT 'retain_private_evidence' NOT NULL,
	"reason" text NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_group_review_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_group_review_receipt" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_group_review_shape" CHECK ("finance"."private_group_review"."source_hash" ~ '^[a-f0-9]{64}$' AND "finance"."private_group_review"."decision"='retain_private_evidence' AND length(btrim("finance"."private_group_review"."reason")) BETWEEN 1 AND 2000 AND jsonb_typeof("finance"."private_group_review"."reviewed_source_json")='object')
);
--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" DROP CONSTRAINT "ck_private_revision_shape";--> statement-breakpoint
ALTER TABLE "finance"."private_group_review" ADD CONSTRAINT "private_group_review_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_review" ADD CONSTRAINT "fk_group_review_link" FOREIGN KEY ("workspace_id","link_id","accepted_link_revision_id") REFERENCES "finance"."private_group_link_revision"("workspace_id","link_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_review" ADD CONSTRAINT "fk_group_review_receipt" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "ck_private_revision_shape" CHECK ("finance"."private_group_link_revision"."paid_minor">=0 AND "finance"."private_group_link_revision"."share_minor">=0 AND "finance"."private_group_link_revision"."accepted_source_hash" ~ '^[a-f0-9]{64}$' AND "finance"."private_group_link_revision"."adoption_kind" IN ('new_posting','existing_action_reclassification','clearing_resolution') AND (("finance"."private_group_link_revision"."expense_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_version" IS NULL) OR ("finance"."private_group_link_revision"."expense_id" IS NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_version" IS NULL) OR ("finance"."private_group_link_revision"."expense_id" IS NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_settlement_version" IS NOT NULL AND "finance"."private_group_link_revision"."source_settlement_version">0)) AND (("finance"."private_group_link_revision"."revision_no"=1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NULL) OR ("finance"."private_group_link_revision"."revision_no">1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NOT NULL)));