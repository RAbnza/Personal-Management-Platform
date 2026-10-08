CREATE TABLE "finance"."debt_settlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"payment_id" uuid,
	"prior_schedule_version_id" uuid NOT NULL,
	"closing_schedule_version_id" uuid NOT NULL,
	"settlement_date" date NOT NULL,
	"confirmed_payoff_minor" bigint NOT NULL,
	"actual_cash_paid_minor" bigint NOT NULL,
	"settlement_kind" text NOT NULL,
	"provider_reference" text,
	"reason" text NOT NULL,
	"resolved_unapplied_minor" bigint DEFAULT 0 NOT NULL,
	"unapplied_resolution_note" text,
	"confirmation_source" text NOT NULL,
	"confirmation_note" text NOT NULL,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_settlement_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_settlement_revision" UNIQUE("workspace_id","action_revision_id"),
	CONSTRAINT "uq_debt_settlement_debt" UNIQUE("workspace_id","debt_id"),
	CONSTRAINT "uq_debt_settlement_closing" UNIQUE("workspace_id","closing_schedule_version_id"),
	CONSTRAINT "ck_settlement_amounts" CHECK ("finance"."debt_settlement"."confirmed_payoff_minor">=0 AND "finance"."debt_settlement"."actual_cash_paid_minor">="finance"."debt_settlement"."confirmed_payoff_minor" AND "finance"."debt_settlement"."resolved_unapplied_minor">=0),
	CONSTRAINT "ck_settlement_kind" CHECK ("finance"."debt_settlement"."settlement_kind" IN ('normal','early')),
	CONSTRAINT "ck_settlement_confirmation" CHECK ("finance"."debt_settlement"."confirmation_source" IN ('user','provider') AND length(trim("finance"."debt_settlement"."confirmation_note"))>0 AND length(trim("finance"."debt_settlement"."reason"))>0 AND ("finance"."debt_settlement"."resolved_unapplied_minor"=0 OR length(trim("finance"."debt_settlement"."unapplied_resolution_note"))>0)),
	CONSTRAINT "ck_settlement_actor" CHECK ("finance"."debt_settlement"."actor_kind" IN ('user','system','import') AND ("finance"."debt_settlement"."actor_kind"<>'user' OR "finance"."debt_settlement"."recorded_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "finance"."settlement_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"component_kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"recognized_source_posting_id" uuid,
	"effect_posting_id" uuid,
	"counter_posting_id" uuid,
	"liability_component" text,
	"unknown_opening" boolean DEFAULT false NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_settlement_component_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_settlement_component_effect" UNIQUE("workspace_id","effect_posting_id"),
	CONSTRAINT "uq_settlement_component_counter" UNIQUE("workspace_id","counter_posting_id"),
	CONSTRAINT "ck_settlement_component_kind" CHECK ("finance"."settlement_component"."component_kind" IN ('recognized_charge','recognized_waiver','avoided_future_charge','rounding_correction')),
	CONSTRAINT "ck_settlement_component_amount" CHECK ("finance"."settlement_component"."amount_minor">0 AND "finance"."settlement_component"."amount_minor"<=100000000000 AND length(trim("finance"."settlement_component"."explanation"))>0),
	CONSTRAINT "ck_settlement_component_shape" CHECK (("finance"."settlement_component"."component_kind"='avoided_future_charge' AND "finance"."settlement_component"."effect_posting_id" IS NULL AND "finance"."settlement_component"."counter_posting_id" IS NULL AND "finance"."settlement_component"."recognized_source_posting_id" IS NULL AND "finance"."settlement_component"."liability_component" IS NULL AND NOT "finance"."settlement_component"."unknown_opening") OR ("finance"."settlement_component"."component_kind"<>'avoided_future_charge' AND "finance"."settlement_component"."effect_posting_id" IS NOT NULL AND "finance"."settlement_component"."counter_posting_id" IS NOT NULL AND "finance"."settlement_component"."liability_component" IN ('principal','interest','fee','penalty','unclassified')))
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "debt_settlement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "debt_settlement_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_payment" FOREIGN KEY ("workspace_id","debt_id","payment_id") REFERENCES "finance"."debt_payment"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_prior_schedule" FOREIGN KEY ("workspace_id","debt_id","prior_schedule_version_id") REFERENCES "finance"."debt_schedule_version"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_settlement" ADD CONSTRAINT "fk_settlement_closing_schedule" FOREIGN KEY ("workspace_id","debt_id","closing_schedule_version_id") REFERENCES "finance"."debt_schedule_version"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."settlement_component" ADD CONSTRAINT "settlement_component_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."settlement_component" ADD CONSTRAINT "fk_settlement_component_parent" FOREIGN KEY ("workspace_id","settlement_id") REFERENCES "finance"."debt_settlement"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."settlement_component" ADD CONSTRAINT "fk_settlement_component_source" FOREIGN KEY ("workspace_id","recognized_source_posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."settlement_component" ADD CONSTRAINT "fk_settlement_component_effect" FOREIGN KEY ("workspace_id","effect_posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."settlement_component" ADD CONSTRAINT "fk_settlement_component_counter" FOREIGN KEY ("workspace_id","counter_posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_settlement_debt_date" ON "finance"."debt_settlement" USING btree ("workspace_id","debt_id","settlement_date");--> statement-breakpoint
CREATE INDEX "ix_settlement_component_parent" ON "finance"."settlement_component" USING btree ("workspace_id","settlement_id");--> statement-breakpoint
CREATE INDEX "ix_settlement_component_source" ON "finance"."settlement_component" USING btree ("workspace_id","recognized_source_posting_id");--> statement-breakpoint
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
        )
      );