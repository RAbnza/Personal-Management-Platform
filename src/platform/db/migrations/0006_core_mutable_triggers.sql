/*
 * Mutable-aggregate enforcement for the S0 core ownership tables.
 *
 * DATABASE_ARCHITECTURE.md defines the M bundle as:
 *
 * - updated_at timestamptz NOT NULL DEFAULT now()
 * - version integer NOT NULL DEFAULT 1 CHECK (version > 0)
 * - every update increments version and refreshes updated_at
 * - scope/identity columns remain immutable independently
 *
 * Scope immutability is already enforced by the ownership-security migration.
 * This migration implements the remaining update behavior centrally in
 * PostgreSQL so raw SQL, Drizzle, scripts and future callers all observe the
 * same invariant.
 */

CREATE FUNCTION "core"."apply_mutable_aggregate_update"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."apply_mutable_aggregate_update"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."apply_mutable_aggregate_update"()
TO app_domain;

CREATE TRIGGER "user_profile_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."user_profile"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "workspace_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."workspace"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();

CREATE TRIGGER "workspace_preference_mutable_aggregate_update"
BEFORE UPDATE
ON "core"."workspace_preference"
FOR EACH ROW
EXECUTE FUNCTION "core"."apply_mutable_aggregate_update"();