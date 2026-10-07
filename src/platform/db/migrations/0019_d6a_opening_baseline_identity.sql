/*
 * D6a opening-debt logical baseline identity.
 *
 * A debt may have only one logical opening action.
 *
 * Multiple opening links are permitted only when they belong to later
 * revisions of that same financial_action. This keeps the database compatible
 * with a future explicit opening-baseline correction workflow while preventing
 * a second independent opening baseline from being attached to the debt.
 *
 * finance.guard_debt_action_link_parent() already serializes financial writes
 * through the owned workspace, so concurrent opening-link creation for one
 * workspace cannot bypass this deferred validation.
 */

CREATE FUNCTION "finance"."validate_debt_opening_action_identity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.purpose <> 'opening' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."debt_action_link" AS existing
    WHERE
      existing."workspace_id" = NEW.workspace_id
      AND existing."debt_id" = NEW.debt_id
      AND existing."purpose" = 'opening'
      AND existing."action_id" <> NEW.action_id
  )
  THEN
    RAISE EXCEPTION
      'debt may have only one logical opening financial action'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_debt_opening_action_identity"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_debt_opening_action_identity"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "debt_opening_action_identity_integrity"
AFTER INSERT
ON "finance"."debt_action_link"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."purpose" = 'opening')
EXECUTE FUNCTION "finance"."validate_debt_opening_action_identity"();