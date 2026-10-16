CREATE TABLE "finance"."group_ledger_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"receivable_ledger_account_id" uuid NOT NULL,
	"payable_ledger_account_id" uuid NOT NULL,
	CONSTRAINT "uq_binding_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_binding_person" UNIQUE("workspace_id","group_id","participant_id"),
	CONSTRAINT "uq_binding_receivable" UNIQUE("workspace_id","receivable_ledger_account_id"),
	CONSTRAINT "uq_binding_payable" UNIQUE("workspace_id","payable_ledger_account_id")
);
--> statement-breakpoint
CREATE TABLE "finance"."private_group_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"purpose" text DEFAULT 'bill_adoption' NOT NULL,
	"action_id" uuid NOT NULL,
	"current_link_revision_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_private_link_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_private_link_source" UNIQUE("workspace_id","group_id","expense_id","purpose"),
	CONSTRAINT "uq_private_link_action" UNIQUE("workspace_id","action_id"),
	CONSTRAINT "ck_private_link_purpose" CHECK ("finance"."private_group_link"."purpose"='bill_adoption')
);
--> statement-breakpoint
CREATE TABLE "finance"."private_group_link_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"source_expense_revision_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_link_revision_id" uuid,
	"accepted_source_hash" text NOT NULL,
	"adoption_kind" text NOT NULL,
	"paid_minor" bigint NOT NULL,
	"share_minor" bigint NOT NULL,
	"consent_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_private_link_revision_scope" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_private_link_revision_no" UNIQUE("workspace_id","link_id","revision_no"),
	CONSTRAINT "uq_private_link_revision_identity" UNIQUE("workspace_id","link_id","id"),
	CONSTRAINT "uq_private_link_action_revision" UNIQUE("workspace_id","action_revision_id"),
	CONSTRAINT "ck_private_revision_shape" CHECK ("finance"."private_group_link_revision"."paid_minor">=0 AND "finance"."private_group_link_revision"."share_minor">=0 AND "finance"."private_group_link_revision"."accepted_source_hash" ~ '^[a-f0-9]{64}$' AND "finance"."private_group_link_revision"."adoption_kind" IN ('new_posting','existing_action_reclassification') AND (("finance"."private_group_link_revision"."revision_no"=1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NULL) OR ("finance"."private_group_link_revision"."revision_no">1 AND "finance"."private_group_link_revision"."previous_link_revision_id" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."ledger_account" DROP CONSTRAINT "ck_ledger_account_kind";--> statement-breakpoint
ALTER TABLE "finance"."group_ledger_binding" ADD CONSTRAINT "group_ledger_binding_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."group_ledger_binding" ADD CONSTRAINT "fk_binding_participant" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."group_ledger_binding" ADD CONSTRAINT "fk_binding_receivable" FOREIGN KEY ("workspace_id","receivable_ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."group_ledger_binding" ADD CONSTRAINT "fk_binding_payable" FOREIGN KEY ("workspace_id","payable_ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "private_group_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "fk_private_link_participant" FOREIGN KEY ("group_id","participant_id") REFERENCES "sharing"."participant"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "fk_private_link_expense" FOREIGN KEY ("group_id","expense_id") REFERENCES "sharing"."shared_expense"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link" ADD CONSTRAINT "fk_private_link_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "private_group_link_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "fk_private_revision_link" FOREIGN KEY ("workspace_id","link_id") REFERENCES "finance"."private_group_link"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "fk_private_revision_source" FOREIGN KEY ("group_id","expense_id","source_expense_revision_id") REFERENCES "sharing"."expense_revision"("group_id","expense_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."private_group_link_revision" ADD CONSTRAINT "fk_private_revision_action" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "finance"."ledger_account" ADD CONSTRAINT "ck_ledger_account_kind" CHECK (
        "finance"."ledger_account"."kind"
        IN (
          'cash_asset',
          'expense',
          'income',
          'opening_equity',
          'adjustment_equity',
          'debt_liability',
          'payment_clearing_asset',
          'card_liability'
          ,'group_receivable_asset','group_payable_liability'
        )
      );