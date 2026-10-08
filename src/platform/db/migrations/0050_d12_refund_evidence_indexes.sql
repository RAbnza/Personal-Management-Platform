ALTER TABLE "finance"."refund_allocation" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."refund_detail" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_refund_original_posting" ON "finance"."refund_allocation" USING btree ("workspace_id","original_purchase_posting_id");--> statement-breakpoint
CREATE INDEX "ix_refund_purchase" ON "finance"."refund_detail" USING btree ("workspace_id","purchase_action_id");--> statement-breakpoint
CREATE INDEX "ix_refund_destination" ON "finance"."refund_detail" USING btree ("workspace_id","destination_ledger_account_id");--> statement-breakpoint
ALTER TABLE "finance"."refund_allocation" ADD CONSTRAINT "uq_refund_allocation_scope" UNIQUE("workspace_id","id");