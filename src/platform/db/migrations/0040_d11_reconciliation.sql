CREATE TABLE "finance"."adjustment_detail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"signed_adjustment_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"reconciliation_id" uuid,
	CONSTRAINT "uq_adjustment_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_adjustment_revision" UNIQUE("workspace_id","action_revision_id"),
	CONSTRAINT "ck_adjustment_amount" CHECK ("finance"."adjustment_detail"."signed_adjustment_minor" <> 0 AND abs("finance"."adjustment_detail"."signed_adjustment_minor"::numeric) <= 100000000000),
	CONSTRAINT "ck_adjustment_reason" CHECK (char_length(btrim("finance"."adjustment_detail"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "finance"."reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"cutoff_date" date NOT NULL,
	"observed_minor" bigint NOT NULL,
	"calculated_minor" bigint NOT NULL,
	"financial_revision" bigint NOT NULL,
	"source_journal_count" bigint NOT NULL,
	"reference" text,
	"notes" text,
	"supersedes_reconciliation_id" uuid,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reconciliation_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_reconciliation_account_id" UNIQUE("workspace_id","financial_account_id","id"),
	CONSTRAINT "uq_reconciliation_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "uq_reconciliation_successor" UNIQUE("workspace_id","supersedes_reconciliation_id"),
	CONSTRAINT "ck_reconciliation_source" CHECK ("finance"."reconciliation"."financial_revision" >= 0 AND "finance"."reconciliation"."source_journal_count" >= 0),
	CONSTRAINT "ck_reconciliation_actor" CHECK ("finance"."reconciliation"."actor_kind" IN ('user','system','import') AND ("finance"."reconciliation"."actor_kind" <> 'user' OR "finance"."reconciliation"."recorded_by_user_id" IS NOT NULL)),
	CONSTRAINT "ck_reconciliation_text" CHECK (("finance"."reconciliation"."reference" IS NULL OR char_length("finance"."reconciliation"."reference") <= 2000) AND ("finance"."reconciliation"."notes" IS NULL OR char_length("finance"."reconciliation"."notes") <= 20000)),
	CONSTRAINT "ck_reconciliation_predecessor" CHECK ("finance"."reconciliation"."supersedes_reconciliation_id" IS NULL OR "finance"."reconciliation"."supersedes_reconciliation_id" <> "finance"."reconciliation"."id")
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."adjustment_detail" ADD CONSTRAINT "adjustment_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."adjustment_detail" ADD CONSTRAINT "fk_adjustment_account" FOREIGN KEY ("workspace_id","financial_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."adjustment_detail" ADD CONSTRAINT "fk_adjustment_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."adjustment_detail" ADD CONSTRAINT "fk_adjustment_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."adjustment_detail" ADD CONSTRAINT "fk_adjustment_reconciliation" FOREIGN KEY ("workspace_id","financial_account_id","reconciliation_id") REFERENCES "finance"."reconciliation"("workspace_id","financial_account_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."reconciliation" ADD CONSTRAINT "reconciliation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."reconciliation" ADD CONSTRAINT "reconciliation_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."reconciliation" ADD CONSTRAINT "fk_reconciliation_account" FOREIGN KEY ("workspace_id","financial_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."reconciliation" ADD CONSTRAINT "fk_reconciliation_command" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_adjustment_reconciliation" ON "finance"."adjustment_detail" USING btree ("workspace_id","reconciliation_id");--> statement-breakpoint
CREATE INDEX "ix_reconciliation_account_cutoff" ON "finance"."reconciliation" USING btree ("workspace_id","financial_account_id","cutoff_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
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
          ,'balance_adjustment'
        )
      );