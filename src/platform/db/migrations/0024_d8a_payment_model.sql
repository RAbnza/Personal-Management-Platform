CREATE TABLE "finance"."debt_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_payment_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_payment_action" UNIQUE("workspace_id","action_id"),
	CONSTRAINT "uq_debt_payment_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "uq_debt_payment_identity" UNIQUE("workspace_id","id","action_id"),
	CONSTRAINT "ck_debt_payment_actor_kind" CHECK ("finance"."debt_payment"."actor_kind" IN ('user','system','import')),
	CONSTRAINT "ck_debt_payment_actor_user" CHECK ("finance"."debt_payment"."actor_kind" <> 'user' OR "finance"."debt_payment"."recorded_by_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "finance"."debt_payment_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"paid_against_schedule_version_id" uuid NOT NULL,
	"paying_account_id" uuid NOT NULL,
	"actual_paid_minor" bigint NOT NULL,
	"contractual_minor" bigint NOT NULL,
	"external_fee_minor" bigint DEFAULT 0 NOT NULL,
	"unapplied_contractual_minor" bigint DEFAULT 0 NOT NULL,
	"allocation_certainty" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_payment_revision_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_payment_revision_revision" UNIQUE("workspace_id","action_revision_id"),
	CONSTRAINT "uq_debt_payment_revision_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "uq_debt_payment_revision_payment_id" UNIQUE("workspace_id","debt_id","payment_id","id"),
	CONSTRAINT "ck_debt_payment_revision_amounts" CHECK ("finance"."debt_payment_revision"."actual_paid_minor" > 0 AND "finance"."debt_payment_revision"."actual_paid_minor" <= 100000000000 AND "finance"."debt_payment_revision"."contractual_minor" >= 0 AND "finance"."debt_payment_revision"."external_fee_minor" >= 0 AND "finance"."debt_payment_revision"."unapplied_contractual_minor" >= 0 AND "finance"."debt_payment_revision"."unapplied_contractual_minor" <= "finance"."debt_payment_revision"."contractual_minor" AND "finance"."debt_payment_revision"."actual_paid_minor"::numeric = "finance"."debt_payment_revision"."contractual_minor"::numeric + "finance"."debt_payment_revision"."external_fee_minor"::numeric),
	CONSTRAINT "ck_debt_payment_revision_certainty" CHECK ("finance"."debt_payment_revision"."allocation_certainty" IN ('confirmed_total','known_components','unresolved'))
);
--> statement-breakpoint
CREATE TABLE "finance"."payment_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"payment_revision_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"disposition" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_component_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payment_component_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_payment_component_posting" UNIQUE("workspace_id","payment_revision_id","posting_id"),
	CONSTRAINT "uq_payment_component_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "ck_payment_component_amount" CHECK ("finance"."payment_component"."amount_minor" > 0 AND "finance"."payment_component"."amount_minor" <= 100000000000),
	CONSTRAINT "ck_payment_component_disposition" CHECK ("finance"."payment_component"."disposition" IN ('liability_reduction','new_interest','new_fee','new_penalty','clearing','advance','external_fee'))
);
--> statement-breakpoint
CREATE TABLE "finance"."payment_due_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"payment_revision_id" uuid NOT NULL,
	"schedule_version_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payment_due_allocation_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_payment_due_allocation_installment" UNIQUE("workspace_id","payment_revision_id","installment_id"),
	CONSTRAINT "uq_payment_due_allocation_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "uq_payment_due_allocation_source" UNIQUE("workspace_id","debt_id","payment_revision_id","id"),
	CONSTRAINT "ck_payment_due_allocation_amount" CHECK ("finance"."payment_due_allocation"."amount_minor" > 0 AND "finance"."payment_due_allocation"."amount_minor" <= 100000000000)
);
--> statement-breakpoint
CREATE TABLE "finance"."payment_reclassification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"source_component_id" uuid NOT NULL,
	"clearing_credit_posting_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payment_reclassification_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_payment_reclassification_credit" UNIQUE("workspace_id","clearing_credit_posting_id"),
	CONSTRAINT "ck_payment_reclassification_amount" CHECK ("finance"."payment_reclassification"."amount_minor" > 0 AND "finance"."payment_reclassification"."amount_minor" <= 100000000000),
	CONSTRAINT "ck_payment_reclassification_reason" CHECK (char_length(btrim("finance"."payment_reclassification"."reason")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "finance"."schedule_allocation_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"target_schedule_version_id" uuid NOT NULL,
	"payment_revision_id" uuid NOT NULL,
	"source_allocation_id" uuid,
	"source_kind" text NOT NULL,
	"target_installment_id" uuid,
	"amount_minor" bigint NOT NULL,
	"target_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_schedule_allocation_map_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_schedule_allocation_map_path" UNIQUE NULLS NOT DISTINCT("workspace_id","target_schedule_version_id","payment_revision_id","source_allocation_id","target_installment_id"),
	CONSTRAINT "ck_schedule_allocation_map_amount" CHECK ("finance"."schedule_allocation_map"."amount_minor" > 0 AND "finance"."schedule_allocation_map"."amount_minor" <= 100000000000),
	CONSTRAINT "ck_schedule_allocation_map_source_shape" CHECK (("finance"."schedule_allocation_map"."source_kind" = 'allocation' AND "finance"."schedule_allocation_map"."source_allocation_id" IS NOT NULL) OR ("finance"."schedule_allocation_map"."source_kind" = 'unapplied' AND "finance"."schedule_allocation_map"."source_allocation_id" IS NULL)),
	CONSTRAINT "ck_schedule_allocation_map_target_shape" CHECK (("finance"."schedule_allocation_map"."target_kind" = 'installment' AND "finance"."schedule_allocation_map"."target_installment_id" IS NOT NULL) OR ("finance"."schedule_allocation_map"."target_kind" = 'unapplied' AND "finance"."schedule_allocation_map"."target_installment_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."debt_payment" ADD CONSTRAINT "debt_payment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment" ADD CONSTRAINT "debt_payment_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment" ADD CONSTRAINT "fk_debt_payment_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment" ADD CONSTRAINT "fk_debt_payment_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "debt_payment_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "fk_debt_payment_revision_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "fk_debt_payment_revision_payment" FOREIGN KEY ("workspace_id","debt_id","payment_id") REFERENCES "finance"."debt_payment"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "fk_debt_payment_revision_payment_action" FOREIGN KEY ("workspace_id","payment_id","action_id") REFERENCES "finance"."debt_payment"("workspace_id","id","action_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "fk_debt_payment_revision_schedule" FOREIGN KEY ("workspace_id","debt_id","paid_against_schedule_version_id") REFERENCES "finance"."debt_schedule_version"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_payment_revision" ADD CONSTRAINT "fk_debt_payment_revision_account" FOREIGN KEY ("workspace_id","paying_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_component" ADD CONSTRAINT "payment_component_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_component" ADD CONSTRAINT "fk_payment_component_payment_revision" FOREIGN KEY ("workspace_id","debt_id","payment_revision_id") REFERENCES "finance"."debt_payment_revision"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_component" ADD CONSTRAINT "fk_payment_component_posting" FOREIGN KEY ("workspace_id","posting_id") REFERENCES "finance"."posting"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_component" ADD CONSTRAINT "fk_payment_component_fee" FOREIGN KEY ("workspace_id","fee_component_id") REFERENCES "finance"."fee_component"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_due_allocation" ADD CONSTRAINT "payment_due_allocation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_due_allocation" ADD CONSTRAINT "fk_payment_due_allocation_payment_revision" FOREIGN KEY ("workspace_id","debt_id","payment_revision_id") REFERENCES "finance"."debt_payment_revision"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_due_allocation" ADD CONSTRAINT "fk_payment_due_allocation_installment" FOREIGN KEY ("workspace_id","debt_id","schedule_version_id","installment_id") REFERENCES "finance"."scheduled_installment"("workspace_id","debt_id","schedule_version_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_reclassification" ADD CONSTRAINT "payment_reclassification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_reclassification" ADD CONSTRAINT "fk_payment_reclassification_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_reclassification" ADD CONSTRAINT "fk_payment_reclassification_payment" FOREIGN KEY ("workspace_id","debt_id","payment_id") REFERENCES "finance"."debt_payment"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_reclassification" ADD CONSTRAINT "fk_payment_reclassification_component" FOREIGN KEY ("workspace_id","debt_id","source_component_id") REFERENCES "finance"."payment_component"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."payment_reclassification" ADD CONSTRAINT "fk_payment_reclassification_credit" FOREIGN KEY ("workspace_id","action_revision_id","clearing_credit_posting_id") REFERENCES "finance"."posting"("workspace_id","action_revision_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."schedule_allocation_map" ADD CONSTRAINT "schedule_allocation_map_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."schedule_allocation_map" ADD CONSTRAINT "fk_schedule_allocation_map_payment_revision" FOREIGN KEY ("workspace_id","debt_id","payment_revision_id") REFERENCES "finance"."debt_payment_revision"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."schedule_allocation_map" ADD CONSTRAINT "fk_schedule_allocation_map_source" FOREIGN KEY ("workspace_id","debt_id","payment_revision_id","source_allocation_id") REFERENCES "finance"."payment_due_allocation"("workspace_id","debt_id","payment_revision_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."schedule_allocation_map" ADD CONSTRAINT "fk_schedule_allocation_map_target_schedule" FOREIGN KEY ("workspace_id","debt_id","target_schedule_version_id") REFERENCES "finance"."debt_schedule_version"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."schedule_allocation_map" ADD CONSTRAINT "fk_schedule_allocation_map_target_entry" FOREIGN KEY ("workspace_id","debt_id","target_schedule_version_id","target_installment_id") REFERENCES "finance"."scheduled_installment"("workspace_id","debt_id","schedule_version_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_debt_payment_revision_payment" ON "finance"."debt_payment_revision" USING btree ("workspace_id","payment_id");--> statement-breakpoint
CREATE INDEX "ix_debt_payment_revision_schedule" ON "finance"."debt_payment_revision" USING btree ("workspace_id","debt_id","paid_against_schedule_version_id");--> statement-breakpoint
CREATE INDEX "ix_debt_payment_revision_account" ON "finance"."debt_payment_revision" USING btree ("workspace_id","paying_account_id");--> statement-breakpoint
CREATE INDEX "ix_payment_component_posting" ON "finance"."payment_component" USING btree ("workspace_id","posting_id");--> statement-breakpoint
CREATE INDEX "ix_payment_component_fee" ON "finance"."payment_component" USING btree ("workspace_id","fee_component_id");--> statement-breakpoint
CREATE INDEX "ix_payment_due_allocation_installment" ON "finance"."payment_due_allocation" USING btree ("workspace_id","installment_id","payment_revision_id");--> statement-breakpoint
CREATE INDEX "ix_payment_due_allocation_schedule" ON "finance"."payment_due_allocation" USING btree ("workspace_id","debt_id","schedule_version_id","installment_id");--> statement-breakpoint
CREATE INDEX "ix_payment_reclassification_component" ON "finance"."payment_reclassification" USING btree ("workspace_id","debt_id","source_component_id");--> statement-breakpoint
CREATE INDEX "ix_payment_reclassification_payment" ON "finance"."payment_reclassification" USING btree ("workspace_id","debt_id","payment_id");--> statement-breakpoint
CREATE INDEX "ix_schedule_allocation_map_source" ON "finance"."schedule_allocation_map" USING btree ("workspace_id","debt_id","payment_revision_id","source_allocation_id");--> statement-breakpoint
CREATE INDEX "ix_schedule_allocation_map_target" ON "finance"."schedule_allocation_map" USING btree ("workspace_id","debt_id","target_schedule_version_id","target_installment_id");--> statement-breakpoint
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
          'debt_payment',
          'payment_reclassification'
        )
      );