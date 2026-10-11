CREATE TABLE "finance"."card_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"activity_kind" text NOT NULL,
	"transaction_date" date NOT NULL,
	"posting_date" date NOT NULL,
	"provider_reference" text,
	"signed_liability_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_card_activity_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_card_activity_revision_card" UNIQUE("workspace_id","action_revision_id","card_id"),
	CONSTRAINT "uq_card_activity_card_id" UNIQUE("workspace_id","card_id","id"),
	CONSTRAINT "ck_card_activity_kind" CHECK ("finance"."card_activity"."activity_kind" IN ('purchase', 'payment', 'fee', 'interest', 'refund', 'opening', 'adjustment')),
	CONSTRAINT "ck_card_activity_nonzero" CHECK ("finance"."card_activity"."signed_liability_minor" <> 0),
	CONSTRAINT "ck_card_activity_reference" CHECK ("finance"."card_activity"."provider_reference" IS NULL OR char_length("finance"."card_activity"."provider_reference") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "finance"."credit_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer_name" text NOT NULL,
	"liability_ledger_account_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"credit_limit_minor" bigint,
	"limit_verified_date" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_credit_card_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_credit_card_ledger" UNIQUE("workspace_id","liability_ledger_account_id"),
	CONSTRAINT "ck_credit_card_name" CHECK (char_length(btrim("finance"."credit_card"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "ck_credit_card_issuer_name" CHECK (char_length(btrim("finance"."credit_card"."issuer_name")) BETWEEN 1 AND 200),
	CONSTRAINT "ck_credit_card_currency" CHECK ("finance"."credit_card"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_credit_card_limit" CHECK ("finance"."credit_card"."credit_limit_minor" IS NULL OR "finance"."credit_card"."credit_limit_minor" >= 0),
	CONSTRAINT "ck_credit_card_notes" CHECK ("finance"."credit_card"."notes" IS NULL OR char_length("finance"."credit_card"."notes") <= 20000),
	CONSTRAINT "ck_credit_card_version" CHECK ("finance"."credit_card"."version" > 0),
	CONSTRAINT "ck_credit_card_actor_kind" CHECK ("finance"."credit_card"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_credit_card_actor_user" CHECK ("finance"."credit_card"."actor_kind" <> 'user' OR "finance"."credit_card"."recorded_by_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."ledger_account" DROP CONSTRAINT "ck_ledger_account_kind";--> statement-breakpoint
ALTER TABLE "finance"."card_activity" ADD CONSTRAINT "card_activity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_activity" ADD CONSTRAINT "fk_card_activity_card" FOREIGN KEY ("workspace_id","card_id") REFERENCES "finance"."credit_card"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."card_activity" ADD CONSTRAINT "fk_card_activity_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."credit_card" ADD CONSTRAINT "credit_card_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."credit_card" ADD CONSTRAINT "credit_card_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."credit_card" ADD CONSTRAINT "fk_credit_card_ledger_currency" FOREIGN KEY ("workspace_id","liability_ledger_account_id","currency") REFERENCES "finance"."ledger_account"("workspace_id","id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."credit_card" ADD CONSTRAINT "fk_credit_card_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_card_activity_posted" ON "finance"."card_activity" USING btree ("workspace_id","card_id","posting_date","id");--> statement-breakpoint
CREATE INDEX "ix_card_activity_action_revision" ON "finance"."card_activity" USING btree ("workspace_id","action_id","action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_credit_card_active_name" ON "finance"."credit_card" USING btree ("workspace_id","archived_at","name","id");--> statement-breakpoint
CREATE INDEX "ix_credit_card_recorded_by" ON "finance"."credit_card" USING btree ("recorded_by_user_id");--> statement-breakpoint
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
        )
      );