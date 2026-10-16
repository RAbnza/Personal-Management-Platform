ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" DROP CONSTRAINT "ck_private_link_purpose";--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" DROP CONSTRAINT "ck_private_revision_shape";--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ALTER COLUMN "expense_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ALTER COLUMN "expense_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ALTER COLUMN "source_expense_revision_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD COLUMN "refund_id" uuid;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD COLUMN "settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD COLUMN "source_refund_id" uuid;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD COLUMN "source_settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD COLUMN "source_settlement_version" integer;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "fk_private_link_refund" FOREIGN KEY ("group_id","refund_id") REFERENCES "sharing"."refund"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "fk_private_link_settlement" FOREIGN KEY ("group_id","settlement_id") REFERENCES "sharing"."settlement"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "fk_private_revision_refund" FOREIGN KEY ("group_id","source_refund_id") REFERENCES "sharing"."refund"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "fk_private_revision_settlement" FOREIGN KEY ("group_id","source_settlement_id") REFERENCES "sharing"."settlement"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "uq_private_link_refund" UNIQUE("workspace_id","group_id","refund_id","purpose");--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "uq_private_link_settlement" UNIQUE("workspace_id","group_id","settlement_id","purpose");--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "ck_action_revision_action_kind" CHECK (
        "finance"."action_revision"."action_kind"
        IN (
          'opening_cash',
          'income',
          'expense',
          'transfer',
          'standalone_fee',
          'opening_debt',
          'borrowing',
          'debt_charge',
          'debt_settlement',
          'debt_payment',
          'payment_reclassification'
          ,'group_adoption'
          ,'group_effect'
          ,'balance_adjustment','refund',
          'opening_card',
          'card_purchase',
          'card_payment',
          'card_fee',
          'card_interest',
          'card_refund',
          'card_adjustment'
        )
      );--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "ck_private_link_purpose" CHECK (("finance"."private_group_link"."purpose"='bill_adoption' AND "finance"."private_group_link"."expense_id" IS NOT NULL AND "finance"."private_group_link"."refund_id" IS NULL AND "finance"."private_group_link"."settlement_id" IS NULL) OR ("finance"."private_group_link"."purpose"='refund_adoption' AND "finance"."private_group_link"."expense_id" IS NULL AND "finance"."private_group_link"."refund_id" IS NOT NULL AND "finance"."private_group_link"."settlement_id" IS NULL) OR ("finance"."private_group_link"."purpose" IN ('settlement_sent','settlement_received') AND "finance"."private_group_link"."expense_id" IS NULL AND "finance"."private_group_link"."refund_id" IS NULL AND "finance"."private_group_link"."settlement_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "ck_private_revision_shape" CHECK ("finance"."private_group_link_revision"."paid_minor">=0 AND "finance"."private_group_link_revision"."share_minor">=0 AND "finance"."private_group_link_revision"."accepted_source_hash" ~ '^[a-f0-9]{64}$' AND "finance"."private_group_link_revision"."adoption_kind" IN ('new_posting','existing_action_reclassification','clearing_resolution') AND (("finance"."private_group_link_revision"."expense_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_version" IS NULL) OR ("finance"."private_group_link_revision"."expense_id" IS NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_version" IS NULL) OR ("finance"."private_group_link_revision"."expense_id" IS NULL AND "finance"."private_group_link_revision"."source_expense_revision_id" IS NULL AND "finance"."private_group_link_revision"."source_refund_id" IS NULL AND "finance"."private_group_link_revision"."source_settlement_id" IS NOT NULL AND "finance"."private_group_link_revision"."source_settlement_version">0)) AND (("finance"."private_group_link_revision"."revision_no"=1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NULL) OR ("finance"."private_group_link_revision"."revision_no">1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NOT NULL)));