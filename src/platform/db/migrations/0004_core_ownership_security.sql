/*
 * Core ownership-root security.
 *
 * migration_owner owns the schema and tables.
 * app_domain receives only the DML required for normal authenticated
 * application operation.
 *
 * Deletion of ownership-root rows is intentionally not granted to app_domain.
 * Account lifecycle deletion is handled separately by the lifecycle path.
 */

REVOKE ALL ON SCHEMA "core" FROM PUBLIC;

REVOKE ALL ON SCHEMA "core"
FROM
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."user_profile",
  "core"."workspace",
  "core"."workspace_preference"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "core"."user_profile",
  "core"."workspace",
  "core"."workspace_preference"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

GRANT USAGE ON SCHEMA "core" TO app_domain;

GRANT SELECT, INSERT, UPDATE
ON TABLE
  "core"."user_profile",
  "core"."workspace",
  "core"."workspace_preference"
TO app_domain;

/*
 * Scope columns must remain immutable independently of RLS.
 */

CREATE FUNCTION "core"."enforce_user_profile_scope_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'core.user_profile.user_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_user_profile_scope_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_user_profile_scope_immutability"()
TO app_domain;

CREATE TRIGGER "user_profile_scope_immutability"
BEFORE UPDATE OF "user_id"
ON "core"."user_profile"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_user_profile_scope_immutability"();

CREATE FUNCTION "core"."enforce_workspace_scope_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'core.workspace.id is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'core.workspace.owner_user_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_workspace_scope_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_workspace_scope_immutability"()
TO app_domain;

CREATE TRIGGER "workspace_scope_immutability"
BEFORE UPDATE OF "id", "owner_user_id"
ON "core"."workspace"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_workspace_scope_immutability"();

CREATE FUNCTION "core"."enforce_workspace_preference_scope_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'core.workspace_preference.workspace_id is immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_workspace_preference_scope_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_workspace_preference_scope_immutability"()
TO app_domain;

CREATE TRIGGER "workspace_preference_scope_immutability"
BEFORE UPDATE OF "workspace_id"
ON "core"."workspace_preference"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_workspace_preference_scope_immutability"();

/*
 * Private application tables always use both ENABLE and FORCE RLS.
 */

ALTER TABLE "core"."user_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."user_profile" FORCE ROW LEVEL SECURITY;

ALTER TABLE "core"."workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."workspace" FORCE ROW LEVEL SECURITY;

ALTER TABLE "core"."workspace_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."workspace_preference" FORCE ROW LEVEL SECURITY;

/*
 * user_profile is identity-scoped.
 *
 * Missing app.user_id evaluates to NULL and therefore grants no access.
 */

CREATE POLICY "user_profile_owner_access"
ON "core"."user_profile"
FOR ALL
TO app_domain
USING (
  "user_id" =
    NULLIF(current_setting('app.user_id', true), '')::uuid
)
WITH CHECK (
  "user_id" =
    NULLIF(current_setting('app.user_id', true), '')::uuid
);

/*
 * workspace deliberately does not recursively inspect itself.
 * Ownership is established directly from owner_user_id.
 */

CREATE POLICY "workspace_owner_access"
ON "core"."workspace"
FOR ALL
TO app_domain
USING (
  "owner_user_id" =
    NULLIF(current_setting('app.user_id', true), '')::uuid
)
WITH CHECK (
  "owner_user_id" =
    NULLIF(current_setting('app.user_id', true), '')::uuid
);

/*
 * Child workspace rows must match both transaction-local scope values and an
 * active workspace owned by the authenticated user.
 */

CREATE POLICY "workspace_preference_owner_access"
ON "core"."workspace_preference"
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