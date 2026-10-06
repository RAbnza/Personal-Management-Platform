/*
 * Workspace single-currency integrity.
 *
 * SYSTEM_ARCHITECTURE.md and DATABASE_ARCHITECTURE.md establish that a
 * personal workspace uses one authoritative currency in V1 and that currency
 * becomes immutable once financial postings exist.
 *
 * Existing S1 foreign keys and ledger-account identity rules already prevent
 * unsafe currency rewrites once financial-account structure references the
 * workspace currency. This trigger adds the explicit documented database
 * invariant for financial history itself so the rule does not depend only on
 * application-service checks or incidental foreign-key behavior.
 */

CREATE FUNCTION "core"."enforce_workspace_currency_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    WHERE posting."workspace_id" = OLD.id
  ) THEN
    RAISE EXCEPTION
      'workspace currency cannot change after posting history exists'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_workspace_currency_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_workspace_currency_immutability"()
TO app_domain;

CREATE TRIGGER "workspace_currency_immutability"
BEFORE UPDATE OF "currency"
ON "core"."workspace"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_workspace_currency_immutability"();