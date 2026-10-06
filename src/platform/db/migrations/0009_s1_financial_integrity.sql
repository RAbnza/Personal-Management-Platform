/*
 * S1 financial state-machine and accounting-integrity foundation.
 *
 * This migration enforces:
 *
 * - workspace serialization for financial mutation roots
 * - parent locking for financial child writes
 * - immutable finalized journals and revisions
 * - immutable postings
 * - FIN-01: every committed journal is posted, balanced and has >= 2 lines
 * - FIN-02: finalized journals cannot be edited or extended
 * - FIN-04: revision chains are contiguous and the action pointer references
 *   the highest finalized revision
 * - financial-account ledger bindings use cash_asset buckets
 * - ledger kind/currency cannot be rewritten after financial use
 *
 * Exact reversal semantics, action recipes, posting classifications and
 * opening-account recipe validation are added by the following S1 integrity
 * migration.
 */

/*
 * ---------------------------------------------------------------------------
 * Workspace serialization
 * ---------------------------------------------------------------------------
 *
 * Ordinary finance mutation roots lock:
 *
 *   1. the authenticated user's profile FOR SHARE
 *   2. the active owned workspace FOR UPDATE
 *
 * This mirrors the documented finance transaction protocol and prevents two
 * unrelated financial commands from mutating one workspace concurrently.
 */

CREATE FUNCTION "finance"."lock_active_workspace"(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id :=
    NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'financial write requires app.user_id'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(
    current_setting('app.workspace_id', true),
    ''
  )::uuid IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION
      'financial write workspace does not match app.workspace_id'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM "core"."user_profile" AS p
  WHERE
    p."user_id" = v_user_id
    AND p."lifecycle" = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial write requires an active user profile'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM "core"."workspace" AS w
  WHERE
    w."id" = p_workspace_id
    AND w."owner_user_id" = v_user_id
    AND w."state" = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial write requires an active owned workspace'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."lock_active_workspace"(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."lock_active_workspace"(uuid)
TO app_domain;

CREATE FUNCTION "finance"."guard_financial_root_write"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM "finance"."lock_active_workspace"(NEW.workspace_id);

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_financial_root_write"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_financial_root_write"()
TO app_domain;

/*
 * Ledger/account mutations affect the interpretation of financial history,
 * while actions and revisions are the primary financial command roots.
 */

CREATE TRIGGER "ledger_account_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."ledger_account"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

CREATE TRIGGER "financial_account_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."financial_account"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

CREATE TRIGGER "financial_action_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."financial_action"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

CREATE TRIGGER "action_revision_financial_root_guard"
BEFORE INSERT OR UPDATE
ON "finance"."action_revision"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_financial_root_write"();

/*
 * ---------------------------------------------------------------------------
 * Parent locking for journal writes
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."guard_journal_parent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT r."state"
  INTO v_state
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = NEW.workspace_id
    AND r."action_id" = NEW.action_id
    AND r."id" = NEW.action_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'journal action revision does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  /*
   * A journal may be inserted only while its revision is being assembled.
   * Finalizing an already-created journal while the revision remains building
   * is allowed.
   */
  IF TG_OP = 'INSERT' AND v_state <> 'building' THEN
    RAISE EXCEPTION
      'cannot add a journal to a finalized action revision'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_journal_parent"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_journal_parent"()
TO app_domain;

CREATE TRIGGER "journal_parent_guard"
BEFORE INSERT OR UPDATE
ON "finance"."journal"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_journal_parent"();

/*
 * ---------------------------------------------------------------------------
 * Parent locking for postings
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."guard_posting_parent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT j."state"
  INTO v_state
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = NEW.workspace_id
    AND j."action_revision_id" = NEW.action_revision_id
    AND j."id" = NEW.journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'posting journal does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'building' THEN
    RAISE EXCEPTION
      'cannot append a posting to a finalized journal'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_posting_parent"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_posting_parent"()
TO app_domain;

CREATE TRIGGER "posting_parent_guard"
BEFORE INSERT
ON "finance"."posting"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_posting_parent"();

/*
 * ---------------------------------------------------------------------------
 * Parent locking for revision-scoped typed evidence
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."guard_revision_evidence_parent"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT r."state"
  INTO v_state
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = NEW.workspace_id
    AND r."action_id" = NEW.action_id
    AND r."id" = NEW.action_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial evidence action revision does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'building' THEN
    RAISE EXCEPTION
      'cannot append evidence to a finalized action revision'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."guard_revision_evidence_parent"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."guard_revision_evidence_parent"()
TO app_domain;

CREATE TRIGGER "receipt_detail_revision_guard"
BEFORE INSERT
ON "finance"."receipt_detail"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_revision_evidence_parent"();

CREATE TRIGGER "purchase_detail_revision_guard"
BEFORE INSERT
ON "finance"."purchase_detail"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_revision_evidence_parent"();

CREATE TRIGGER "transfer_detail_revision_guard"
BEFORE INSERT
ON "finance"."transfer_detail"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_revision_evidence_parent"();

CREATE TRIGGER "fee_component_revision_guard"
BEFORE INSERT
ON "finance"."fee_component"
FOR EACH ROW
EXECUTE FUNCTION "finance"."guard_revision_evidence_parent"();

/*
 * ---------------------------------------------------------------------------
 * Journal state machine
 * ---------------------------------------------------------------------------
 *
 * Journals are inserted fully described as building rows. Their only ordinary
 * UPDATE is the one-way building -> posted finalization transition.
 */

CREATE FUNCTION "finance"."enforce_journal_state_machine"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'building' OR NEW.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION
        'journal must be inserted in building state'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_user <> 'lifecycle_operator' THEN
      RAISE EXCEPTION
        'ordinary deletion of financial journals is prohibited'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.state = 'posted' THEN
    RAISE EXCEPTION
      'finalized journals are immutable'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Journal identity and economic meaning are immutable after INSERT.
   * Only state/finalized_at may change during finalization.
   */
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.action_revision_id IS DISTINCT FROM OLD.action_revision_id
    OR NEW.sequence_no IS DISTINCT FROM OLD.sequence_no
    OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.reverses_journal_id IS DISTINCT FROM OLD.reverses_journal_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'journal fields cannot be rewritten after creation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state <> 'posted' OR NEW.finalized_at IS NULL THEN
    RAISE EXCEPTION
      'journal update must finalize building -> posted'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_journal_state_machine"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_journal_state_machine"()
TO app_domain;

CREATE TRIGGER "journal_state_machine"
BEFORE INSERT OR UPDATE OR DELETE
ON "finance"."journal"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_journal_state_machine"();

/*
 * ---------------------------------------------------------------------------
 * Action-revision state machine
 * ---------------------------------------------------------------------------
 *
 * Economic meaning belongs to immutable revisions. A revision is inserted in
 * building state and receives exactly one ordinary UPDATE: finalization.
 */

CREATE FUNCTION "finance"."enforce_action_revision_state_machine"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'building' OR NEW.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION
        'action revision must be inserted in building state'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_user <> 'lifecycle_operator' THEN
      RAISE EXCEPTION
        'ordinary deletion of action revisions is prohibited'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.state = 'posted' THEN
    RAISE EXCEPTION
      'finalized action revisions are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.action_id IS DISTINCT FROM OLD.action_id
    OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
    OR NEW.previous_revision_id IS DISTINCT FROM OLD.previous_revision_id
    OR NEW.command_receipt_id IS DISTINCT FROM OLD.command_receipt_id
    OR NEW.change_kind IS DISTINCT FROM OLD.change_kind
    OR NEW.action_kind IS DISTINCT FROM OLD.action_kind
    OR NEW.primary_effective_date
      IS DISTINCT FROM OLD.primary_effective_date
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'action revision fields cannot be rewritten after creation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.state <> 'posted' OR NEW.finalized_at IS NULL THEN
    RAISE EXCEPTION
      'action revision update must finalize building -> posted'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_action_revision_state_machine"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_action_revision_state_machine"()
TO app_domain;

CREATE TRIGGER "action_revision_state_machine"
BEFORE INSERT OR UPDATE OR DELETE
ON "finance"."action_revision"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_action_revision_state_machine"();

/*
 * ---------------------------------------------------------------------------
 * Posting immutability
 * ---------------------------------------------------------------------------
 *
 * app_domain already lacks UPDATE/DELETE privileges on postings. This trigger
 * makes the invariant explicit even for privileged ordinary database paths.
 * Whole-workspace lifecycle purge is the deliberate exception.
 */

CREATE FUNCTION "finance"."enforce_posting_immutability"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user = 'lifecycle_operator' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'financial postings are immutable'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_posting_immutability"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_posting_immutability"()
TO app_domain;

CREATE TRIGGER "posting_immutability"
BEFORE UPDATE OR DELETE
ON "finance"."posting"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_posting_immutability"();

/*
 * ---------------------------------------------------------------------------
 * Ledger-account semantic identity
 * ---------------------------------------------------------------------------
 *
 * Ledger kind and currency may be corrected while the bucket is still unused.
 * Once bound to a financial account or posting, those fields define historical
 * accounting meaning and cannot be rewritten.
 */

CREATE FUNCTION "finance"."enforce_referenced_ledger_identity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."financial_account" AS a
    WHERE
      a."workspace_id" = OLD.workspace_id
      AND a."ledger_account_id" = OLD.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."posting" AS p
    WHERE
      p."workspace_id" = OLD.workspace_id
      AND p."ledger_account_id" = OLD.id
  )
  THEN
    RAISE EXCEPTION
      'referenced ledger account kind/currency is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_referenced_ledger_identity"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_referenced_ledger_identity"()
TO app_domain;

CREATE TRIGGER "ledger_account_reference_identity"
BEFORE UPDATE OF "kind", "currency"
ON "finance"."ledger_account"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_referenced_ledger_identity"();

/*
 * ---------------------------------------------------------------------------
 * Financial-account ledger binding
 * ---------------------------------------------------------------------------
 *
 * Every user-facing financial account maps to one cash_asset ledger bucket in
 * the same currency. Opening-action semantics are validated separately.
 */

CREATE FUNCTION "finance"."validate_financial_account_ledger"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_kind text;
  v_currency text;
BEGIN
  SELECT
    l."kind",
    l."currency"
  INTO
    v_kind,
    v_currency
  FROM "finance"."ledger_account" AS l
  WHERE
    l."workspace_id" = NEW.workspace_id
    AND l."id" = NEW.ledger_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial account ledger account does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_kind <> 'cash_asset' THEN
    RAISE EXCEPTION
      'financial account must map to a cash_asset ledger account'
      USING ERRCODE = '23514';
  END IF;

  IF v_currency <> NEW.currency THEN
    RAISE EXCEPTION
      'financial account currency must match its ledger account'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_financial_account_ledger"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_financial_account_ledger"()
TO app_domain;

CREATE TRIGGER "financial_account_ledger_validation"
BEFORE INSERT OR UPDATE OF "ledger_account_id", "currency"
ON "finance"."financial_account"
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_financial_account_ledger"();

/*
 * ---------------------------------------------------------------------------
 * FIN-01 + FIN-02
 * Deferred journal commit validation
 * ---------------------------------------------------------------------------
 *
 * The trigger runs against the final transaction state. A journal may be
 * assembled while building, but at commit:
 *
 * - the journal must be posted
 * - it must contain at least two nonzero lines
 * - its signed amount sum must equal exactly zero
 *
 * Currency/scope consistency is already enforced by composite FKs.
 */

CREATE FUNCTION "finance"."validate_committed_journal"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_journal_id uuid;
  v_state text;
  v_finalized_at timestamptz;
  v_posting_count bigint;
  v_sum numeric;
BEGIN
  IF TG_TABLE_NAME = 'journal' THEN
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_journal_id := OLD.id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_journal_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_journal_id := OLD.journal_id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_journal_id := NEW.journal_id;
    END IF;
  END IF;

  SELECT
    j."state",
    j."finalized_at"
  INTO
    v_state,
    v_finalized_at
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = v_workspace_id
    AND j."id" = v_journal_id;

  /*
   * During lifecycle purge, both the posting and its parent journal may be
   * gone by the time deferred checks execute.
   */
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_state <> 'posted' OR v_finalized_at IS NULL THEN
    RAISE EXCEPTION
      'committed journal must be finalized'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    COALESCE(sum(p."amount_minor"::numeric), 0)
  INTO
    v_posting_count,
    v_sum
  FROM "finance"."posting" AS p
  WHERE
    p."workspace_id" = v_workspace_id
    AND p."journal_id" = v_journal_id;

  IF v_posting_count < 2 THEN
    RAISE EXCEPTION
      'posted journal must contain at least two postings'
      USING ERRCODE = '23514';
  END IF;

  IF v_sum <> 0 THEN
    RAISE EXCEPTION
      'posted journal postings must sum to zero'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_committed_journal"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_committed_journal"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "journal_commit_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "finance"."journal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_committed_journal"();

CREATE CONSTRAINT TRIGGER "posting_commit_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "finance"."posting"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_committed_journal"();

/*
 * ---------------------------------------------------------------------------
 * FIN-04
 * Revision chain validation
 * ---------------------------------------------------------------------------
 *
 * All persisted financial revisions are complete posted evidence. Persistent
 * drafts are not stored in these tables.
 *
 * create:
 *   revision 1, no previous revision
 *
 * replace:
 *   immediately previous posted revision
 *   >= 1 reversal journal
 *   >= 1 economic replacement journal
 *
 * void:
 *   immediately previous posted revision
 *   >= 1 reversal journal
 *   no new economic journal
 */

CREATE FUNCTION "finance"."validate_committed_action_revision"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;
  v_previous_revision_no integer;
  v_previous_state text;
  v_economic_count bigint;
  v_reversal_count bigint;
BEGIN
  SELECT r.*
  INTO v_revision
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = COALESCE(
      NEW.workspace_id,
      OLD.workspace_id
    )
    AND r."id" = COALESCE(
      NEW.id,
      OLD.id
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_revision.state <> 'posted'
    OR v_revision.finalized_at IS NULL
  THEN
    RAISE EXCEPTION
      'committed action revision must be finalized'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.change_kind = 'create' THEN
    IF v_revision.revision_no <> 1
      OR v_revision.previous_revision_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'create revision must be revision 1 with no predecessor'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT
      p."revision_no",
      p."state"
    INTO
      v_previous_revision_no,
      v_previous_state
    FROM "finance"."action_revision" AS p
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_id" = v_revision.action_id
      AND p."id" = v_revision.previous_revision_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'replacement/void revision predecessor does not exist'
        USING ERRCODE = '23514';
    END IF;

    IF v_previous_revision_no <> v_revision.revision_no - 1 THEN
      RAISE EXCEPTION
        'revision must reference the immediately preceding revision'
        USING ERRCODE = '23514';
    END IF;

    IF v_previous_state <> 'posted' THEN
      RAISE EXCEPTION
        'revision predecessor must already be finalized'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE j."role" = 'economic'),
    count(*) FILTER (WHERE j."role" = 'reversal')
  INTO
    v_economic_count,
    v_reversal_count
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = v_revision.workspace_id
    AND j."action_revision_id" = v_revision.id
    AND j."state" = 'posted';

  IF v_revision.change_kind = 'create' THEN
    IF v_economic_count < 1 OR v_reversal_count <> 0 THEN
      RAISE EXCEPTION
        'create revision requires economic journals and no reversals'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_revision.change_kind = 'replace' THEN
    IF v_economic_count < 1 OR v_reversal_count < 1 THEN
      RAISE EXCEPTION
        'replacement revision requires reversal and economic journals'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_revision.change_kind = 'void' THEN
    IF v_economic_count <> 0 OR v_reversal_count < 1 THEN
      RAISE EXCEPTION
        'void revision requires reversals and no new economic journal'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_committed_action_revision"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_committed_action_revision"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "action_revision_commit_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_committed_action_revision"();

/*
 * ---------------------------------------------------------------------------
 * FIN-04
 * Current-revision pointer validation
 * ---------------------------------------------------------------------------
 *
 * financial_action.current_revision_id must equal the highest finalized
 * revision for that logical action at transaction end.
 */

CREATE FUNCTION "finance"."validate_financial_action_current_revision"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_action_id uuid;
  v_current_revision_id uuid;
  v_highest_revision_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'financial_action' THEN
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_action_id := OLD.id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_action_id := NEW.id;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_workspace_id := OLD.workspace_id;
      v_action_id := OLD.action_id;
    ELSE
      v_workspace_id := NEW.workspace_id;
      v_action_id := NEW.action_id;
    END IF;
  END IF;

  SELECT a."current_revision_id"
  INTO v_current_revision_id
  FROM "finance"."financial_action" AS a
  WHERE
    a."workspace_id" = v_workspace_id
    AND a."id" = v_action_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT r."id"
  INTO v_highest_revision_id
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = v_workspace_id
    AND r."action_id" = v_action_id
    AND r."state" = 'posted'
  ORDER BY
    r."revision_no" DESC
  LIMIT 1;

  IF v_highest_revision_id IS NULL THEN
    RAISE EXCEPTION
      'financial action must have a finalized revision'
      USING ERRCODE = '23514';
  END IF;

  IF v_current_revision_id IS DISTINCT FROM v_highest_revision_id THEN
    RAISE EXCEPTION
      'financial action current revision must be the highest finalized revision'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_financial_action_current_revision"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_financial_action_current_revision"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "financial_action_current_revision_integrity"
AFTER INSERT OR UPDATE
ON "finance"."financial_action"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_financial_action_current_revision"();

CREATE CONSTRAINT TRIGGER "action_revision_current_pointer_integrity"
AFTER INSERT OR UPDATE OR DELETE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_financial_action_current_revision"();