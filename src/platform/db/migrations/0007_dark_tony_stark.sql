CREATE TABLE "audit"."private_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision_id" uuid,
	"activity_kind" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"summary_json" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_private_activity_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_private_activity_summary" CHECK (jsonb_typeof("audit"."private_activity"."summary_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "audit"."private_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_receipt_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer NOT NULL,
	"operation" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"effective_date" date,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_private_revision_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_private_revision_command_subject" UNIQUE("workspace_id","command_receipt_id","subject_kind","subject_id","subject_version","operation"),
	CONSTRAINT "ck_private_revision_subject_version" CHECK ("audit"."private_revision"."subject_version" > 0),
	CONSTRAINT "ck_private_revision_actor_kind" CHECK ("audit"."private_revision"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_private_revision_actor_user" CHECK (
        "audit"."private_revision"."actor_kind" <> 'user'
        OR "audit"."private_revision"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_private_revision_before_json" CHECK (
        "audit"."private_revision"."before_json" IS NULL
        OR jsonb_typeof("audit"."private_revision"."before_json") = 'object'
      ),
	CONSTRAINT "ck_private_revision_after_json" CHECK (
        "audit"."private_revision"."after_json" IS NULL
        OR jsonb_typeof("audit"."private_revision"."after_json") = 'object'
      ),
	CONSTRAINT "ck_private_revision_reason" CHECK (
        "audit"."private_revision"."reason" IS NULL
        OR char_length("audit"."private_revision"."reason") <= 20000
      )
);
--> statement-breakpoint
CREATE TABLE "core"."category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_category_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_category_kind" CHECK ("core"."category"."kind" IN ('income', 'expense')),
	CONSTRAINT "ck_category_name" CHECK (
        char_length("core"."category"."name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_category_version" CHECK ("core"."category"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."command_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_command_id" uuid NOT NULL,
	"command_type" text NOT NULL,
	"payload_hash" "bytea" NOT NULL,
	"hash_version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'claimed' NOT NULL,
	"result_json" jsonb,
	"completed_at" timestamp with time zone,
	"retain_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_command_receipt_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_command_receipt_client_command" UNIQUE("workspace_id","client_command_id"),
	CONSTRAINT "ck_command_receipt_hash_length" CHECK (octet_length("core"."command_receipt"."payload_hash") = 32),
	CONSTRAINT "ck_command_receipt_hash_version" CHECK ("core"."command_receipt"."hash_version" > 0),
	CONSTRAINT "ck_command_receipt_state" CHECK ("core"."command_receipt"."state" IN ('claimed', 'completed')),
	CONSTRAINT "ck_command_receipt_completion" CHECK (
        (
          "core"."command_receipt"."state" = 'claimed'
          AND "core"."command_receipt"."result_json" IS NULL
          AND "core"."command_receipt"."completed_at" IS NULL
        )
        OR
        (
          "core"."command_receipt"."state" = 'completed'
          AND "core"."command_receipt"."result_json" IS NOT NULL
          AND jsonb_typeof("core"."command_receipt"."result_json") = 'object'
          AND "core"."command_receipt"."completed_at" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "core"."tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_tag_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_tag_name" CHECK (
        char_length("core"."tag"."name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_tag_version" CHECK ("core"."tag"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance"."action_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"previous_revision_id" uuid,
	"command_receipt_id" uuid NOT NULL,
	"change_kind" text NOT NULL,
	"action_kind" text NOT NULL,
	"primary_effective_date" date NOT NULL,
	"currency" text NOT NULL,
	"reason" text,
	"state" text DEFAULT 'building' NOT NULL,
	"finalized_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_action_revision_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_action_revision_number" UNIQUE("workspace_id","action_id","revision_no"),
	CONSTRAINT "uq_action_revision_action_id" UNIQUE("workspace_id","action_id","id"),
	CONSTRAINT "uq_action_revision_scope_currency" UNIQUE("workspace_id","id","currency"),
	CONSTRAINT "uq_action_revision_command" UNIQUE("workspace_id","command_receipt_id"),
	CONSTRAINT "ck_action_revision_positive_revision" CHECK ("finance"."action_revision"."revision_no" > 0),
	CONSTRAINT "ck_action_revision_change_kind" CHECK (
        "finance"."action_revision"."change_kind"
        IN ('create', 'replace', 'void')
      ),
	CONSTRAINT "ck_action_revision_action_kind" CHECK (
        "finance"."action_revision"."action_kind"
        IN (
          'opening_cash',
          'income',
          'expense',
          'transfer',
          'standalone_fee'
        )
      ),
	CONSTRAINT "ck_action_revision_currency" CHECK ("finance"."action_revision"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_action_revision_state" CHECK ("finance"."action_revision"."state" IN ('building', 'posted')),
	CONSTRAINT "ck_action_revision_finalization" CHECK (
        (
          "finance"."action_revision"."state" = 'building'
          AND "finance"."action_revision"."finalized_at" IS NULL
        )
        OR
        (
          "finance"."action_revision"."state" = 'posted'
          AND "finance"."action_revision"."finalized_at" IS NOT NULL
        )
      ),
	CONSTRAINT "ck_action_revision_change_shape" CHECK (
        (
          "finance"."action_revision"."change_kind" = 'create'
          AND "finance"."action_revision"."revision_no" = 1
          AND "finance"."action_revision"."previous_revision_id" IS NULL
        )
        OR
        (
          "finance"."action_revision"."change_kind" IN ('replace', 'void')
          AND "finance"."action_revision"."revision_no" > 1
          AND "finance"."action_revision"."previous_revision_id" IS NOT NULL
          AND "finance"."action_revision"."reason" IS NOT NULL
          AND char_length(btrim("finance"."action_revision"."reason")) > 0
        )
      ),
	CONSTRAINT "ck_action_revision_actor_kind" CHECK ("finance"."action_revision"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_action_revision_actor_user" CHECK (
        "finance"."action_revision"."actor_kind" <> 'user'
        OR "finance"."action_revision"."recorded_by_user_id" IS NOT NULL
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."action_tag" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_action_tag" PRIMARY KEY("workspace_id","action_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "finance"."fee_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_date" date NOT NULL,
	"bearing_ledger_account_id" uuid NOT NULL,
	"expense_posting_id" uuid NOT NULL,
	"treatment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fee_component_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_fee_component_expense_posting" UNIQUE("workspace_id","expense_posting_id"),
	CONSTRAINT "ck_fee_component_label" CHECK (
        char_length("finance"."fee_component"."label") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_fee_component_amount" CHECK (
        "finance"."fee_component"."amount_minor" > 0
        AND "finance"."fee_component"."amount_minor" <= 100000000000
      ),
	CONSTRAINT "ck_fee_component_treatment" CHECK (
        "finance"."fee_component"."treatment"
        IN (
          'separate',
          'source_additional',
          'withheld',
          'capitalized'
        )
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."financial_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"institution_name" text,
	"currency" text NOT NULL,
	"opening_cutoff_date" date NOT NULL,
	"opening_action_id" uuid,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_financial_account_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_financial_account_ledger" UNIQUE("workspace_id","ledger_account_id"),
	CONSTRAINT "uq_financial_account_scope_currency" UNIQUE("workspace_id","id","currency"),
	CONSTRAINT "ck_financial_account_type" CHECK (
        "finance"."financial_account"."account_type"
        IN ('cash', 'e_wallet', 'checking', 'savings')
      ),
	CONSTRAINT "ck_financial_account_currency" CHECK ("finance"."financial_account"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_financial_account_name" CHECK (
        char_length("finance"."financial_account"."name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_financial_account_institution_name" CHECK (
        "finance"."financial_account"."institution_name" IS NULL
        OR char_length("finance"."financial_account"."institution_name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_financial_account_notes" CHECK (
        "finance"."financial_account"."notes" IS NULL
        OR char_length("finance"."financial_account"."notes") <= 20000
      ),
	CONSTRAINT "ck_financial_account_version" CHECK ("finance"."financial_account"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance"."financial_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"original_command_receipt_id" uuid NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_financial_action_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_financial_action_original_command" UNIQUE("workspace_id","original_command_receipt_id"),
	CONSTRAINT "ck_financial_action_description" CHECK (
        char_length("finance"."financial_action"."description") BETWEEN 1 AND 2000
      ),
	CONSTRAINT "ck_financial_action_notes" CHECK (
        "finance"."financial_action"."notes" IS NULL
        OR char_length("finance"."financial_action"."notes") <= 20000
      ),
	CONSTRAINT "ck_financial_action_actor_kind" CHECK ("finance"."financial_action"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_financial_action_actor_user" CHECK (
        "finance"."financial_action"."actor_kind" <> 'user'
        OR "finance"."financial_action"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_financial_action_version" CHECK ("finance"."financial_action"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance"."journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"sequence_no" smallint NOT NULL,
	"effective_date" date NOT NULL,
	"currency" text NOT NULL,
	"role" text NOT NULL,
	"reverses_journal_id" uuid,
	"state" text DEFAULT 'building' NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_journal_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_journal_revision_sequence" UNIQUE("workspace_id","action_revision_id","sequence_no"),
	CONSTRAINT "uq_journal_revision_id_currency" UNIQUE("workspace_id","action_revision_id","id","currency"),
	CONSTRAINT "ck_journal_sequence" CHECK ("finance"."journal"."sequence_no" > 0),
	CONSTRAINT "ck_journal_currency" CHECK ("finance"."journal"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_journal_role" CHECK ("finance"."journal"."role" IN ('economic', 'reversal')),
	CONSTRAINT "ck_journal_reversal_shape" CHECK (
        (
          "finance"."journal"."role" = 'economic'
          AND "finance"."journal"."reverses_journal_id" IS NULL
        )
        OR
        (
          "finance"."journal"."role" = 'reversal'
          AND "finance"."journal"."reverses_journal_id" IS NOT NULL
        )
      ),
	CONSTRAINT "ck_journal_state" CHECK ("finance"."journal"."state" IN ('building', 'posted')),
	CONSTRAINT "ck_journal_finalization" CHECK (
        (
          "finance"."journal"."state" = 'building'
          AND "finance"."journal"."finalized_at" IS NULL
        )
        OR
        (
          "finance"."journal"."state" = 'posted'
          AND "finance"."journal"."finalized_at" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."ledger_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_ledger_account_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_ledger_account_code" UNIQUE("workspace_id","code"),
	CONSTRAINT "uq_ledger_account_scope_currency" UNIQUE("workspace_id","id","currency"),
	CONSTRAINT "ck_ledger_account_kind" CHECK (
        "finance"."ledger_account"."kind"
        IN (
          'cash_asset',
          'expense',
          'income',
          'opening_equity',
          'adjustment_equity'
        )
      ),
	CONSTRAINT "ck_ledger_account_currency" CHECK ("finance"."ledger_account"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_ledger_account_name" CHECK (
        char_length("finance"."ledger_account"."name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_ledger_account_version" CHECK ("finance"."ledger_account"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance"."posting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"journal_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"line_no" smallint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"category_id" uuid,
	"expense_class" text DEFAULT 'none' NOT NULL,
	"income_class" text DEFAULT 'none' NOT NULL,
	"cash_flow_kind" text DEFAULT 'none' NOT NULL,
	"cash_flow_direction" text DEFAULT 'none' NOT NULL,
	"liability_component" text,
	"reverses_posting_id" uuid,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_posting_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_posting_journal_line" UNIQUE("workspace_id","journal_id","line_no"),
	CONSTRAINT "uq_posting_revision_id" UNIQUE("workspace_id","action_revision_id","id"),
	CONSTRAINT "ck_posting_line" CHECK ("finance"."posting"."line_no" > 0),
	CONSTRAINT "ck_posting_amount" CHECK (
        "finance"."posting"."amount_minor" <> 0
        AND "finance"."posting"."amount_minor"
          BETWEEN -100000000000 AND 100000000000
      ),
	CONSTRAINT "ck_posting_currency" CHECK ("finance"."posting"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ck_posting_expense_class" CHECK (
        "finance"."posting"."expense_class"
        IN (
          'none',
          'gross',
          'refund_offset',
          'rebate_offset',
          'waiver_offset'
        )
      ),
	CONSTRAINT "ck_posting_income_class" CHECK (
        "finance"."posting"."income_class"
        IN ('none', 'earned', 'gift', 'reward', 'other')
      ),
	CONSTRAINT "ck_posting_cash_flow_kind" CHECK (
        "finance"."posting"."cash_flow_kind"
        IN (
          'none',
          'income',
          'purchase',
          'transfer',
          'fee',
          'interest',
          'penalty',
          'borrowing',
          'debt_payment',
          'refund',
          'reward',
          'opening',
          'adjustment',
          'clearing'
        )
      ),
	CONSTRAINT "ck_posting_cash_flow_direction" CHECK (
        "finance"."posting"."cash_flow_direction"
        IN (
          'none',
          'in',
          'out',
          'internal',
          'baseline',
          'adjustment'
        )
      ),
	CONSTRAINT "ck_posting_liability_component" CHECK (
        "finance"."posting"."liability_component" IS NULL
        OR "finance"."posting"."liability_component"
          IN (
            'principal',
            'interest',
            'fee',
            'penalty',
            'unclassified'
          )
      ),
	CONSTRAINT "ck_posting_memo" CHECK (
        "finance"."posting"."memo" IS NULL
        OR char_length("finance"."posting"."memo") <= 20000
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."purchase_detail" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"funding_ledger_account_id" uuid NOT NULL,
	"purchase_minor" bigint NOT NULL,
	"merchant_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_purchase_detail" PRIMARY KEY("workspace_id","action_revision_id"),
	CONSTRAINT "ck_purchase_detail_amount" CHECK (
        "finance"."purchase_detail"."purchase_minor" > 0
        AND "finance"."purchase_detail"."purchase_minor" <= 100000000000
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."receipt_detail" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"receiving_account_id" uuid NOT NULL,
	"actual_received_minor" bigint NOT NULL,
	"sender_name" text,
	"source_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_receipt_detail" PRIMARY KEY("workspace_id","action_revision_id"),
	CONSTRAINT "ck_receipt_detail_amount" CHECK (
        "finance"."receipt_detail"."actual_received_minor" > 0
        AND "finance"."receipt_detail"."actual_received_minor" <= 100000000000
      )
);
--> statement-breakpoint
CREATE TABLE "finance"."transfer_detail" (
	"workspace_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_revision_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"source_principal_minor" bigint NOT NULL,
	"destination_principal_minor" bigint NOT NULL,
	"withheld_fee_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_transfer_detail" PRIMARY KEY("workspace_id","action_revision_id"),
	CONSTRAINT "ck_transfer_detail_distinct_accounts" CHECK ("finance"."transfer_detail"."source_account_id" <> "finance"."transfer_detail"."destination_account_id"),
	CONSTRAINT "ck_transfer_detail_source_amount" CHECK (
        "finance"."transfer_detail"."source_principal_minor" > 0
        AND "finance"."transfer_detail"."source_principal_minor" <= 100000000000
      ),
	CONSTRAINT "ck_transfer_detail_destination_amount" CHECK (
        "finance"."transfer_detail"."destination_principal_minor" > 0
        AND "finance"."transfer_detail"."destination_principal_minor" <= 100000000000
      ),
	CONSTRAINT "ck_transfer_detail_fee_amount" CHECK (
        "finance"."transfer_detail"."withheld_fee_minor" >= 0
        AND "finance"."transfer_detail"."withheld_fee_minor" <= 100000000000
      ),
	CONSTRAINT "ck_transfer_detail_principal" CHECK (
        "finance"."transfer_detail"."source_principal_minor"
          = "finance"."transfer_detail"."destination_principal_minor"
            + "finance"."transfer_detail"."withheld_fee_minor"
      )
);
--> statement-breakpoint
ALTER TABLE "audit"."private_activity" ADD CONSTRAINT "private_activity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit"."private_activity" ADD CONSTRAINT "fk_private_activity_revision" FOREIGN KEY ("workspace_id","revision_id") REFERENCES "audit"."private_revision"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit"."private_revision" ADD CONSTRAINT "private_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit"."private_revision" ADD CONSTRAINT "private_revision_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "audit"."private_revision" ADD CONSTRAINT "fk_private_revision_command" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."category" ADD CONSTRAINT "category_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."command_receipt" ADD CONSTRAINT "command_receipt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."tag" ADD CONSTRAINT "tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "action_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "action_revision_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "fk_action_revision_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "fk_action_revision_command" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_revision" ADD CONSTRAINT "fk_action_revision_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_tag" ADD CONSTRAINT "action_tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_tag" ADD CONSTRAINT "fk_action_tag_action" FOREIGN KEY ("workspace_id","action_id") REFERENCES "finance"."financial_action"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."action_tag" ADD CONSTRAINT "fk_action_tag_tag" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "core"."tag"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."fee_component" ADD CONSTRAINT "fee_component_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."fee_component" ADD CONSTRAINT "fk_fee_component_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."fee_component" ADD CONSTRAINT "fk_fee_component_bearing_ledger" FOREIGN KEY ("workspace_id","bearing_ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."fee_component" ADD CONSTRAINT "fk_fee_component_expense_posting" FOREIGN KEY ("workspace_id","action_revision_id","expense_posting_id") REFERENCES "finance"."posting"("workspace_id","action_revision_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_account" ADD CONSTRAINT "financial_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_account" ADD CONSTRAINT "fk_financial_account_ledger" FOREIGN KEY ("workspace_id","ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_account" ADD CONSTRAINT "fk_financial_account_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_action" ADD CONSTRAINT "financial_action_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_action" ADD CONSTRAINT "financial_action_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."financial_action" ADD CONSTRAINT "fk_financial_action_original_command" FOREIGN KEY ("workspace_id","original_command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."journal" ADD CONSTRAINT "journal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."journal" ADD CONSTRAINT "fk_journal_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."journal" ADD CONSTRAINT "fk_journal_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."ledger_account" ADD CONSTRAINT "ledger_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."ledger_account" ADD CONSTRAINT "fk_ledger_account_workspace_currency" FOREIGN KEY ("workspace_id","currency") REFERENCES "core"."workspace"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."posting" ADD CONSTRAINT "posting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."posting" ADD CONSTRAINT "fk_posting_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."posting" ADD CONSTRAINT "fk_posting_journal" FOREIGN KEY ("workspace_id","action_revision_id","journal_id","currency") REFERENCES "finance"."journal"("workspace_id","action_revision_id","id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."posting" ADD CONSTRAINT "fk_posting_ledger_account" FOREIGN KEY ("workspace_id","ledger_account_id","currency") REFERENCES "finance"."ledger_account"("workspace_id","id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."posting" ADD CONSTRAINT "fk_posting_category" FOREIGN KEY ("workspace_id","category_id") REFERENCES "core"."category"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."purchase_detail" ADD CONSTRAINT "purchase_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."purchase_detail" ADD CONSTRAINT "fk_purchase_detail_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."purchase_detail" ADD CONSTRAINT "fk_purchase_detail_funding_ledger" FOREIGN KEY ("workspace_id","funding_ledger_account_id") REFERENCES "finance"."ledger_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."receipt_detail" ADD CONSTRAINT "receipt_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."receipt_detail" ADD CONSTRAINT "fk_receipt_detail_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."receipt_detail" ADD CONSTRAINT "fk_receipt_detail_account" FOREIGN KEY ("workspace_id","receiving_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."transfer_detail" ADD CONSTRAINT "transfer_detail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."transfer_detail" ADD CONSTRAINT "fk_transfer_detail_action_revision" FOREIGN KEY ("workspace_id","action_id","action_revision_id") REFERENCES "finance"."action_revision"("workspace_id","action_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."transfer_detail" ADD CONSTRAINT "fk_transfer_detail_source_account" FOREIGN KEY ("workspace_id","source_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "finance"."transfer_detail" ADD CONSTRAINT "fk_transfer_detail_destination_account" FOREIGN KEY ("workspace_id","destination_account_id") REFERENCES "finance"."financial_account"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_private_activity_revision_kind" ON "audit"."private_activity" USING btree ("workspace_id","revision_id","activity_kind") WHERE "audit"."private_activity"."revision_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_private_activity_occurred" ON "audit"."private_activity" USING btree ("workspace_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_private_revision_subject" ON "audit"."private_revision" USING btree ("workspace_id","subject_kind","subject_id","subject_version");--> statement-breakpoint
CREATE INDEX "ix_private_revision_created" ON "audit"."private_revision" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_category_seed_code" ON "core"."category" USING btree ("workspace_id","kind","code") WHERE "core"."category"."code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_category_active_name" ON "core"."category" USING btree ("workspace_id","kind",lower("name")) WHERE "core"."category"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_command_receipt_expiry" ON "core"."command_receipt" USING btree ("workspace_id","retain_until") WHERE "core"."command_receipt"."retain_until" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tag_active_name" ON "core"."tag" USING btree ("workspace_id",lower("name")) WHERE "core"."tag"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_action_revision_effective_date" ON "finance"."action_revision" USING btree ("workspace_id","primary_effective_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_action_tag_tag" ON "finance"."action_tag" USING btree ("workspace_id","tag_id","action_id");--> statement-breakpoint
CREATE INDEX "ix_fee_component_revision_bearer" ON "finance"."fee_component" USING btree ("workspace_id","action_revision_id","bearing_ledger_account_id");--> statement-breakpoint
CREATE INDEX "ix_financial_account_active_name" ON "finance"."financial_account" USING btree ("workspace_id","archived_at","name","id");--> statement-breakpoint
CREATE INDEX "ix_financial_action_created" ON "finance"."financial_action" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_journal_reversal" ON "finance"."journal" USING btree ("workspace_id","reverses_journal_id") WHERE "finance"."journal"."reverses_journal_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_journal_effective_date" ON "finance"."journal" USING btree ("workspace_id","effective_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_ledger_account_kind" ON "finance"."ledger_account" USING btree ("workspace_id","kind","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_posting_reversal" ON "finance"."posting" USING btree ("workspace_id","reverses_posting_id") WHERE "finance"."posting"."reverses_posting_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_posting_ledger" ON "finance"."posting" USING btree ("workspace_id","ledger_account_id","journal_id","id");--> statement-breakpoint
CREATE INDEX "ix_posting_category" ON "finance"."posting" USING btree ("workspace_id","category_id","journal_id") WHERE "finance"."posting"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_purchase_detail_funding_ledger" ON "finance"."purchase_detail" USING btree ("workspace_id","funding_ledger_account_id");--> statement-breakpoint
CREATE INDEX "ix_receipt_detail_account" ON "finance"."receipt_detail" USING btree ("workspace_id","receiving_account_id");--> statement-breakpoint
CREATE INDEX "ix_transfer_detail_source" ON "finance"."transfer_detail" USING btree ("workspace_id","source_account_id");--> statement-breakpoint
CREATE INDEX "ix_transfer_detail_destination" ON "finance"."transfer_detail" USING btree ("workspace_id","destination_account_id");