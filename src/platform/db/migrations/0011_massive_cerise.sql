CREATE TABLE "career"."application_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"title" text NOT NULL,
	"temporal_kind" text NOT NULL,
	"event_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timezone" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location" text,
	"meeting_url" text,
	"preparation_notes" text,
	"outcome_notes" text,
	"completed_at" timestamp with time zone,
	"notification_generation" integer DEFAULT 1 NOT NULL,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_application_event_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_application_event_app_id" UNIQUE("workspace_id","application_id","id"),
	CONSTRAINT "ck_application_event_kind" CHECK (
        "career"."application_event"."event_kind"
        IN (
          'interview',
          'assessment',
          'follow_up',
          'submission',
          'response',
          'offer',
          'no_response',
          'note'
        )
      ),
	CONSTRAINT "ck_application_event_title" CHECK (
        char_length("career"."application_event"."title") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_application_event_temporal_kind" CHECK ("career"."application_event"."temporal_kind" IN ('date', 'timed')),
	CONSTRAINT "ck_application_event_temporal_shape" CHECK (
        (
          "career"."application_event"."temporal_kind" = 'date'
          AND "career"."application_event"."event_date" IS NOT NULL
          AND "career"."application_event"."starts_at" IS NULL
          AND "career"."application_event"."ends_at" IS NULL
          AND "career"."application_event"."timezone" IS NULL
        )
        OR
        (
          "career"."application_event"."temporal_kind" = 'timed'
          AND "career"."application_event"."event_date" IS NULL
          AND "career"."application_event"."starts_at" IS NOT NULL
          AND "career"."application_event"."timezone" IS NOT NULL
          AND (
            "career"."application_event"."ends_at" IS NULL
            OR "career"."application_event"."ends_at" > "career"."application_event"."starts_at"
          )
        )
      ),
	CONSTRAINT "ck_application_event_status" CHECK (
        "career"."application_event"."status"
        IN ('scheduled', 'completed', 'cancelled')
      ),
	CONSTRAINT "ck_application_event_completion" CHECK (
        (
          "career"."application_event"."status" = 'completed'
          AND "career"."application_event"."completed_at" IS NOT NULL
        )
        OR
        (
          "career"."application_event"."status" <> 'completed'
          AND "career"."application_event"."completed_at" IS NULL
        )
      ),
	CONSTRAINT "ck_application_event_timezone" CHECK (
        "career"."application_event"."timezone" IS NULL
        OR char_length("career"."application_event"."timezone") BETWEEN 1 AND 100
      ),
	CONSTRAINT "ck_application_event_meeting_url" CHECK (
        "career"."application_event"."meeting_url" IS NULL
        OR char_length("career"."application_event"."meeting_url") <= 2048
      ),
	CONSTRAINT "ck_application_event_preparation_notes" CHECK (
        "career"."application_event"."preparation_notes" IS NULL
        OR char_length("career"."application_event"."preparation_notes") <= 20000
      ),
	CONSTRAINT "ck_application_event_outcome_notes" CHECK (
        "career"."application_event"."outcome_notes" IS NULL
        OR char_length("career"."application_event"."outcome_notes") <= 20000
      ),
	CONSTRAINT "ck_application_event_notification_generation" CHECK ("career"."application_event"."notification_generation" > 0),
	CONSTRAINT "ck_application_event_actor_kind" CHECK ("career"."application_event"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_application_event_actor_user" CHECK (
        "career"."application_event"."actor_kind" <> 'user'
        OR "career"."application_event"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_application_event_version" CHECK ("career"."application_event"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "career"."application_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"stage" text NOT NULL,
	"outcome" text,
	"effective_date" date NOT NULL,
	"effective_order" integer DEFAULT 0 NOT NULL,
	"supersedes_history_id" uuid,
	"reason" text,
	"command_receipt_id" uuid NOT NULL,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_application_history_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_application_history_sequence" UNIQUE("workspace_id","application_id","sequence_no"),
	CONSTRAINT "uq_application_history_app_id" UNIQUE("workspace_id","application_id","id"),
	CONSTRAINT "ck_application_history_sequence" CHECK ("career"."application_stage_history"."sequence_no" > 0),
	CONSTRAINT "ck_application_history_effective_order" CHECK ("career"."application_stage_history"."effective_order" >= 0),
	CONSTRAINT "ck_application_history_stage" CHECK (
        "career"."application_stage_history"."stage"
        IN (
          'saved',
          'applied',
          'screening',
          'interview',
          'technical_assessment',
          'final_interview',
          'offer',
          'accepted'
        )
      ),
	CONSTRAINT "ck_application_history_outcome" CHECK (
        "career"."application_stage_history"."outcome" IS NULL
        OR "career"."application_stage_history"."outcome"
          IN (
            'accepted',
            'rejected',
            'withdrawn',
            'offer_declined',
            'offer_expired',
            'employer_cancelled'
          )
      ),
	CONSTRAINT "ck_application_history_accepted" CHECK (
        (
          "career"."application_stage_history"."stage" = 'accepted'
          AND "career"."application_stage_history"."outcome" = 'accepted'
        )
        OR
        (
          "career"."application_stage_history"."stage" <> 'accepted'
          AND "career"."application_stage_history"."outcome" IS DISTINCT FROM 'accepted'
        )
      ),
	CONSTRAINT "ck_application_history_reason" CHECK (
        "career"."application_stage_history"."reason" IS NULL
        OR char_length("career"."application_stage_history"."reason") <= 2000
      ),
	CONSTRAINT "ck_application_history_actor_kind" CHECK ("career"."application_stage_history"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_application_history_actor_user" CHECK (
        "career"."application_stage_history"."actor_kind" <> 'user'
        OR "career"."application_stage_history"."recorded_by_user_id" IS NOT NULL
      )
);
--> statement-breakpoint
CREATE TABLE "career"."application_tag" (
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_application_tag" PRIMARY KEY("workspace_id","application_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "career"."job_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"role_title" text NOT NULL,
	"posting_url" text,
	"source_name" text,
	"role_description_snapshot" text,
	"location" text,
	"work_arrangement" text,
	"salary_min_minor" bigint,
	"salary_max_minor" bigint,
	"salary_currency" text,
	"salary_period" text,
	"technology_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"resume_version_id" uuid,
	"applied_date" date,
	"current_stage" text DEFAULT 'saved' NOT NULL,
	"current_outcome" text,
	"current_history_id" uuid NOT NULL,
	"next_action_event_id" uuid,
	"notes" text,
	"archived_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_job_application_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_job_application_company_name" CHECK (
        char_length("career"."job_application"."company_name") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_job_application_role_title" CHECK (
        char_length("career"."job_application"."role_title") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_job_application_posting_url" CHECK (
        "career"."job_application"."posting_url" IS NULL
        OR char_length("career"."job_application"."posting_url") <= 2048
      ),
	CONSTRAINT "ck_job_application_role_snapshot" CHECK (
        "career"."job_application"."role_description_snapshot" IS NULL
        OR char_length("career"."job_application"."role_description_snapshot") <= 20000
      ),
	CONSTRAINT "ck_job_application_work_arrangement" CHECK (
        "career"."job_application"."work_arrangement" IS NULL
        OR "career"."job_application"."work_arrangement"
          IN ('onsite', 'hybrid', 'remote', 'unspecified')
      ),
	CONSTRAINT "ck_job_application_salary_values" CHECK (
        (
          "career"."job_application"."salary_min_minor" IS NULL
          OR "career"."job_application"."salary_min_minor" >= 0
        )
        AND
        (
          "career"."job_application"."salary_max_minor" IS NULL
          OR "career"."job_application"."salary_max_minor" >= 0
        )
        AND
        (
          "career"."job_application"."salary_min_minor" IS NULL
          OR "career"."job_application"."salary_max_minor" IS NULL
          OR "career"."job_application"."salary_min_minor" <= "career"."job_application"."salary_max_minor"
        )
      ),
	CONSTRAINT "ck_job_application_salary_metadata" CHECK (
        (
          "career"."job_application"."salary_min_minor" IS NULL
          AND "career"."job_application"."salary_max_minor" IS NULL
        )
        OR
        (
          "career"."job_application"."salary_currency" IS NOT NULL
          AND "career"."job_application"."salary_period" IS NOT NULL
        )
      ),
	CONSTRAINT "ck_job_application_salary_currency" CHECK (
        "career"."job_application"."salary_currency" IS NULL
        OR "career"."job_application"."salary_currency" ~ '^[A-Z]{3}$'
      ),
	CONSTRAINT "ck_job_application_salary_period" CHECK (
        "career"."job_application"."salary_period" IS NULL
        OR "career"."job_application"."salary_period"
          IN ('hour', 'month', 'year')
      ),
	CONSTRAINT "ck_job_application_stage" CHECK (
        "career"."job_application"."current_stage"
        IN (
          'saved',
          'applied',
          'screening',
          'interview',
          'technical_assessment',
          'final_interview',
          'offer',
          'accepted'
        )
      ),
	CONSTRAINT "ck_job_application_outcome" CHECK (
        "career"."job_application"."current_outcome" IS NULL
        OR "career"."job_application"."current_outcome"
          IN (
            'accepted',
            'rejected',
            'withdrawn',
            'offer_declined',
            'offer_expired',
            'employer_cancelled'
          )
      ),
	CONSTRAINT "ck_job_application_accepted_coherence" CHECK (
        (
          "career"."job_application"."current_stage" = 'accepted'
          AND "career"."job_application"."current_outcome" = 'accepted'
        )
        OR
        (
          "career"."job_application"."current_stage" <> 'accepted'
          AND "career"."job_application"."current_outcome" IS DISTINCT FROM 'accepted'
        )
      ),
	CONSTRAINT "ck_job_application_notes" CHECK (
        "career"."job_application"."notes" IS NULL
        OR char_length("career"."job_application"."notes") <= 20000
      ),
	CONSTRAINT "ck_job_application_actor_kind" CHECK ("career"."job_application"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_job_application_actor_user" CHECK (
        "career"."job_application"."actor_kind" <> 'user'
        OR "career"."job_application"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_job_application_version" CHECK ("career"."job_application"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "career"."resume_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"label" text NOT NULL,
	"reference_url" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_resume_version_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "uq_resume_version_label" UNIQUE("workspace_id","label"),
	CONSTRAINT "ck_resume_version_label" CHECK (
        char_length("career"."resume_version"."label") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_resume_version_reference_url" CHECK (
        "career"."resume_version"."reference_url" IS NULL
        OR char_length("career"."resume_version"."reference_url") <= 2048
      ),
	CONSTRAINT "ck_resume_version_notes" CHECK (
        "career"."resume_version"."notes" IS NULL
        OR char_length("career"."resume_version"."notes") <= 20000
      ),
	CONSTRAINT "ck_resume_version_actor_kind" CHECK ("career"."resume_version"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_resume_version_actor_user" CHECK (
        "career"."resume_version"."actor_kind" <> 'user'
        OR "career"."resume_version"."recorded_by_user_id" IS NOT NULL
      )
);
--> statement-breakpoint
CREATE TABLE "core"."module_preference" (
	"workspace_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"agenda_visible" boolean DEFAULT true NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pk_module_preference" PRIMARY KEY("workspace_id","module_key"),
	CONSTRAINT "ck_module_preference_version" CHECK ("core"."module_preference"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."onboarding_step" (
	"workspace_id" uuid NOT NULL,
	"guide_version" integer NOT NULL,
	"step_key" text NOT NULL,
	"state" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_onboarding_step" PRIMARY KEY("workspace_id","guide_version","step_key"),
	CONSTRAINT "ck_onboarding_step_guide_version" CHECK ("core"."onboarding_step"."guide_version" > 0),
	CONSTRAINT "ck_onboarding_step_state" CHECK ("core"."onboarding_step"."state" IN ('pending', 'completed', 'skipped')),
	CONSTRAINT "ck_onboarding_step_completion" CHECK (
        (
          "core"."onboarding_step"."state" = 'completed'
          AND "core"."onboarding_step"."completed_at" IS NOT NULL
        )
        OR
        (
          "core"."onboarding_step"."state" <> 'completed'
          AND "core"."onboarding_step"."completed_at" IS NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "time"."personal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"temporal_kind" text NOT NULL,
	"event_date" date,
	"end_date_exclusive" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timezone" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"description" text,
	"location" text,
	"reference_url" text,
	"completed_at" timestamp with time zone,
	"notification_generation" integer DEFAULT 1 NOT NULL,
	"recorded_by_user_id" uuid,
	"actor_kind" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "uq_personal_event_scope_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "ck_personal_event_title" CHECK (
        char_length("time"."personal_event"."title") BETWEEN 1 AND 200
      ),
	CONSTRAINT "ck_personal_event_temporal_kind" CHECK ("time"."personal_event"."temporal_kind" IN ('date', 'timed')),
	CONSTRAINT "ck_personal_event_temporal_shape" CHECK (
        (
          "time"."personal_event"."temporal_kind" = 'date'
          AND "time"."personal_event"."event_date" IS NOT NULL
          AND (
            "time"."personal_event"."end_date_exclusive" IS NULL
            OR "time"."personal_event"."end_date_exclusive" > "time"."personal_event"."event_date"
          )
          AND "time"."personal_event"."starts_at" IS NULL
          AND "time"."personal_event"."ends_at" IS NULL
          AND "time"."personal_event"."timezone" IS NULL
        )
        OR
        (
          "time"."personal_event"."temporal_kind" = 'timed'
          AND "time"."personal_event"."event_date" IS NULL
          AND "time"."personal_event"."end_date_exclusive" IS NULL
          AND "time"."personal_event"."starts_at" IS NOT NULL
          AND "time"."personal_event"."timezone" IS NOT NULL
          AND (
            "time"."personal_event"."ends_at" IS NULL
            OR "time"."personal_event"."ends_at" > "time"."personal_event"."starts_at"
          )
        )
      ),
	CONSTRAINT "ck_personal_event_status" CHECK (
        "time"."personal_event"."status"
        IN ('scheduled', 'completed', 'cancelled')
      ),
	CONSTRAINT "ck_personal_event_completion" CHECK (
        (
          "time"."personal_event"."status" = 'completed'
          AND "time"."personal_event"."completed_at" IS NOT NULL
        )
        OR
        (
          "time"."personal_event"."status" <> 'completed'
          AND "time"."personal_event"."completed_at" IS NULL
        )
      ),
	CONSTRAINT "ck_personal_event_description" CHECK (
        "time"."personal_event"."description" IS NULL
        OR char_length("time"."personal_event"."description") <= 2000
      ),
	CONSTRAINT "ck_personal_event_reference_url" CHECK (
        "time"."personal_event"."reference_url" IS NULL
        OR char_length("time"."personal_event"."reference_url") <= 2048
      ),
	CONSTRAINT "ck_personal_event_timezone" CHECK (
        "time"."personal_event"."timezone" IS NULL
        OR char_length("time"."personal_event"."timezone") BETWEEN 1 AND 100
      ),
	CONSTRAINT "ck_personal_event_notification_generation" CHECK ("time"."personal_event"."notification_generation" > 0),
	CONSTRAINT "ck_personal_event_actor_kind" CHECK ("time"."personal_event"."actor_kind" IN ('user', 'system', 'import')),
	CONSTRAINT "ck_personal_event_actor_user" CHECK (
        "time"."personal_event"."actor_kind" <> 'user'
        OR "time"."personal_event"."recorded_by_user_id" IS NOT NULL
      ),
	CONSTRAINT "ck_personal_event_version" CHECK ("time"."personal_event"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "career"."application_event" ADD CONSTRAINT "application_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_event" ADD CONSTRAINT "application_event_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_event" ADD CONSTRAINT "fk_application_event_application" FOREIGN KEY ("workspace_id","application_id") REFERENCES "career"."job_application"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_stage_history" ADD CONSTRAINT "application_stage_history_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_stage_history" ADD CONSTRAINT "application_stage_history_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_stage_history" ADD CONSTRAINT "fk_application_history_application" FOREIGN KEY ("workspace_id","application_id") REFERENCES "career"."job_application"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_stage_history" ADD CONSTRAINT "fk_application_history_command" FOREIGN KEY ("workspace_id","command_receipt_id") REFERENCES "core"."command_receipt"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_tag" ADD CONSTRAINT "application_tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_tag" ADD CONSTRAINT "fk_application_tag_application" FOREIGN KEY ("workspace_id","application_id") REFERENCES "career"."job_application"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."application_tag" ADD CONSTRAINT "fk_application_tag_tag" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "core"."tag"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."job_application" ADD CONSTRAINT "job_application_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."job_application" ADD CONSTRAINT "job_application_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."job_application" ADD CONSTRAINT "fk_job_application_resume" FOREIGN KEY ("workspace_id","resume_version_id") REFERENCES "career"."resume_version"("workspace_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."resume_version" ADD CONSTRAINT "resume_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "career"."resume_version" ADD CONSTRAINT "resume_version_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."module_preference" ADD CONSTRAINT "module_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "core"."onboarding_step" ADD CONSTRAINT "onboarding_step_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."personal_event" ADD CONSTRAINT "personal_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "time"."personal_event" ADD CONSTRAINT "personal_event_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_application_event_date" ON "career"."application_event" USING btree ("workspace_id","event_date","id") WHERE "career"."application_event"."temporal_kind" = 'date';--> statement-breakpoint
CREATE INDEX "ix_application_event_timed" ON "career"."application_event" USING btree ("workspace_id","starts_at","id") WHERE "career"."application_event"."temporal_kind" = 'timed';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_application_history_supersedes" ON "career"."application_stage_history" USING btree ("workspace_id","application_id","supersedes_history_id") WHERE "career"."application_stage_history"."supersedes_history_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_application_history_timeline" ON "career"."application_stage_history" USING btree ("workspace_id","application_id","effective_date","effective_order","id");--> statement-breakpoint
CREATE INDEX "ix_application_tag_tag" ON "career"."application_tag" USING btree ("workspace_id","tag_id","application_id");--> statement-breakpoint
CREATE INDEX "ix_job_application_list" ON "career"."job_application" USING btree ("workspace_id","archived_at","current_stage","applied_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_job_application_company" ON "career"."job_application" USING btree ("workspace_id","company_name");--> statement-breakpoint
CREATE INDEX "ix_personal_event_date" ON "time"."personal_event" USING btree ("workspace_id","status","event_date","id") WHERE "time"."personal_event"."temporal_kind" = 'date';--> statement-breakpoint
CREATE INDEX "ix_personal_event_timed" ON "time"."personal_event" USING btree ("workspace_id","status","starts_at","id") WHERE "time"."personal_event"."temporal_kind" = 'timed';