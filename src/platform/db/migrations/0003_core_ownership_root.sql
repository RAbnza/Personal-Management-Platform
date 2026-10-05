CREATE TABLE "core"."user_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	CONSTRAINT "user_profile_lifecycle_check" CHECK ("core"."user_profile"."lifecycle" IN ('active', 'deletion_pending', 'purging')),
	CONSTRAINT "user_profile_deletion_request_coherence_check" CHECK (
        (
          "core"."user_profile"."lifecycle" = 'active'
          AND "core"."user_profile"."deletion_requested_at" IS NULL
        )
        OR
        (
          "core"."user_profile"."lifecycle" IN ('deletion_pending', 'purging')
          AND "core"."user_profile"."deletion_requested_at" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "core"."workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text DEFAULT 'personal' NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"financial_revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "workspace_kind_check" CHECK ("core"."workspace"."kind" = 'personal'),
	CONSTRAINT "workspace_week_start_check" CHECK ("core"."workspace"."week_start" BETWEEN 0 AND 6),
	CONSTRAINT "workspace_state_check" CHECK (
        "core"."workspace"."state"
        IN ('active', 'deletion_pending', 'purging', 'restoring')
      ),
	CONSTRAINT "workspace_financial_revision_check" CHECK ("core"."workspace"."financial_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "core"."workspace_preference" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'en-PH' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"default_salary_account_id" uuid,
	"getting_started_dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_preference_theme_check" CHECK ("core"."workspace_preference"."theme" IN ('system', 'light', 'dark'))
);
--> statement-breakpoint
ALTER TABLE "core"."user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD CONSTRAINT "workspace_owner_user_id_user_profile_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."user_profile"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."workspace_preference" ADD CONSTRAINT "workspace_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_personal_owner_unique" ON "core"."workspace" USING btree ("owner_user_id") WHERE "core"."workspace"."kind" = 'personal';