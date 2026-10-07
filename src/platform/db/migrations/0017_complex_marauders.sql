CREATE TABLE "finance"."debt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lender_name" text NOT NULL,
	"product_name" text,
	"debt_type" text NOT NULL,
	"currency" text NOT NULL,
	"liability_ledger_account_id" uuid NOT NULL,
	"clearing_ledger_account_id" uuid,
	"original_principal_minor" bigint,
	"start_date" date NOT NULL,
	"opening_cutoff_date" date,
	"breakdown_status" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"current_schedule_version_id" uuid,
	"notes" text,
	"closed_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_debt_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_scope_currency" UNIQUE("workspace_id","id","currency"),
	CONSTRAINT "uq_debt_liability_ledger" UNIQUE("workspace_id","liability_ledger_account_id"),
	CONSTRAINT "uq_debt_clearing_ledger" UNIQUE("workspace_id","clearing_ledger_account_id"),
	CONSTRAINT "ck_debt_name" CHECK (
        char_length("finance"."debt"."name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_debt_lender_name" CHECK (
        char_length("finance"."debt"."lender_name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_debt_product_name" CHECK (
        "finance"."debt"."product_name" IS NULL
        OR char_length("finance"."debt"."product_name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_debt_type" CHECK (
        "finance"."debt"."debt_type"
        IN (
          'personal_loan',
          'installment_loan',
          'financed_purchase',
          'flexible_manual'
        )
      ),
	CONSTRAINT "ck_debt_currency" CHECK ("finance"."debt"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_debt_original_principal" CHECK (
        "finance"."debt"."original_principal_minor" IS NULL
        OR (
          "finance"."debt"."original_principal_minor" > 0
          AND "finance"."debt"."original_principal_minor" <= 100000000000
        )
      ),
	CONSTRAINT "ck_debt_breakdown_status" CHECK (
        "finance"."debt"."breakdown_status"
        IN (
          'known',
          'partial',
          'unknown'
        )
      ),
	CONSTRAINT "ck_debt_lifecycle" CHECK (
        "finance"."debt"."lifecycle"
        IN (
          'active',
          'settled',
          'settled_early',
          'cancelled'
        )
      ),
	CONSTRAINT "ck_debt_closed_shape" CHECK (
        (
          "finance"."debt"."lifecycle" = 'active'
          AND "finance"."debt"."closed_at" IS NULL
        )
        OR
        (
          "finance"."debt"."lifecycle" <> 'active'
          AND "finance"."debt"."closed_at" IS NOT NULL
        )
      ),
	CONSTRAINT "ck_debt_notes" CHECK (
        "finance"."debt"."notes" IS NULL
        OR char_length("finance"."debt"."notes") <= 20000
      ),
	CONSTRAINT "ck_debt_actor_kind" CHECK (
        "finance"."debt"."actor_kind"
        IN ('user', 'system', 'import')
      ),
	CONSTRAINT "ck_debt_actor_user" CHECK (
        "finance"."debt"."actor_kind" <> 'user'
        OR "finance"."debt"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_debt_version" CHECK ("finance"."debt"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance"."debt_action_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_action_link_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_action_link_revision_debt_purpose" UNIQUE("workspace_id","action_revision_id","debt_id","purpose"),
	CONSTRAINT "ck_debt_action_link_purpose" CHECK (
        "finance"."debt_action_link"."purpose"
        IN (
          'opening',
          'borrowing',
          'purchase',
          'charge',
          'payment',
          'settlement',
          'waiver',
          'reclassification'
        )
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."debt_obligation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"external_label" text,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_obligation_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_obligation_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "ck_debt_obligation_external_label" CHECK (
        "finance"."debt_obligation"."external_label" IS NULL
        OR char_length("finance"."debt_obligation"."external_label") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_debt_obligation_actor_kind" CHECK (
        "finance"."debt_obligation"."actor_kind"
        IN ('user', 'system', 'import')
      ),
	CONSTRAINT "ck_debt_obligation_actor_user" CHECK (
        "finance"."debt_obligation"."actor_kind" <> 'user'
        OR "finance"."debt_obligation"."recorded_by_user_id" IS NOT NULL
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."debt_schedule_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"previous_version_id" uuid,
	"effective_date" date NOT NULL,
	"revision_kind" text NOT NULL,
	"reason" text NOT NULL,
	"frequency" text NOT NULL,
	"state" text DEFAULT 'building' NOT NULL,
	"finalized_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_debt_schedule_version_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_debt_schedule_version_number" UNIQUE("workspace_id","debt_id","version_no"),
	CONSTRAINT "uq_debt_schedule_version_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "ck_debt_schedule_version_number" CHECK ("finance"."debt_schedule_version"."version_no" > 0),
	CONSTRAINT "ck_debt_schedule_version_revision_kind" CHECK (
        "finance"."debt_schedule_version"."revision_kind"
        IN (
          'initial',
          'date_correction',
          'renegotiation',
          'allocation_correction',
          'settlement'
        )
      ),
	CONSTRAINT "ck_debt_schedule_version_reason" CHECK (
        char_length(btrim("finance"."debt_schedule_version"."reason")) BETWEEN 1 AND 2000
      ),
	CONSTRAINT "ck_debt_schedule_version_frequency" CHECK (
        "finance"."debt_schedule_version"."frequency"
        IN (
          'manual',
          'weekly',
          'monthly',
          'other'
        )
      ),
	CONSTRAINT "ck_debt_schedule_version_state" CHECK (
        "finance"."debt_schedule_version"."state"
        IN ('building', 'finalized')
      ),
	CONSTRAINT "ck_debt_schedule_version_finalization" CHECK (
        (
          "finance"."debt_schedule_version"."state" = 'building'
          AND "finance"."debt_schedule_version"."finalized_at" IS NULL
        )
        OR
        (
          "finance"."debt_schedule_version"."state" = 'finalized'
          AND "finance"."debt_schedule_version"."finalized_at" IS NOT NULL
        )
      ),
	CONSTRAINT "ck_debt_schedule_version_actor_kind" CHECK (
        "finance"."debt_schedule_version"."actor_kind"
        IN ('user', 'system', 'import')
      ),
	CONSTRAINT "ck_debt_schedule_version_actor_user" CHECK (
        "finance"."debt_schedule_version"."actor_kind" <> 'user'
        OR "finance"."debt_schedule_version"."recorded_by_user_id" IS NOT NULL
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."scheduled_installment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"schedule_version_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"due_date" date NOT NULL,
	"contractual_minor" bigint NOT NULL,
	"known_principal_minor" bigint,
	"known_interest_minor" bigint,
	"known_fee_minor" bigint,
	"breakdown_complete" boolean DEFAULT false NOT NULL,
	"opening_satisfied_minor" bigint DEFAULT 0 NOT NULL,
	"disposition" text DEFAULT 'scheduled' NOT NULL,
	"cancellation_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scheduled_installment_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_scheduled_installment_schedule_obligation" UNIQUE("workspace_id","schedule_version_id","obligation_id"),
	CONSTRAINT "uq_scheduled_installment_schedule_sequence" UNIQUE("workspace_id","schedule_version_id","sequence_no"),
	CONSTRAINT "uq_scheduled_installment_debt_id" UNIQUE("workspace_id","debt_id","id"),
	CONSTRAINT "uq_scheduled_installment_debt_schedule_id" UNIQUE("workspace_id","debt_id","schedule_version_id","id"),
	CONSTRAINT "ck_scheduled_installment_sequence" CHECK ("finance"."scheduled_installment"."sequence_no" > 0),
	CONSTRAINT "ck_scheduled_installment_contractual" CHECK (
        "finance"."scheduled_installment"."contractual_minor" > 0
        AND "finance"."scheduled_installment"."contractual_minor" <= 100000000000
      ),
	CONSTRAINT "ck_scheduled_installment_known_principal" CHECK (
        "finance"."scheduled_installment"."known_principal_minor" IS NULL
        OR (
          "finance"."scheduled_installment"."known_principal_minor" >= 0
          AND "finance"."scheduled_installment"."known_principal_minor" <= 100000000000
        )
      ),
	CONSTRAINT "ck_scheduled_installment_known_interest" CHECK (
        "finance"."scheduled_installment"."known_interest_minor" IS NULL
        OR (
          "finance"."scheduled_installment"."known_interest_minor" >= 0
          AND "finance"."scheduled_installment"."known_interest_minor" <= 100000000000
        )
      ),
	CONSTRAINT "ck_scheduled_installment_known_fee" CHECK (
        "finance"."scheduled_installment"."known_fee_minor" IS NULL
        OR (
          "finance"."scheduled_installment"."known_fee_minor" >= 0
          AND "finance"."scheduled_installment"."known_fee_minor" <= 100000000000
        )
      ),
	CONSTRAINT "ck_scheduled_installment_known_total" CHECK (
        COALESCE("finance"."scheduled_installment"."known_principal_minor", 0)
          + COALESCE("finance"."scheduled_installment"."known_interest_minor", 0)
          + COALESCE("finance"."scheduled_installment"."known_fee_minor", 0)
        <= "finance"."scheduled_installment"."contractual_minor"
      ),
	CONSTRAINT "ck_scheduled_installment_breakdown" CHECK (
        (
          "finance"."scheduled_installment"."breakdown_complete" = false
          AND (
            COALESCE("finance"."scheduled_installment"."known_principal_minor", 0)
              + COALESCE("finance"."scheduled_installment"."known_interest_minor", 0)
              + COALESCE("finance"."scheduled_installment"."known_fee_minor", 0)
            <= "finance"."scheduled_installment"."contractual_minor"
          )
        )
        OR
        (
          "finance"."scheduled_installment"."breakdown_complete" = true
          AND "finance"."scheduled_installment"."known_principal_minor" IS NOT NULL
          AND "finance"."scheduled_installment"."known_interest_minor" IS NOT NULL
          AND "finance"."scheduled_installment"."known_fee_minor" IS NOT NULL
          AND "finance"."scheduled_installment"."known_principal_minor"
            + "finance"."scheduled_installment"."known_interest_minor"
            + "finance"."scheduled_installment"."known_fee_minor"
            = "finance"."scheduled_installment"."contractual_minor"
        )
      ),
	CONSTRAINT "ck_scheduled_installment_opening_satisfied" CHECK (
        "finance"."scheduled_installment"."opening_satisfied_minor" >= 0
        AND "finance"."scheduled_installment"."opening_satisfied_minor" <= "finance"."scheduled_installment"."contractual_minor"
      ),
	CONSTRAINT "ck_scheduled_installment_disposition" CHECK (
        "finance"."scheduled_installment"."disposition"
        IN ('scheduled', 'cancelled')
      ),
	CONSTRAINT "ck_scheduled_installment_cancellation_shape" CHECK (
        (
          "finance"."scheduled_installment"."disposition" = 'scheduled'
          AND "finance"."scheduled_installment"."cancellation_reason" IS NULL
        )
        OR
        (
          "finance"."scheduled_installment"."disposition" = 'cancelled'
          AND "finance"."scheduled_installment"."cancellation_reason" IS NOT NULL
          AND char_length(btrim("finance"."scheduled_installment"."cancellation_reason")) > 0
        )
      ),
	CONSTRAINT "ck_scheduled_installment_notes" CHECK (
        "finance"."scheduled_installment"."notes" IS NULL
        OR char_length("finance"."scheduled_installment"."notes") <= 20000
      )
);
--> statement-breakpoint
ALTER TABLE "finance"."action_revision" DROP CONSTRAINT "ck_action_revision_action_kind";--> statement-breakpoint
ALTER TABLE "finance"."ledger_account" DROP CONSTRAINT "ck_ledger_account_kind";--> statement-breakpoint
ALTER TABLE "finance"."debt" ADD CONSTRAINT "debt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt" ADD CONSTRAINT "debt_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt" ADD CONSTRAINT "fk_debt_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt" ADD CONSTRAINT "fk_debt_liability_ledger" FOREIGN KEY ("workspace_id","liability_ledger_account_id","currency") REFERENCES "finance"."ledger_account"("workspace_id","id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt" ADD CONSTRAINT "fk_debt_clearing_ledger" FOREIGN KEY ("workspace_id","clearing_ledger_account_id","currency") REFERENCES "finance"."ledger_account"("workspace_id","id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_action_link" ADD CONSTRAINT "debt_action_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_action_link" ADD CONSTRAINT "fk_debt_action_link_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_action_link" ADD CONSTRAINT "fk_debt_action_link_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_obligation" ADD CONSTRAINT "debt_obligation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_obligation" ADD CONSTRAINT "debt_obligation_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_obligation" ADD CONSTRAINT "fk_debt_obligation_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_schedule_version" ADD CONSTRAINT "debt_schedule_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_schedule_version" ADD CONSTRAINT "debt_schedule_version_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."debt_schedule_version" ADD CONSTRAINT "fk_debt_schedule_version_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."scheduled_installment" ADD CONSTRAINT "scheduled_installment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."scheduled_installment" ADD CONSTRAINT "fk_scheduled_installment_debt" FOREIGN KEY ("workspace_id","debt_id") REFERENCES "finance"."debt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."scheduled_installment" ADD CONSTRAINT "fk_scheduled_installment_schedule" FOREIGN KEY ("workspace_id","debt_id","schedule_version_id") REFERENCES "finance"."debt_schedule_version"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."scheduled_installment" ADD CONSTRAINT "fk_scheduled_installment_obligation" FOREIGN KEY ("workspace_id","debt_id","obligation_id") REFERENCES "finance"."debt_obligation"("workspace_id","debt_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_debt_lifecycle" ON "finance"."debt" USING btree ("workspace_id","lifecycle","id");--> statement-breakpoint
CREATE INDEX "ix_debt_action_link_debt_revision" ON "finance"."debt_action_link" USING btree ("workspace_id","debt_id","action_revision_id");--> statement-breakpoint
CREATE INDEX "ix_debt_schedule_version_debt" ON "finance"."debt_schedule_version" USING btree ("workspace_id","debt_id","version_no");--> statement-breakpoint
CREATE INDEX "ix_scheduled_installment_due" ON "finance"."scheduled_installment" USING btree ("workspace_id","due_date","id");--> statement-breakpoint
CREATE INDEX "ix_scheduled_installment_schedule" ON "finance"."scheduled_installment" USING btree ("workspace_id","schedule_version_id","id");--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "ck_action_revision_action_kind" CHECK (
        "finance"."action_revision"."action_kind"
        IN (
          'opening_cash',
          'income',
          'expense',
          'transfer',
          'standalone_fee',
          'opening_debt'
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
          'payment_clearing_asset'
        )
      );