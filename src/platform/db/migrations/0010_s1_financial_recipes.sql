/*
 * S1 financial recipes and semantic integrity.
 *
 * This migration completes the first finance database gate by enforcing:
 *
 * - completed, durable financial command receipts
 * - posting classification against ledger/category meaning
 * - FIN-05 exact correction reversals
 * - FIN-06 purchase/category/funding semantics
 * - FIN-07 receipt destination and actual received amount
 * - FIN-08 transfer principal classification
 * - FIN-09 explicit fee amount/date/bearer/treatment
 * - FIN-13 opening cash as baseline equity rather than income
 * - opening-cutoff protection for ordinary cash activity
 * - one distinct cash ledger bucket per financial account history
 *
 * The application service still owns command orchestration, required audit
 * creation, workspace financial_revision advancement and user-facing preview
 * semantics. Database rules below reject a structurally or financially
 * inconsistent committed result even when SQL is issued directly.
 */

/*
 * ---------------------------------------------------------------------------
 * Command-receipt lifecycle
 * ---------------------------------------------------------------------------
 *
 * A completed receipt is immutable through the ordinary domain role.
 * A claimed receipt may be filled in and transitioned once to completed.
 */

CREATE FUNCTION "core"."enforce_command_receipt_state_machine"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.state = 'completed' THEN
    RAISE EXCEPTION
      'completed command receipts are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.state = 'claimed'
    AND NEW.state NOT IN ('claimed', 'completed')
  THEN
    RAISE EXCEPTION
      'invalid command receipt state transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."enforce_command_receipt_state_machine"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."enforce_command_receipt_state_machine"()
TO app_domain;

CREATE TRIGGER "command_receipt_state_machine"
BEFORE UPDATE
ON "core"."command_receipt"
FOR EACH ROW
EXECUTE FUNCTION "core"."enforce_command_receipt_state_machine"();

/*
 * Financial receipts are permanent idempotency/evidence records until
 * workspace purge. At transaction end, every receipt referenced by a
 * financial action or revision must therefore be completed and retain_until
 * must remain NULL.
 */

CREATE FUNCTION "core"."validate_financial_command_receipt"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_workspace_id uuid;
  v_receipt_id uuid;
  v_state text;
  v_retain_until timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'command_receipt' THEN
    v_workspace_id := NEW.workspace_id;
    v_receipt_id := NEW.id;

    IF NOT EXISTS (
      SELECT 1
      FROM "finance"."financial_action" AS a
      WHERE
        a."workspace_id" = v_workspace_id
        AND a."original_command_receipt_id" = v_receipt_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "finance"."action_revision" AS r
      WHERE
        r."workspace_id" = v_workspace_id
        AND r."command_receipt_id" = v_receipt_id
    )
    THEN
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'financial_action' THEN
    v_workspace_id := NEW.workspace_id;
    v_receipt_id := NEW.original_command_receipt_id;
  ELSIF TG_TABLE_NAME = 'action_revision' THEN
    v_workspace_id := NEW.workspace_id;
    v_receipt_id := NEW.command_receipt_id;
  ELSE
    RETURN NULL;
  END IF;

  SELECT
    r."state",
    r."retain_until"
  INTO
    v_state,
    v_retain_until
  FROM "core"."command_receipt" AS r
  WHERE
    r."workspace_id" = v_workspace_id
    AND r."id" = v_receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial command receipt does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_state <> 'completed' THEN
    RAISE EXCEPTION
      'financial command receipt must be completed before commit'
      USING ERRCODE = '23514';
  END IF;

  IF v_retain_until IS NOT NULL THEN
    RAISE EXCEPTION
      'financial command receipts must be retained until workspace purge'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "core"."validate_financial_command_receipt"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "core"."validate_financial_command_receipt"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "command_receipt_financial_integrity"
AFTER INSERT OR UPDATE
ON "core"."command_receipt"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "core"."validate_financial_command_receipt"();

CREATE CONSTRAINT TRIGGER "financial_action_command_receipt_integrity"
AFTER INSERT OR UPDATE
ON "finance"."financial_action"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "core"."validate_financial_command_receipt"();

CREATE CONSTRAINT TRIGGER "action_revision_command_receipt_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "core"."validate_financial_command_receipt"();

/*
 * ---------------------------------------------------------------------------
 * Posting classification
 * ---------------------------------------------------------------------------
 *
 * Cross-table classification cannot be expressed with ordinary CHECK
 * constraints because the meaning of a posting depends on its ledger bucket,
 * journal role and optional category.
 */

CREATE FUNCTION "finance"."validate_posting_classification"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_ledger_kind text;
  v_journal_role text;
  v_category_kind text;
BEGIN
  SELECT
    l."kind",
    j."role"
  INTO
    v_ledger_kind,
    v_journal_role
  FROM "finance"."ledger_account" AS l
  JOIN "finance"."journal" AS j
    ON j."workspace_id" = NEW.workspace_id
    AND j."action_revision_id" = NEW.action_revision_id
    AND j."id" = NEW.journal_id
  WHERE
    l."workspace_id" = NEW.workspace_id
    AND l."id" = NEW.ledger_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'posting ledger or journal does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_journal_role = 'economic'
    AND NEW.reverses_posting_id IS NOT NULL
  THEN
    RAISE EXCEPTION
      'economic postings cannot identify a reversed posting'
      USING ERRCODE = '23514';
  END IF;

  IF v_journal_role = 'reversal'
    AND NEW.reverses_posting_id IS NULL
  THEN
    RAISE EXCEPTION
      'reversal postings must identify the posting they reverse'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT c."kind"
    INTO v_category_kind
    FROM "core"."category" AS c
    WHERE
      c."workspace_id" = NEW.workspace_id
      AND c."id" = NEW.category_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'posting category does not exist in the active scope'
        USING ERRCODE = '23503';
    END IF;

    IF v_ledger_kind NOT IN ('expense', 'income') THEN
      RAISE EXCEPTION
        'only income/expense ledger postings may carry a category'
        USING ERRCODE = '23514';
    END IF;

    IF v_category_kind <> v_ledger_kind THEN
      RAISE EXCEPTION
        'posting category kind must match the ledger kind'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  CASE v_ledger_kind
    WHEN 'cash_asset' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind = 'none'
        OR NEW.cash_flow_direction = 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'cash_asset posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'expense' THEN
      IF NEW.expense_class = 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
      THEN
        RAISE EXCEPTION
          'expense posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

      IF v_journal_role = 'economic' THEN
        IF NEW.expense_class = 'gross'
          AND NEW.amount_minor <= 0
        THEN
          RAISE EXCEPTION
            'gross expense postings must be positive'
            USING ERRCODE = '23514';
        END IF;

        IF NEW.expense_class IN (
          'refund_offset',
          'rebate_offset',
          'waiver_offset'
        )
        AND NEW.amount_minor >= 0
        THEN
          RAISE EXCEPTION
            'expense offset postings must be negative'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'income' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class = 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
      THEN
        RAISE EXCEPTION
          'income posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

      IF v_journal_role = 'economic'
        AND NEW.amount_minor >= 0
      THEN
        RAISE EXCEPTION
          'normal income postings must be credit-negative'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'opening_equity' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'opening_equity posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'adjustment_equity' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'adjustment_equity posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    ELSE
      RAISE EXCEPTION
        'ledger kind is not supported by the S1 posting classifier'
        USING ERRCODE = '23514';
  END CASE;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_posting_classification"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_posting_classification"()
TO app_domain;

CREATE TRIGGER "posting_classification_validation"
BEFORE INSERT
ON "finance"."posting"
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_posting_classification"();

/*
 * ---------------------------------------------------------------------------
 * FIN-09: fee components
 * ---------------------------------------------------------------------------
 *
 * S1 fees are recognized as expense postings paired with real cash outflow.
 * Later debt/card releases may add non-cash capitalized treatments through a
 * reviewed migration.
 */

CREATE FUNCTION "finance"."validate_s1_fee_components"(
  p_workspace_id uuid,
  p_action_revision_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS f
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = f."workspace_id"
      AND l."id" = f."bearing_ledger_account_id"
    WHERE
      f."workspace_id" = p_workspace_id
      AND f."action_revision_id" = p_action_revision_id
      AND l."kind" <> 'cash_asset'
  ) THEN
    RAISE EXCEPTION
      'S1 fee bearer must be a cash_asset ledger account'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS f
    WHERE
      f."workspace_id" = p_workspace_id
      AND f."action_revision_id" = p_action_revision_id
      AND f."treatment" = 'capitalized'
  ) THEN
    RAISE EXCEPTION
      'capitalized fees are not supported by the S1 cash-only recipes'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Each fee points at the exact expense posting that recognizes it.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS f
    JOIN "finance"."posting" AS p
      ON p."workspace_id" = f."workspace_id"
      AND p."action_revision_id" = f."action_revision_id"
      AND p."id" = f."expense_posting_id"
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      f."workspace_id" = p_workspace_id
      AND f."action_revision_id" = p_action_revision_id
      AND (
        j."role" <> 'economic'
        OR j."effective_date" IS DISTINCT FROM f."effective_date"
        OR l."kind" <> 'expense'
        OR p."amount_minor" <> f."amount_minor"
        OR p."expense_class" <> 'gross'
        OR p."income_class" <> 'none'
        OR p."cash_flow_kind" <> 'none'
        OR p."cash_flow_direction" <> 'none'
      )
  ) THEN
    RAISE EXCEPTION
      'fee expense posting does not match its fee component'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Fee cash lines are always real outward cash movements in S1.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    WHERE
      p."workspace_id" = p_workspace_id
      AND p."action_revision_id" = p_action_revision_id
      AND j."role" = 'economic'
      AND p."cash_flow_kind" = 'fee'
      AND p."cash_flow_direction" = 'out'
      AND p."amount_minor" >= 0
  ) THEN
    RAISE EXCEPTION
      'fee cash outflow postings must be negative'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Match fee components to cash effects by bearer and actual fee date.
   * This also rejects stray fee/out cash postings with no fee component.
   */
  IF EXISTS (
    WITH expected AS (
      SELECT
        f."bearing_ledger_account_id" AS ledger_account_id,
        f."effective_date",
        sum(f."amount_minor"::numeric) AS total_minor
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = p_workspace_id
        AND f."action_revision_id" = p_action_revision_id
      GROUP BY
        f."bearing_ledger_account_id",
        f."effective_date"
    ),
    actual AS (
      SELECT
        p."ledger_account_id",
        j."effective_date",
        sum(-(p."amount_minor"::numeric)) AS total_minor
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      WHERE
        p."workspace_id" = p_workspace_id
        AND p."action_revision_id" = p_action_revision_id
        AND j."role" = 'economic'
        AND p."cash_flow_kind" = 'fee'
        AND p."cash_flow_direction" = 'out'
      GROUP BY
        p."ledger_account_id",
        j."effective_date"
    )
    SELECT 1
    FROM expected AS e
    FULL JOIN actual AS a
      ON a.ledger_account_id = e.ledger_account_id
      AND a.effective_date = e.effective_date
    WHERE e.total_minor IS DISTINCT FROM a.total_minor
  ) THEN
    RAISE EXCEPTION
      'fee cash effects must equal fee components by bearer and date'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_s1_fee_components"(uuid, uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_s1_fee_components"(uuid, uuid)
TO app_domain;

/*
 * ---------------------------------------------------------------------------
 * FIN-05: exact reversal matching
 * ---------------------------------------------------------------------------
 *
 * A correction reverses only the immediately preceding revision's economic
 * journals. Every prior economic posting must be reversed exactly once.
 * Reversal lines inherit ledger/classification and use the opposite sign.
 */

CREATE FUNCTION "finance"."validate_revision_reversal_set"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;
  v_previous_economic_count bigint;
  v_reversal_count bigint;
BEGIN
  SELECT r.*
  INTO v_revision
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = NEW.workspace_id
    AND r."id" = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_revision.state <> 'posted' THEN
    RAISE EXCEPTION
      'reversal validation requires a finalized revision'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.change_kind = 'create' THEN
    RETURN NULL;
  END IF;

  /*
   * Reversal journals may target only economic journals from the immediately
   * preceding revision of this same logical action.
   *
   * Keeping the original journal effective date ensures a backdated
   * correction removes the original effect from the same reporting period.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS rj
    LEFT JOIN "finance"."journal" AS pj
      ON pj."workspace_id" = rj."workspace_id"
      AND pj."id" = rj."reverses_journal_id"
    WHERE
      rj."workspace_id" = v_revision.workspace_id
      AND rj."action_revision_id" = v_revision.id
      AND rj."role" = 'reversal'
      AND (
        pj."id" IS NULL
        OR pj."role" <> 'economic'
        OR pj."state" <> 'posted'
        OR pj."action_id" <> v_revision.action_id
        OR pj."action_revision_id"
          IS DISTINCT FROM v_revision.previous_revision_id
        OR rj."currency" IS DISTINCT FROM pj."currency"
        OR rj."effective_date" IS DISTINCT FROM pj."effective_date"
      )
  ) THEN
    RAISE EXCEPTION
      'reversal journal must reverse a preceding economic journal exactly'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_previous_economic_count
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = v_revision.workspace_id
    AND j."action_revision_id" = v_revision.previous_revision_id
    AND j."role" = 'economic'
    AND j."state" = 'posted';

  SELECT count(*)
  INTO v_reversal_count
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = v_revision.workspace_id
    AND j."action_revision_id" = v_revision.id
    AND j."role" = 'reversal'
    AND j."state" = 'posted';

  IF v_previous_economic_count <> v_reversal_count THEN
    RAISE EXCEPTION
      'correction must reverse every preceding economic journal once'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Every reversal posting must identify a posting from its journal's exact
   * reversal parent and inherit all report-significant classifications.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS rj
    JOIN "finance"."posting" AS rp
      ON rp."workspace_id" = rj."workspace_id"
      AND rp."action_revision_id" = rj."action_revision_id"
      AND rp."journal_id" = rj."id"
    LEFT JOIN "finance"."posting" AS op
      ON op."workspace_id" = rp."workspace_id"
      AND op."id" = rp."reverses_posting_id"
    WHERE
      rj."workspace_id" = v_revision.workspace_id
      AND rj."action_revision_id" = v_revision.id
      AND rj."role" = 'reversal'
      AND (
        op."id" IS NULL
        OR op."journal_id" IS DISTINCT FROM rj."reverses_journal_id"
        OR op."action_id" IS DISTINCT FROM v_revision.action_id
        OR op."action_revision_id"
          IS DISTINCT FROM v_revision.previous_revision_id
        OR rp."action_id" IS DISTINCT FROM v_revision.action_id
        OR rp."ledger_account_id"
          IS DISTINCT FROM op."ledger_account_id"
        OR rp."currency" IS DISTINCT FROM op."currency"
        OR rp."amount_minor" <> -op."amount_minor"
        OR rp."category_id" IS DISTINCT FROM op."category_id"
        OR rp."expense_class" IS DISTINCT FROM op."expense_class"
        OR rp."income_class" IS DISTINCT FROM op."income_class"
        OR rp."cash_flow_kind" IS DISTINCT FROM op."cash_flow_kind"
        OR rp."cash_flow_direction"
          IS DISTINCT FROM op."cash_flow_direction"
        OR rp."liability_component"
          IS DISTINCT FROM op."liability_component"
      )
  ) THEN
    RAISE EXCEPTION
      'reversal posting must exactly negate and classify its original'
      USING ERRCODE = '23514';
  END IF;

  /*
   * The unique reversal indexes provide "at most once". This query supplies
   * the corresponding "at least once" for every previous economic posting.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS pj
    JOIN "finance"."posting" AS op
      ON op."workspace_id" = pj."workspace_id"
      AND op."action_revision_id" = pj."action_revision_id"
      AND op."journal_id" = pj."id"
    LEFT JOIN "finance"."journal" AS rj
      ON rj."workspace_id" = pj."workspace_id"
      AND rj."action_revision_id" = v_revision.id
      AND rj."role" = 'reversal'
      AND rj."reverses_journal_id" = pj."id"
    LEFT JOIN "finance"."posting" AS rp
      ON rp."workspace_id" = op."workspace_id"
      AND rp."journal_id" = rj."id"
      AND rp."reverses_posting_id" = op."id"
    WHERE
      pj."workspace_id" = v_revision.workspace_id
      AND pj."action_revision_id" = v_revision.previous_revision_id
      AND pj."role" = 'economic'
      AND rp."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'every preceding economic posting must be reversed exactly once'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_revision_reversal_set"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_revision_reversal_set"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "action_revision_reversal_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_revision_reversal_set"();

/*
 * ---------------------------------------------------------------------------
 * Financial-account historical binding
 * ---------------------------------------------------------------------------
 *
 * A distinct cash ledger is the durable accounting identity of a financial
 * account. Once history exists, direct reassignment would detach the account
 * from its own postings and is therefore prohibited.
 *
 * Opening-cutoff changes after ordinary activity likewise require a future
 * explicit history/baseline workflow rather than an ordinary account edit.
 */

CREATE FUNCTION "finance"."enforce_financial_account_history_binding"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.ledger_account_id IS DISTINCT FROM OLD.ledger_account_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
  THEN
    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      WHERE
        p."workspace_id" = OLD.workspace_id
        AND p."ledger_account_id" = OLD.ledger_account_id
    ) THEN
      RAISE EXCEPTION
        'financial account ledger/currency cannot change after posting history exists'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.opening_action_id IS NOT NULL
    AND NEW.opening_action_id IS NOT NULL
    AND NEW.opening_action_id IS DISTINCT FROM OLD.opening_action_id
  THEN
    RAISE EXCEPTION
      'opening baseline corrections must retain the same logical opening action'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.opening_cutoff_date IS DISTINCT FROM OLD.opening_cutoff_date THEN
    IF EXISTS (
      SELECT 1
      FROM "finance"."journal" AS j
      JOIN "finance"."posting" AS p
        ON p."workspace_id" = j."workspace_id"
        AND p."action_revision_id" = j."action_revision_id"
        AND p."journal_id" = j."id"
      WHERE
        j."workspace_id" = OLD.workspace_id
        AND j."role" = 'economic'
        AND j."state" = 'posted'
        AND p."ledger_account_id" = OLD.ledger_account_id
        AND j."action_id" IS DISTINCT FROM OLD.opening_action_id
        AND j."action_id" IS DISTINCT FROM NEW.opening_action_id
    ) THEN
      RAISE EXCEPTION
        'opening cutoff cannot change after ordinary account activity without the explicit history/baseline workflow'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."enforce_financial_account_history_binding"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."enforce_financial_account_history_binding"()
TO app_domain;

CREATE TRIGGER "financial_account_history_binding"
BEFORE UPDATE OF
  "ledger_account_id",
  "currency",
  "opening_action_id",
  "opening_cutoff_date"
ON "finance"."financial_account"
FOR EACH ROW
EXECUTE FUNCTION "finance"."enforce_financial_account_history_binding"();

/*
 * ---------------------------------------------------------------------------
 * FIN-13: opening cash/account mapping
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."assert_opening_account_mapping"(
  p_workspace_id uuid,
  p_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_account "finance"."financial_account"%ROWTYPE;
  v_revision "finance"."action_revision"%ROWTYPE;
  v_economic_journal_count bigint;
  v_cash_count bigint;
  v_equity_count bigint;
BEGIN
  SELECT a.*
  INTO v_account
  FROM "finance"."financial_account" AS a
  WHERE
    a."workspace_id" = p_workspace_id
    AND a."id" = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'financial account does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_account.opening_action_id IS NULL THEN
    RETURN;
  END IF;

  IF (
    SELECT count(*)
    FROM "finance"."financial_account" AS a
    WHERE
      a."workspace_id" = v_account.workspace_id
      AND a."opening_action_id" = v_account.opening_action_id
  ) <> 1 THEN
    RAISE EXCEPTION
      'one opening action may belong to only one financial account'
      USING ERRCODE = '23514';
  END IF;

  SELECT r.*
  INTO v_revision
  FROM "finance"."financial_action" AS a
  JOIN "finance"."action_revision" AS r
    ON r."workspace_id" = a."workspace_id"
    AND r."action_id" = a."id"
    AND r."id" = a."current_revision_id"
  WHERE
    a."workspace_id" = v_account.workspace_id
    AND a."id" = v_account.opening_action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'opening action current revision does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_revision.state <> 'posted'
    OR v_revision.action_kind <> 'opening_cash'
    OR v_revision.change_kind = 'void'
  THEN
    RAISE EXCEPTION
      'financial account opening action must resolve to active opening_cash evidence'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.primary_effective_date
      IS DISTINCT FROM v_account.opening_cutoff_date
  THEN
    RAISE EXCEPTION
      'opening action effective date must equal the account opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_economic_journal_count
  FROM "finance"."journal" AS j
  WHERE
    j."workspace_id" = v_revision.workspace_id
    AND j."action_revision_id" = v_revision.id
    AND j."role" = 'economic'
    AND j."state" = 'posted';

  IF v_economic_journal_count <> 1 THEN
    RAISE EXCEPTION
      'opening_cash requires exactly one economic journal'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS j
    WHERE
      j."workspace_id" = v_revision.workspace_id
      AND j."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND j."effective_date"
        IS DISTINCT FROM v_account.opening_cutoff_date
  ) THEN
    RAISE EXCEPTION
      'opening journal must use the account opening cutoff date'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_cash_count
  FROM "finance"."posting" AS p
  JOIN "finance"."journal" AS j
    ON j."workspace_id" = p."workspace_id"
    AND j."action_revision_id" = p."action_revision_id"
    AND j."id" = p."journal_id"
  JOIN "finance"."ledger_account" AS l
    ON l."workspace_id" = p."workspace_id"
    AND l."id" = p."ledger_account_id"
  WHERE
    p."workspace_id" = v_revision.workspace_id
    AND p."action_revision_id" = v_revision.id
    AND j."role" = 'economic'
    AND l."kind" = 'cash_asset';

  IF v_cash_count <> 1 THEN
    RAISE EXCEPTION
      'opening_cash requires exactly one cash posting'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND l."kind" = 'cash_asset'
      AND (
        p."ledger_account_id"
          IS DISTINCT FROM v_account.ledger_account_id
        OR p."amount_minor" <= 0
        OR p."cash_flow_kind" <> 'opening'
        OR p."cash_flow_direction" <> 'baseline'
      )
  ) THEN
    RAISE EXCEPTION
      'opening cash posting must increase the account with opening/baseline classification'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_equity_count
  FROM "finance"."posting" AS p
  JOIN "finance"."journal" AS j
    ON j."workspace_id" = p."workspace_id"
    AND j."action_revision_id" = p."action_revision_id"
    AND j."id" = p."journal_id"
  JOIN "finance"."ledger_account" AS l
    ON l."workspace_id" = p."workspace_id"
    AND l."id" = p."ledger_account_id"
  WHERE
    p."workspace_id" = v_revision.workspace_id
    AND p."action_revision_id" = v_revision.id
    AND j."role" = 'economic'
    AND l."kind" = 'opening_equity';

  IF v_equity_count < 1 THEN
    RAISE EXCEPTION
      'opening_cash requires opening_equity'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND (
        l."kind" NOT IN ('cash_asset', 'opening_equity')
        OR (
          l."kind" = 'opening_equity'
          AND p."amount_minor" >= 0
        )
      )
  ) THEN
    RAISE EXCEPTION
      'opening_cash may contain only positive cash and credit-negative opening equity'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."receipt_detail" AS d
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."purchase_detail" AS d
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."transfer_detail" AS d
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS f
    WHERE
      f."workspace_id" = v_revision.workspace_id
      AND f."action_revision_id" = v_revision.id
  )
  THEN
    RAISE EXCEPTION
      'opening_cash cannot carry receipt/purchase/transfer/fee detail'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."assert_opening_account_mapping"(uuid, uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."assert_opening_account_mapping"(uuid, uuid)
TO app_domain;

CREATE FUNCTION "finance"."validate_financial_account_opening_mapping"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM "finance"."assert_opening_account_mapping"(
    NEW.workspace_id,
    NEW.id
  );

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_financial_account_opening_mapping"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_financial_account_opening_mapping"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "financial_account_opening_integrity"
AFTER INSERT OR UPDATE
ON "finance"."financial_account"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_financial_account_opening_mapping"();

/*
 * ---------------------------------------------------------------------------
 * S1 supported action recipes
 * ---------------------------------------------------------------------------
 *
 * End users never author arbitrary journals. Every finalized S1 revision must
 * match one of the released action recipes.
 */

CREATE FUNCTION "finance"."validate_s1_revision_recipe"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;

  v_receipt_count bigint;
  v_purchase_count bigint;
  v_transfer_count bigint;
  v_fee_count bigint;
  v_opening_account_count bigint;
  v_count bigint;

  v_amount numeric;
  v_amount_2 numeric;

  v_receiving_account_id uuid;
  v_receiving_ledger_id uuid;
  v_actual_received_minor bigint;

  v_funding_ledger_id uuid;
  v_purchase_minor bigint;
  v_funding_kind text;

  v_source_account_id uuid;
  v_destination_account_id uuid;
  v_source_ledger_id uuid;
  v_destination_ledger_id uuid;
  v_source_principal_minor bigint;
  v_destination_principal_minor bigint;
  v_withheld_fee_minor bigint;
BEGIN
  SELECT r.*
  INTO v_revision
  FROM "finance"."action_revision" AS r
  WHERE
    r."workspace_id" = NEW.workspace_id
    AND r."id" = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_revision.state <> 'posted' THEN
    RAISE EXCEPTION
      'S1 recipe validation requires a finalized action revision'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_receipt_count
  FROM "finance"."receipt_detail" AS d
  WHERE
    d."workspace_id" = v_revision.workspace_id
    AND d."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_purchase_count
  FROM "finance"."purchase_detail" AS d
  WHERE
    d."workspace_id" = v_revision.workspace_id
    AND d."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_transfer_count
  FROM "finance"."transfer_detail" AS d
  WHERE
    d."workspace_id" = v_revision.workspace_id
    AND d."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_fee_count
  FROM "finance"."fee_component" AS f
  WHERE
    f."workspace_id" = v_revision.workspace_id
    AND f."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_opening_account_count
  FROM "finance"."financial_account" AS a
  WHERE
    a."workspace_id" = v_revision.workspace_id
    AND a."opening_action_id" = v_revision.action_id;

  /*
   * A void contains only reversal evidence. Its previous semantic detail stays
   * attached to the immutable previous revision.
   */
  IF v_revision.change_kind = 'void' THEN
    IF v_receipt_count <> 0
      OR v_purchase_count <> 0
      OR v_transfer_count <> 0
      OR v_fee_count <> 0
    THEN
      RAISE EXCEPTION
        'void revisions cannot add new typed economic detail'
        USING ERRCODE = '23514';
    END IF;

    IF v_opening_account_count <> 0 THEN
      RAISE EXCEPTION
        'a voided opening action must be detached from the financial account'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  /*
   * Every S1 economic cash bucket must map to an actual financial account.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    LEFT JOIN "finance"."financial_account" AS a
      ON a."workspace_id" = p."workspace_id"
      AND a."ledger_account_id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND l."kind" = 'cash_asset'
      AND a."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'S1 cash postings must belong to a financial account'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Ordinary cash activity starts after the account opening cutoff.
   * opening_cash itself is the baseline exception.
   */
  IF v_revision.action_kind <> 'opening_cash'
    AND EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."financial_account" AS a
        ON a."workspace_id" = p."workspace_id"
        AND a."ledger_account_id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND j."effective_date" <= a."opening_cutoff_date"
    )
  THEN
    RAISE EXCEPTION
      'ordinary cash activity must occur after the account opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Archived accounts remain available for historical correction but cannot
   * receive a new logical action without restoration.
   */
  IF v_revision.change_kind = 'create'
    AND v_revision.action_kind <> 'opening_cash'
    AND EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."financial_account" AS a
        ON a."workspace_id" = p."workspace_id"
        AND a."ledger_account_id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND a."archived_at" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION
      'new financial activity requires an active financial account'
      USING ERRCODE = '23514';
  END IF;

  PERFORM "finance"."validate_s1_fee_components"(
    v_revision.workspace_id,
    v_revision.id
  );

  /*
   * -------------------------------------------------------------------------
   * opening_cash
   * -------------------------------------------------------------------------
   */
  IF v_revision.action_kind = 'opening_cash' THEN
    IF v_opening_account_count <> 1 THEN
      RAISE EXCEPTION
        'opening_cash must belong to exactly one financial account'
        USING ERRCODE = '23514';
    END IF;

    SELECT a."id"
    INTO v_receiving_account_id
    FROM "finance"."financial_account" AS a
    WHERE
      a."workspace_id" = v_revision.workspace_id
      AND a."opening_action_id" = v_revision.action_id;

    PERFORM "finance"."assert_opening_account_mapping"(
      v_revision.workspace_id,
      v_receiving_account_id
    );

    RETURN NULL;
  END IF;

  /*
   * No non-opening action may remain attached as an account opening baseline.
   */
  IF v_opening_account_count <> 0 THEN
    RAISE EXCEPTION
      'financial account opening_action_id must reference opening_cash'
      USING ERRCODE = '23514';
  END IF;

  /*
   * -------------------------------------------------------------------------
   * income
   * -------------------------------------------------------------------------
   */
  IF v_revision.action_kind = 'income' THEN
    IF v_receipt_count <> 1
      OR v_purchase_count <> 0
      OR v_transfer_count <> 0
      OR v_fee_count <> 0
    THEN
      RAISE EXCEPTION
        'income requires one receipt_detail and no purchase/transfer/fee detail in S1'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      d."receiving_account_id",
      d."actual_received_minor",
      a."ledger_account_id"
    INTO
      v_receiving_account_id,
      v_actual_received_minor,
      v_receiving_ledger_id
    FROM "finance"."receipt_detail" AS d
    JOIN "finance"."financial_account" AS a
      ON a."workspace_id" = d."workspace_id"
      AND a."id" = d."receiving_account_id"
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id;

    IF (
      SELECT count(*)
      FROM "finance"."journal" AS j
      WHERE
        j."workspace_id" = v_revision.workspace_id
        AND j."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
    ) <> 1
    THEN
      RAISE EXCEPTION
        'S1 income requires exactly one economic journal'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."journal" AS j
      WHERE
        j."workspace_id" = v_revision.workspace_id
        AND j."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND j."effective_date"
          IS DISTINCT FROM v_revision.primary_effective_date
    ) THEN
      RAISE EXCEPTION
        'income journal date must equal its primary effective date'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" NOT IN ('cash_asset', 'income')
    ) THEN
      RAISE EXCEPTION
        'income action may contain only cash_asset and income postings'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      count(*),
      COALESCE(sum(p."amount_minor"::numeric), 0)
    INTO
      v_count,
      v_amount
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND l."kind" = 'cash_asset';

    IF v_count <> 1
      OR v_amount <> v_actual_received_minor
    THEN
      RAISE EXCEPTION
        'income cash increase must equal actual_received_minor exactly'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" = 'cash_asset'
        AND (
          p."ledger_account_id"
            IS DISTINCT FROM v_receiving_ledger_id
          OR p."cash_flow_kind" <> 'income'
          OR p."cash_flow_direction" <> 'in'
          OR p."amount_minor" <> v_actual_received_minor
        )
    ) THEN
      RAISE EXCEPTION
        'income receipt must post to its owned destination account'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      count(*),
      COALESCE(sum(-(p."amount_minor"::numeric)), 0)
    INTO
      v_count,
      v_amount
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND l."kind" = 'income';

    IF v_count < 1
      OR v_amount <> v_actual_received_minor
    THEN
      RAISE EXCEPTION
        'income credit total must equal actual received cash'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  /*
   * -------------------------------------------------------------------------
   * expense
   * -------------------------------------------------------------------------
   */
  IF v_revision.action_kind = 'expense' THEN
    IF v_receipt_count <> 0
      OR v_purchase_count <> 1
      OR v_transfer_count <> 0
    THEN
      RAISE EXCEPTION
        'expense requires exactly one purchase_detail'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      d."funding_ledger_account_id",
      d."purchase_minor",
      l."kind"
    INTO
      v_funding_ledger_id,
      v_purchase_minor,
      v_funding_kind
    FROM "finance"."purchase_detail" AS d
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = d."workspace_id"
      AND l."id" = d."funding_ledger_account_id"
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id;

    IF v_funding_kind <> 'cash_asset' THEN
      RAISE EXCEPTION
        'S1 purchase funding must use a cash_asset ledger account'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "finance"."financial_account" AS a
      WHERE
        a."workspace_id" = v_revision.workspace_id
        AND a."ledger_account_id" = v_funding_ledger_id
    ) THEN
      RAISE EXCEPTION
        'purchase funding ledger must belong to a financial account'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = v_revision.workspace_id
        AND f."action_revision_id" = v_revision.id
        AND f."treatment" NOT IN ('separate', 'source_additional')
    ) THEN
      RAISE EXCEPTION
        'S1 expense fees support only separate/source_additional treatment'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = v_revision.workspace_id
        AND f."action_revision_id" = v_revision.id
        AND f."treatment" = 'source_additional'
        AND f."bearing_ledger_account_id"
          IS DISTINCT FROM v_funding_ledger_id
    ) THEN
      RAISE EXCEPTION
        'source_additional purchase fee must be borne by the purchase funding account'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" NOT IN ('cash_asset', 'expense')
    ) THEN
      RAISE EXCEPTION
        'expense action may contain only cash_asset and expense postings'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" = 'cash_asset'
        AND NOT (
          (
            p."cash_flow_kind" = 'purchase'
            AND p."cash_flow_direction" = 'out'
          )
          OR
          (
            p."cash_flow_kind" = 'fee'
            AND p."cash_flow_direction" = 'out'
          )
        )
    ) THEN
      RAISE EXCEPTION
        'expense cash postings must be purchase/out or fee/out'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      count(*),
      COALESCE(sum(p."amount_minor"::numeric), 0)
    INTO
      v_count,
      v_amount
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND p."cash_flow_kind" = 'purchase'
      AND p."cash_flow_direction" = 'out';

    IF v_count <> 1
      OR v_amount <> -v_purchase_minor
    THEN
      RAISE EXCEPTION
        'purchase funding must occur exactly once'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND p."cash_flow_kind" = 'purchase'
        AND (
          p."ledger_account_id"
            IS DISTINCT FROM v_funding_ledger_id
          OR p."amount_minor" <> -v_purchase_minor
          OR j."effective_date"
            IS DISTINCT FROM v_revision.primary_effective_date
        )
    ) THEN
      RAISE EXCEPTION
        'purchase cash deduction must use its funding account and primary date'
        USING ERRCODE = '23514';
    END IF;

    /*
     * Purchase category portions are the unlinked gross expense postings.
     * Fee expense postings are explicitly linked through fee_component and
     * therefore excluded from purchase_minor.
     */
    SELECT
      count(*),
      COALESCE(sum(p."amount_minor"::numeric), 0)
    INTO
      v_count,
      v_amount
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    JOIN "finance"."ledger_account" AS l
      ON l."workspace_id" = p."workspace_id"
      AND l."id" = p."ledger_account_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND l."kind" = 'expense'
      AND p."expense_class" = 'gross'
      AND NOT EXISTS (
        SELECT 1
        FROM "finance"."fee_component" AS f
        WHERE
          f."workspace_id" = p."workspace_id"
          AND f."action_revision_id" = p."action_revision_id"
          AND f."expense_posting_id" = p."id"
      );

    IF v_count < 1
      OR v_amount <> v_purchase_minor
    THEN
      RAISE EXCEPTION
        'gross purchase expense portions must sum exactly to purchase_minor'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" = 'expense'
        AND (
          p."expense_class" <> 'gross'
          OR (
            NOT EXISTS (
              SELECT 1
              FROM "finance"."fee_component" AS f
              WHERE
                f."workspace_id" = p."workspace_id"
                AND f."action_revision_id" = p."action_revision_id"
                AND f."expense_posting_id" = p."id"
            )
            AND j."effective_date"
              IS DISTINCT FROM v_revision.primary_effective_date
          )
        )
    ) THEN
      RAISE EXCEPTION
        'S1 expense postings must be gross purchase or explicit fee expense'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  /*
   * -------------------------------------------------------------------------
   * transfer
   * -------------------------------------------------------------------------
   */
  IF v_revision.action_kind = 'transfer' THEN
    IF v_receipt_count <> 0
      OR v_purchase_count <> 0
      OR v_transfer_count <> 1
    THEN
      RAISE EXCEPTION
        'transfer requires exactly one transfer_detail'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      d."source_account_id",
      d."destination_account_id",
      d."source_principal_minor",
      d."destination_principal_minor",
      d."withheld_fee_minor",
      source_account."ledger_account_id",
      destination_account."ledger_account_id"
    INTO
      v_source_account_id,
      v_destination_account_id,
      v_source_principal_minor,
      v_destination_principal_minor,
      v_withheld_fee_minor,
      v_source_ledger_id,
      v_destination_ledger_id
    FROM "finance"."transfer_detail" AS d
    JOIN "finance"."financial_account" AS source_account
      ON source_account."workspace_id" = d."workspace_id"
      AND source_account."id" = d."source_account_id"
    JOIN "finance"."financial_account" AS destination_account
      ON destination_account."workspace_id" = d."workspace_id"
      AND destination_account."id" = d."destination_account_id"
    WHERE
      d."workspace_id" = v_revision.workspace_id
      AND d."action_revision_id" = v_revision.id;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" NOT IN ('cash_asset', 'expense')
    ) THEN
      RAISE EXCEPTION
        'transfer may contain only cash_asset and fee expense postings'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" = 'cash_asset'
        AND NOT (
          (
            p."cash_flow_kind" = 'transfer'
            AND p."cash_flow_direction" = 'internal'
          )
          OR
          (
            p."cash_flow_kind" = 'fee'
            AND p."cash_flow_direction" = 'out'
          )
        )
    ) THEN
      RAISE EXCEPTION
        'transfer cash postings must be transfer/internal or fee/out'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*)
    INTO v_count
    FROM "finance"."posting" AS p
    JOIN "finance"."journal" AS j
      ON j."workspace_id" = p."workspace_id"
      AND j."action_revision_id" = p."action_revision_id"
      AND j."id" = p."journal_id"
    WHERE
      p."workspace_id" = v_revision.workspace_id
      AND p."action_revision_id" = v_revision.id
      AND j."role" = 'economic'
      AND p."cash_flow_kind" = 'transfer'
      AND p."cash_flow_direction" = 'internal';

    IF v_count <> 2 THEN
      RAISE EXCEPTION
        'transfer requires exactly two internal principal cash postings'
        USING ERRCODE = '23514';
    END IF;

    IF (
      SELECT count(*)
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND p."ledger_account_id" = v_source_ledger_id
        AND p."cash_flow_kind" = 'transfer'
        AND p."cash_flow_direction" = 'internal'
        AND p."amount_minor" = -v_destination_principal_minor
        AND j."effective_date" = v_revision.primary_effective_date
    ) <> 1
    THEN
      RAISE EXCEPTION
        'transfer source internal leg is invalid'
        USING ERRCODE = '23514';
    END IF;

    IF (
      SELECT count(*)
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND p."ledger_account_id" = v_destination_ledger_id
        AND p."cash_flow_kind" = 'transfer'
        AND p."cash_flow_direction" = 'internal'
        AND p."amount_minor" = v_destination_principal_minor
        AND j."effective_date" = v_revision.primary_effective_date
    ) <> 1
    THEN
      RAISE EXCEPTION
        'transfer destination internal leg is invalid'
        USING ERRCODE = '23514';
    END IF;

    /*
     * The transfer detail stores the gross source principal. For withheld
     * fees, the internal amount is the deposited destination principal and
     * the withheld portion is a separate fee/out cash leg.
     */
    IF v_source_principal_minor
        <> v_destination_principal_minor + v_withheld_fee_minor
    THEN
      RAISE EXCEPTION
        'transfer source principal must equal destination plus withheld fee'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(sum(f."amount_minor"::numeric), 0)
    INTO v_amount
    FROM "finance"."fee_component" AS f
    WHERE
      f."workspace_id" = v_revision.workspace_id
      AND f."action_revision_id" = v_revision.id
      AND f."treatment" = 'withheld';

    IF v_amount <> v_withheld_fee_minor THEN
      RAISE EXCEPTION
        'withheld transfer fee components must equal withheld_fee_minor'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = v_revision.workspace_id
        AND f."action_revision_id" = v_revision.id
        AND f."treatment" = 'withheld'
        AND (
          f."bearing_ledger_account_id"
            IS DISTINCT FROM v_source_ledger_id
          OR f."effective_date"
            IS DISTINCT FROM v_revision.primary_effective_date
        )
    ) THEN
      RAISE EXCEPTION
        'withheld transfer fees must be borne by the source account on the transfer date'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = v_revision.workspace_id
        AND f."action_revision_id" = v_revision.id
        AND f."treatment" = 'source_additional'
        AND f."bearing_ledger_account_id"
          IS DISTINCT FROM v_source_ledger_id
    ) THEN
      RAISE EXCEPTION
        'source_additional transfer fees must be borne by the source account'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" = 'expense'
        AND (
          p."expense_class" <> 'gross'
          OR NOT EXISTS (
            SELECT 1
            FROM "finance"."fee_component" AS f
            WHERE
              f."workspace_id" = p."workspace_id"
              AND f."action_revision_id" = p."action_revision_id"
              AND f."expense_posting_id" = p."id"
          )
        )
    ) THEN
      RAISE EXCEPTION
        'transfer expense postings must be explicit recognized fees'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  /*
   * -------------------------------------------------------------------------
   * standalone_fee
   * -------------------------------------------------------------------------
   */
  IF v_revision.action_kind = 'standalone_fee' THEN
    IF v_receipt_count <> 0
      OR v_purchase_count <> 0
      OR v_transfer_count <> 0
      OR v_fee_count < 1
    THEN
      RAISE EXCEPTION
        'standalone_fee requires fee_component evidence and no other typed detail'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."fee_component" AS f
      WHERE
        f."workspace_id" = v_revision.workspace_id
        AND f."action_revision_id" = v_revision.id
        AND f."treatment" <> 'separate'
    ) THEN
      RAISE EXCEPTION
        'standalone_fee components must use separate treatment'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND l."kind" NOT IN ('cash_asset', 'expense')
    ) THEN
      RAISE EXCEPTION
        'standalone_fee may contain only cash_asset and expense postings'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "finance"."posting" AS p
      JOIN "finance"."journal" AS j
        ON j."workspace_id" = p."workspace_id"
        AND j."action_revision_id" = p."action_revision_id"
        AND j."id" = p."journal_id"
      JOIN "finance"."ledger_account" AS l
        ON l."workspace_id" = p."workspace_id"
        AND l."id" = p."ledger_account_id"
      WHERE
        p."workspace_id" = v_revision.workspace_id
        AND p."action_revision_id" = v_revision.id
        AND j."role" = 'economic'
        AND (
          (
            l."kind" = 'cash_asset'
            AND NOT (
              p."cash_flow_kind" = 'fee'
              AND p."cash_flow_direction" = 'out'
            )
          )
          OR
          (
            l."kind" = 'expense'
            AND (
              p."expense_class" <> 'gross'
              OR NOT EXISTS (
                SELECT 1
                FROM "finance"."fee_component" AS f
                WHERE
                  f."workspace_id" = p."workspace_id"
                  AND f."action_revision_id" = p."action_revision_id"
                  AND f."expense_posting_id" = p."id"
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION
        'standalone_fee postings must consist only of matched fee cash/expense effects'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
  END IF;

  RAISE EXCEPTION
    'unsupported S1 financial action kind'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_s1_revision_recipe"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_s1_revision_recipe"()
TO app_domain;

CREATE CONSTRAINT TRIGGER "action_revision_s1_recipe_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "finance"."validate_s1_revision_recipe"();