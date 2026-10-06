/*
 * S2 career/time/guidance integrity.
 *
 * This migration completes database-level S2 rules that cannot be represented
 * completely by the declarative Drizzle schema:
 *
 * - active-lifecycle guards for ordinary nonfinancial private writes
 * - remaining FK-supporting indexes
 * - immutable application stage history
 * - stage-history correction safety
 * - deferred resolved-history/current-pointer agreement
 * - deferred next-action/event agreement
 * - source notification-generation maintenance
 * - security-invoker agenda projection
 *
 * Module-key canonical values are intentionally not invented here. The
 * documented module allowlist will be established together with the shared
 * application constants/provisioning contract so database and TypeScript keys
 * cannot drift.
 */

/*
 * ---------------------------------------------------------------------------
 * Nonfinancial private-write lifecycle guard
 * ---------------------------------------------------------------------------
 *
 * Private nonfinancial writes must participate in the account-lifecycle lock
 * protocol:
 *
 *   1. require transaction-local app.user_id + app.workspace_id
 *   2. lock the authenticated user's active core.user_profile FOR SHARE
 *   3. verify the workspace is active and owned by that user
 *
 * Lifecycle/migration roles are privileged paths with separately reviewed
 * protocols. The ordinary app_domain role is the runtime path protected here.
 */

CREATE FUNCTION "core"."guard_active_private_domain_write"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_workspace_id := OLD.workspace_id;
  ELSE
    v_workspace_id := NEW.workspace_id;
  END IF;

  /*
   * app_domain is the ordinary authenticated private-domain role.
   * Privileged lifecycle/migration paths are governed separately.
   */
  IF current_user <> 'app_domain' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  v_user_id :=
    NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'private domain write requires app.user_id'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(
    current_setting('app.workspace_id', true),
    ''
  )::uuid IS DISTINCT FROM v_workspace_id THEN
    RAISE EXCEPTION
      'private domain write workspace does not match app.workspace_id'
      USING ERRCODE = '42501';
  END IF;

  /*
   * This lock is the deletion-race guard documented for nonfinancial writes.
   * Lifecycle transitions take the same row FOR UPDATE, so they wait for
   * already-running private commands and prevent new ones afterwards.
   */
  PERFORM 1
  FROM "core"."user_profile" AS p
  WHERE
    p."user_id" = v_user_id
    AND p."lifecycle" = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'private domain write requires an active user profile'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM "core"."workspace" AS w
  WHERE
    w."id" = v_workspace_id
    AND w."owner_user_id" = v_user_id
    AND w."state" = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'private domain write requires an active owned workspace'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."guard_active_private_domain_write"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."guard_active_private_domain_write"()
TO app_domain;

/*
 * Use an alphabetically early trigger name so the lifecycle guard runs before
 * the other S2 BEFORE triggers on ordinary app_domain mutations.
 */

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "core"."module_preference"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "core"."onboarding_step"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "career"."resume_version"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "career"."job_application"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT
ON "career"."application_stage_history"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR DELETE
ON "career"."application_tag"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

CREATE TRIGGER "a0_private_domain_write_guard"
BEFORE INSERT OR UPDATE
ON "time"."personal_event"
FOR EACH ROW
EXECUTE FUNCTION "core"."guard_active_private_domain_write"();

/*
 * ---------------------------------------------------------------------------
 * Remaining FK-supporting indexes
 * ---------------------------------------------------------------------------
 *
 * Evidence attribution points at auth.user rather than another workspace
 * table, so workspace-leading indexes do not cover these FK checks.
 */

CREATE INDEX "ix_resume_version_recorded_by"
ON "career"."resume_version" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_job_application_recorded_by"
ON "career"."job_application" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_application_history_recorded_by"
ON "career"."application_stage_history" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_application_event_recorded_by"
ON "career"."application_event" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

CREATE INDEX "ix_personal_event_recorded_by"
ON "time"."personal_event" ("recorded_by_user_id")
WHERE "recorded_by_user_id" IS NOT NULL;

/*
 * ---------------------------------------------------------------------------
 * Application-stage history immutability and correction shape
 * ---------------------------------------------------------------------------
 *
 * Normal stage changes append observations. Corrections append another history
 * row with supersedes_history_id; they never rewrite the original row.
 */

ALTER TABLE "career"."application_stage_history"
ADD CONSTRAINT "ck_application_history_not_self_supersede"
CHECK (
  "supersedes_history_id" IS NULL
  OR "supersedes_history_id" <> "id"
);

CREATE FUNCTION "career"."enforce_application_stage_history_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  /*
   * Whole-workspace lifecycle purge is the explicit evidence-retention
   * exception. Ordinary application operations cannot update/delete history.
   */
  IF current_user = 'lifecycle_operator' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'career application stage history is immutable; append a correction instead'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL
ON FUNCTION "career"."enforce_application_stage_history_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."enforce_application_stage_history_immutability"()
TO app_domain;

CREATE TRIGGER "application_stage_history_immutability"
BEFORE UPDATE OR DELETE
ON "career"."application_stage_history"
FOR EACH ROW
EXECUTE FUNCTION "career"."enforce_application_stage_history_immutability"();

/*
 * ---------------------------------------------------------------------------
 * Resolved application-history/current-pointer agreement
 * ---------------------------------------------------------------------------
 *
 * A normal stage transition does not supersede the prior stage observation.
 * supersedes_history_id is only for corrections.
 *
 * The resolved timeline therefore consists of history rows that have not been
 * superseded by a correction. The current application state is the latest row
 * in that resolved timeline ordered by:
 *
 *   effective_date
 *   effective_order
 *   id
 *
 * The UUID is a final deterministic tie-breaker after the user-controlled
 * same-day effective_order.
 */

CREATE FUNCTION "career"."validate_job_application_current_history"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_application_id uuid;

  v_current_history_id uuid;
  v_current_stage text;
  v_current_outcome text;

  v_resolved_history_id uuid;
  v_resolved_stage text;
  v_resolved_outcome text;
BEGIN
  IF TG_TABLE_NAME = 'job_application' THEN
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_application_id := OLD.id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_application_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_application_id := OLD.application_id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_application_id := NEW.application_id;
    END IF;
  END IF;

  SELECT
    a."current_history_id",
    a."current_stage",
    a."current_outcome"
  INTO
    v_current_history_id,
    v_current_stage,
    v_current_outcome
  FROM "career"."job_application" AS a
  WHERE
    a."workspace_id" = v_workspace_id
    AND a."id" = v_application_id;

  /*
   * Lifecycle purge may remove the parent before a deferred trigger executes.
   */
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    h."id",
    h."stage",
    h."outcome"
  INTO
    v_resolved_history_id,
    v_resolved_stage,
    v_resolved_outcome
  FROM "career"."application_stage_history" AS h
  WHERE
    h."workspace_id" = v_workspace_id
    AND h."application_id" = v_application_id
    AND NOT EXISTS (
      SELECT 1
      FROM "career"."application_stage_history" AS correction
      WHERE
        correction."workspace_id" = h."workspace_id"
        AND correction."application_id" = h."application_id"
        AND correction."supersedes_history_id" = h."id"
    )
  ORDER BY
    h."effective_date" DESC,
    h."effective_order" DESC,
    h."id" DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'job application must have at least one resolved stage-history row'
      USING ERRCODE = '23514';
  END IF;

  IF v_current_history_id IS DISTINCT FROM v_resolved_history_id THEN
    RAISE EXCEPTION
      'job application current_history_id must reference the resolved current history row'
      USING ERRCODE = '23514';
  END IF;

  IF v_current_stage IS DISTINCT FROM v_resolved_stage THEN
    RAISE EXCEPTION
      'job application current_stage must match the resolved current history row'
      USING ERRCODE = '23514';
  END IF;

  IF v_current_outcome IS DISTINCT FROM v_resolved_outcome THEN
    RAISE EXCEPTION
      'job application current_outcome must match the resolved current history row'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "career"."validate_job_application_current_history"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."validate_job_application_current_history"()
TO app_domain;

/*
 * The deferred checks allow creation of an application and its first history
 * row using preallocated UUIDs in one transaction. They also allow a correction
 * row and the aggregate pointer/derived fields to change atomically.
 */

CREATE CONSTRAINT TRIGGER "job_application_current_history_integrity"
AFTER INSERT OR UPDATE
ON "career"."job_application"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "career"."validate_job_application_current_history"();

CREATE CONSTRAINT TRIGGER "application_history_current_pointer_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "career"."application_stage_history"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "career"."validate_job_application_current_history"();

/*
 * ---------------------------------------------------------------------------
 * Next-action pointer agreement
 * ---------------------------------------------------------------------------
 *
 * next_action_event_id is the only authoritative next-action date pointer.
 *
 * Career agenda/actionable scheduled sources in the first slice are:
 *
 *   interview
 *   assessment
 *   follow_up
 *
 * Submission, response, offer, no_response and note entries remain timeline
 * evidence unless a later reviewed product contract gives them scheduling
 * semantics.
 */

CREATE FUNCTION "career"."validate_job_application_next_action"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_application_id uuid;
  v_next_action_event_id uuid;

  v_event_kind text;
  v_event_status text;
BEGIN
  IF TG_TABLE_NAME = 'job_application' THEN
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_application_id := OLD.id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_application_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_application_id := OLD.application_id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_application_id := NEW.application_id;
    END IF;
  END IF;

  SELECT a."next_action_event_id"
  INTO v_next_action_event_id
  FROM "career"."job_application" AS a
  WHERE
    a."workspace_id" = v_workspace_id
    AND a."id" = v_application_id;

  /*
   * Lifecycle purge may remove the parent before the deferred check runs.
   */
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_next_action_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    e."event_kind",
    e."status"
  INTO
    v_event_kind,
    v_event_status
  FROM "career"."application_event" AS e
  WHERE
    e."workspace_id" = v_workspace_id
    AND e."application_id" = v_application_id
    AND e."id" = v_next_action_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'job application next action event does not exist for this application'
      USING ERRCODE = '23514';
  END IF;

  IF v_event_status <> 'scheduled' THEN
    RAISE EXCEPTION
      'job application next action must reference a scheduled event'
      USING ERRCODE = '23514';
  END IF;

  IF v_event_kind NOT IN (
    'interview',
    'assessment',
    'follow_up'
  ) THEN
    RAISE EXCEPTION
      'job application next action must reference an actionable career event'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "career"."validate_job_application_next_action"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."validate_job_application_next_action"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "job_application_next_action_integrity"
AFTER INSERT OR UPDATE
ON "career"."job_application"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "career"."validate_job_application_next_action"();

CREATE CONSTRAINT TRIGGER "application_event_next_action_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "career"."application_event"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "career"."validate_job_application_next_action"();

/*
 * ---------------------------------------------------------------------------
 * Reminder/source notification generations
 * ---------------------------------------------------------------------------
 *
 * Source generations change only when reminder scheduling/eligibility changes.
 * Descriptive edits such as notes do not create a new generation.
 *
 * The database owns generation advancement so callers cannot accidentally
 * decrement it, skip generations or create a resend merely by changing a note.
 */

CREATE FUNCTION "career"."apply_application_event_notification_generation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW.event_kind,
    NEW.temporal_kind,
    NEW.event_date,
    NEW.starts_at,
    NEW.ends_at,
    NEW.timezone,
    NEW.status
  ) IS DISTINCT FROM ROW(
    OLD.event_kind,
    OLD.temporal_kind,
    OLD.event_date,
    OLD.starts_at,
    OLD.ends_at,
    OLD.timezone,
    OLD.status
  ) THEN
    NEW.notification_generation :=
      OLD.notification_generation + 1;
  ELSE
    NEW.notification_generation :=
      OLD.notification_generation;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "career"."apply_application_event_notification_generation"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."apply_application_event_notification_generation"()
TO app_domain;

CREATE TRIGGER "application_event_notification_generation_update"
BEFORE UPDATE
ON "career"."application_event"
FOR EACH ROW
EXECUTE FUNCTION "career"."apply_application_event_notification_generation"();

CREATE FUNCTION "time"."apply_personal_event_notification_generation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(
    NEW.temporal_kind,
    NEW.event_date,
    NEW.end_date_exclusive,
    NEW.starts_at,
    NEW.ends_at,
    NEW.timezone,
    NEW.status
  ) IS DISTINCT FROM ROW(
    OLD.temporal_kind,
    OLD.event_date,
    OLD.end_date_exclusive,
    OLD.starts_at,
    OLD.ends_at,
    OLD.timezone,
    OLD.status
  ) THEN
    NEW.notification_generation :=
      OLD.notification_generation + 1;
  ELSE
    NEW.notification_generation :=
      OLD.notification_generation;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "time"."apply_personal_event_notification_generation"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "time"."apply_personal_event_notification_generation"()
TO app_domain;

CREATE TRIGGER "personal_event_notification_generation_update"
BEFORE UPDATE
ON "time"."personal_event"
FOR EACH ROW
EXECUTE FUNCTION "time"."apply_personal_event_notification_generation"();

/*
 * ---------------------------------------------------------------------------
 * Source-driven agenda projection
 * ---------------------------------------------------------------------------
 *
 * This view contains no duplicated persisted appointment authority.
 *
 * The API/query service supplies the bounded requested date/time range and
 * applies local-time interpretation. The view intentionally does not compare
 * date-only values against CURRENT_DATE/UTC.
 *
 * Module-disable state also does not remove a source from this projection.
 * Architecture requires hidden modules to retain data and, by default, keep
 * agenda sources visible. Explicit agenda preference/filtering belongs in the
 * agenda query service.
 *
 * Completed/cancelled sources disappear naturally because only scheduled
 * source rows are eligible.
 */

CREATE VIEW "time"."agenda_v"
WITH (security_invoker = true)
AS
SELECT
  'personal_event'::text AS "source_kind",
  e."id" AS "source_id",
  'single'::text AS "occurrence_key",
  e."title" AS "title",
  e."notification_generation" AS "notification_generation",
  e."temporal_kind" AS "temporal_kind",
  e."event_date" AS "event_date",
  e."end_date_exclusive" AS "end_date_exclusive",
  e."starts_at" AS "starts_at",
  e."ends_at" AS "ends_at",
  e."timezone" AS "timezone",
  e."status" AS "status",
  e."version" AS "source_version"
FROM "time"."personal_event" AS e
WHERE
  e."status" = 'scheduled'

UNION ALL

SELECT
  'application_event'::text AS "source_kind",
  e."id" AS "source_id",
  'single'::text AS "occurrence_key",
  e."title" AS "title",
  e."notification_generation" AS "notification_generation",
  e."temporal_kind" AS "temporal_kind",
  e."event_date" AS "event_date",
  NULL::date AS "end_date_exclusive",
  e."starts_at" AS "starts_at",
  e."ends_at" AS "ends_at",
  e."timezone" AS "timezone",
  e."status" AS "status",
  e."version" AS "source_version"
FROM "career"."application_event" AS e
INNER JOIN "career"."job_application" AS a
  ON a."workspace_id" = e."workspace_id"
  AND a."id" = e."application_id"
WHERE
  e."status" = 'scheduled'
  AND e."event_kind" IN (
    'interview',
    'assessment',
    'follow_up'
  )
  AND a."archived_at" IS NULL;

REVOKE ALL PRIVILEGES
ON TABLE "time"."agenda_v"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE "time"."agenda_v"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

GRANT SELECT
ON TABLE "time"."agenda_v"
TO app_domain;