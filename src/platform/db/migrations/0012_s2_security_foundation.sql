/*
 * S2 career/time/guidance security and structural-integrity foundation.
 *
 * This migration deliberately handles concerns that are either outside
 * Drizzle's declarative schema model or clearer as reviewed PostgreSQL SQL:
 *
 * - runtime privileges for new core/career/time tables
 * - scoped deferred application history/event pointers
 * - same-application history supersession
 * - missing FK-supporting indexes
 * - private-record identity/scope immutability
 * - evidence-attribution immutability on mutable evidence aggregates
 * - mutable-aggregate version/timestamp triggers
 * - FORCE RLS on every private S2 table
 * - workspace/user ownership policies
 *
 * Higher-level career invariants are added separately in the S2 integrity
 * migration. In particular, that migration validates resolved stage history,
 * current-history agreement, next-action semantics, history immutability and
 * the agenda projection.
 */

/*
 * ---------------------------------------------------------------------------
 * Schema and table privileges
 * ---------------------------------------------------------------------------
 */

REVOKE ALL ON SCHEMA "career" FROM PUBLIC;
REVOKE ALL ON SCHEMA "time" FROM PUBLIC;

REVOKE ALL ON SCHEMA "career"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

REVOKE ALL ON SCHEMA "time"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."module_preference",
  "core"."onboarding_step"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "career"."resume_version",
  "career"."job_application",
  "career"."application_stage_history",
  "career"."application_event",
  "career"."application_tag"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "time"."personal_event"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."module_preference",
  "core"."onboarding_step",
  "career"."resume_version",
  "career"."job_application",
  "career"."application_stage_history",
  "career"."application_event",
  "career"."application_tag",
  "time"."personal_event"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

GRANT USAGE ON SCHEMA "career" TO app_domain;
GRANT USAGE ON SCHEMA "time" TO app_domain;

/*
 * User-controlled mutable roots.
 *
 * DELETE is deliberately not granted to the mutable event/evidence tables in
 * this foundation migration. Later source-reminder and lifecycle rules need a
 * reviewed deletion contract before ordinary runtime deletion is opened.
 */
GRANT SELECT, INSERT, UPDATE
ON TABLE
  "core"."module_preference",
  "core"."onboarding_step",
  "career"."resume_version",
  "career"."job_application",
  "career"."application_event",
  "time"."personal_event"
TO app_domain;

/*
 * Stage-history rows are immutable observations/corrections. New facts are
 * appended instead of updating or deleting prior evidence.
 */
GRANT SELECT, INSERT
ON TABLE "career"."application_stage_history"
TO app_domain;

/*
 * Application tags are ordinary private joins. Unlinking removes only the
 * association, never the application or tag.
 */
GRANT SELECT, INSERT, DELETE
ON TABLE "career"."application_tag"
TO app_domain;

/*
 * ---------------------------------------------------------------------------
 * Deferred and same-parent foreign keys
 * ---------------------------------------------------------------------------
 */

/*
 * job_application.current_history_id and
 * application_stage_history.application_id intentionally form a cycle.
 *
 * The application can therefore be inserted with a preallocated first-history
 * UUID, followed by that history row in the same transaction.
 */
ALTER TABLE "career"."job_application"
ADD CONSTRAINT "fk_job_application_current_history"
FOREIGN KEY ("workspace_id", "id", "current_history_id")
REFERENCES "career"."application_stage_history"
  ("workspace_id", "application_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * The next-action pointer may be created atomically with a newly created
 * application event. It must always point at an event belonging to this exact
 * application, not merely another event in the same workspace.
 */
ALTER TABLE "career"."job_application"
ADD CONSTRAINT "fk_job_application_next_action_event"
FOREIGN KEY ("workspace_id", "id", "next_action_event_id")
REFERENCES "career"."application_event"
  ("workspace_id", "application_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

/*
 * A correction may supersede only a history row for the same application.
 * Unlike the current-history cycle, this relationship does not require a
 * forward reference, so immediate validation is preferable.
 */
ALTER TABLE "career"."application_stage_history"
ADD CONSTRAINT "fk_application_history_supersedes"
FOREIGN KEY ("workspace_id", "application_id", "supersedes_history_id")
REFERENCES "career"."application_stage_history"
  ("workspace_id", "application_id", "id")
ON DELETE RESTRICT
ON UPDATE RESTRICT;

/*
 * Drizzle created the semantic indexes declared directly in the schema.
 * These two additional indexes cover composite FKs whose referencing columns
 * otherwise lack a useful left-prefix index.
 */
CREATE INDEX "ix_job_application_resume_version"
ON "career"."job_application"
  ("workspace_id", "resume_version_id")
WHERE "resume_version_id" IS NOT NULL;

CREATE INDEX "ix_application_history_command"
ON "career"."application_stage_history"
  ("workspace_id", "command_receipt_id");

/*
 * ---------------------------------------------------------------------------
 * Scope and identity immutability
 * ---------------------------------------------------------------------------
 *
 * core.enforce_private_record_scope_immutability() was introduced with S1.
 * It is reused for mutable P-bundle tables exposing id + workspace_id.
 */

CREATE TRIGGER "resume_version_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "career"."resume_version"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "job_application_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "career"."job_application"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "application_event_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

CREATE TRIGGER "personal_event_scope_immutability"
BEFORE UPDATE OF "id", "workspace_id"
ON "time"."personal_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_record_scope_immutability"();

/*
 * module_preference uses a meaningful composite identity instead of a
 * surrogate id. Neither workspace nor module identity may change in place.
 */
CREATE FUNCTION "core"."enforce_module_preference_identity_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'core.module_preference.workspace_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.module_key IS DISTINCT FROM OLD.module_key THEN
    RAISE EXCEPTION 'core.module_preference.module_key is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_module_preference_identity_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_module_preference_identity_immutability"()
TO app_domain;

CREATE TRIGGER "module_preference_identity_immutability"
BEFORE UPDATE OF "workspace_id", "module_key"
ON "core"."module_preference"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_module_preference_identity_immutability"();

/*
 * An onboarding row represents one stable guide-version/step identity.
 * Changing progress updates state; it never repurposes the existing row as a
 * different guide or step.
 */
CREATE FUNCTION "core"."enforce_onboarding_step_identity_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'core.onboarding_step.workspace_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.guide_version IS DISTINCT FROM OLD.guide_version THEN
    RAISE EXCEPTION 'core.onboarding_step.guide_version is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.step_key IS DISTINCT FROM OLD.step_key THEN
    RAISE EXCEPTION 'core.onboarding_step.step_key is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_onboarding_step_identity_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_onboarding_step_identity_immutability"()
TO app_domain;

CREATE TRIGGER "onboarding_step_identity_immutability"
BEFORE UPDATE OF "workspace_id", "guide_version", "step_key"
ON "core"."onboarding_step"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_onboarding_step_identity_immutability"();

/*
 * application_event is a child of one application. Rescheduling or changing
 * event details must not move the event to another application.
 */
CREATE FUNCTION "career"."enforce_application_event_identity_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.application_id IS DISTINCT FROM OLD.application_id THEN
    RAISE EXCEPTION 'career.application_event.application_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "career"."enforce_application_event_identity_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."enforce_application_event_identity_immutability"()
TO app_domain;

CREATE TRIGGER "application_event_identity_immutability"
BEFORE UPDATE OF "application_id"
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "career"."enforce_application_event_identity_immutability"();

/*
 * ---------------------------------------------------------------------------
 * Evidence attribution immutability
 * ---------------------------------------------------------------------------
 *
 * E-bundle attribution records who/what originally recorded the fact.
 * Subsequent audited edits do not rewrite that original attribution.
 */

CREATE FUNCTION "core"."enforce_private_evidence_attribution_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id THEN
    RAISE EXCEPTION 'recorded_by_user_id is immutable evidence attribution'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.actor_kind IS DISTINCT FROM OLD.actor_kind THEN
    RAISE EXCEPTION 'actor_kind is immutable evidence attribution'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'request_id is immutable evidence attribution'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_private_evidence_attribution_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_private_evidence_attribution_immutability"()
TO app_domain;

CREATE TRIGGER "resume_version_evidence_attribution_immutability"
BEFORE UPDATE OF
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "career"."resume_version"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_evidence_attribution_immutability"();

CREATE TRIGGER "job_application_evidence_attribution_immutability"
BEFORE UPDATE OF
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "career"."job_application"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_evidence_attribution_immutability"();

CREATE TRIGGER "application_event_evidence_attribution_immutability"
BEFORE UPDATE OF
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_evidence_attribution_immutability"();

CREATE TRIGGER "personal_event_evidence_attribution_immutability"
BEFORE UPDATE OF
  "recorded_by_user_id",
  "actor_kind",
  "request_id"
ON "time"."personal_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_private_evidence_attribution_immutability"();

/*
 * ---------------------------------------------------------------------------
 * Mutable aggregate bundle
 * ---------------------------------------------------------------------------
 *
 * core.apply_mutable_aggregate_update() implements the documented M bundle:
 *
 *   version := previous version + 1
 *   updated_at := clock_timestamp()
 */

CREATE TRIGGER "module_preference_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."module_preference"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "job_application_mutable_aggregate_update"
BEFORE UPDATE
ON "career"."job_application"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "application_event_mutable_aggregate_update"
BEFORE UPDATE
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "personal_event_mutable_aggregate_update"
BEFORE UPDATE
ON "time"."personal_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

/*
 * onboarding_step intentionally does not use the M bundle and therefore does
 * not receive the version-increment trigger. Its updated_at value is supplied
 * explicitly by the onboarding command that changes state.
 */

/*
 * ---------------------------------------------------------------------------
 * Row-level security
 * ---------------------------------------------------------------------------
 *
 * Every S2 private row is constrained by both transaction-local workspace
 * context and an active workspace owned by transaction-local app.user_id.
 *
 * Missing context evaluates to NULL and therefore grants no row access.
 */

ALTER TABLE "core"."module_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."module_preference" FORCE ROW LEVEL SECURITY;

ALTER TABLE "core"."onboarding_step" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."onboarding_step" FORCE ROW LEVEL SECURITY;

ALTER TABLE "career"."resume_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career"."resume_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "career"."job_application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career"."job_application" FORCE ROW LEVEL SECURITY;

ALTER TABLE "career"."application_stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career"."application_stage_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "career"."application_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career"."application_event" FORCE ROW LEVEL SECURITY;

ALTER TABLE "career"."application_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career"."application_tag" FORCE ROW LEVEL SECURITY;

ALTER TABLE "time"."personal_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time"."personal_event" FORCE ROW LEVEL SECURITY;

/*
 * Core S2 policies.
 */

CREATE POLICY "module_preference_owner_access"
ON "core"."module_preference"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "onboarding_step_owner_access"
ON "core"."onboarding_step"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

/*
 * Career policies.
 */

CREATE POLICY "resume_version_owner_access"
ON "career"."resume_version"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "job_application_owner_access"
ON "career"."job_application"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "application_stage_history_owner_access"
ON "career"."application_stage_history"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "application_event_owner_access"
ON "career"."application_event"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

CREATE POLICY "application_tag_owner_access"
ON "career"."application_tag"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);

/*
 * Time policies.
 */

CREATE POLICY "personal_event_owner_access"
ON "time"."personal_event"
FOR ALL
TO app_domain
USING (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
)
WITH CHECK (
  "workspace_id" =
    NULLIF(current_setting('app.workspace_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM "core"."workspace" AS w
    WHERE
      w."id" =
        NULLIF(current_setting('app.workspace_id', true), '')::uuid
      AND w."owner_user_id" =
        NULLIF(current_setting('app.user_id', true), '')::uuid
      AND w."state" = 'active'
  )
);