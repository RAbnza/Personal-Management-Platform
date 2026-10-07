/*
 * D7 — New borrowing / net-proceeds financial integrity.
 *
 * This migration installs the coherent-V1 borrowing recipe before the
 * declarative action-kind CHECK is widened in the following structural
 * migration.
 *
 * A cash borrowing is not income.
 *
 * Canonical examples:
 *
 *   Principal 10,000, withheld fee 200:
 *
 *     cash_asset       +9,800
 *     expense            +200
 *     debt_liability   -10,000
 *
 *   Principal 10,000, capitalized fee 200:
 *
 *     cash_asset      +10,000
 *     expense            +200
 *     debt_liability  -10,200
 *
 * Withheld fees reduce actual cash proceeds but do not increase the
 * recognized liability beyond contractual principal.
 *
 * Capitalized fees do not reduce cash proceeds; they create an additional
 * recognized fee component on the debt liability.
 *
 * D7 supports only initial borrowing creation. Economic correction/replacement
 * remains deferred to the coherent-V1 correction milestone.
 */

/*
 * ---------------------------------------------------------------------------
 * Borrowing financial recipe
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "finance"."validate_borrowing_revision_recipe"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;

  v_link_count bigint;
  v_borrowing_link_count bigint;

  v_debt_id uuid;
  v_liability_ledger_id uuid;

  v_debt_currency text;
  v_debt_type text;
  v_debt_lifecycle text;
  v_breakdown_status text;
  v_opening_cutoff_date date;
  v_debt_start_date date;
  v_original_principal_minor bigint;

  v_receipt_count bigint;
  v_receiving_account_id uuid;
  v_receiving_ledger_id uuid;
  v_receiving_account_currency text;
  v_receiving_opening_cutoff_date date;
  v_receiving_archived_at timestamptz;
  v_actual_received_minor bigint;

  v_purchase_count bigint;
  v_transfer_count bigint;
  v_opening_account_count bigint;

  v_economic_journal_count bigint;

  v_fee_count bigint;

  v_withheld_fee_total numeric;
  v_capitalized_fee_total numeric;
  v_fee_expense_total numeric;

  v_cash_posting_count bigint;
  v_cash_total numeric;

  v_principal_posting_count bigint;
  v_principal_liability_total numeric;

  v_liability_fee_posting_count bigint;
  v_liability_fee_total numeric;

  v_total_liability numeric;
BEGIN
  SELECT revision.*
  INTO v_revision
  FROM "finance"."action_revision" AS revision
  WHERE
    revision."workspace_id" = NEW.workspace_id
    AND revision."id" = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_revision.state <> 'posted' THEN
    RAISE EXCEPTION
      'borrowing recipe validation requires a finalized revision'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.action_kind <> 'borrowing' THEN
    RETURN NULL;
  END IF;

  /*
   * D7 releases creation only.
   *
   * Replacement/void corrections arrive with the explicit financial
   * correction workflow so borrowing evidence cannot be silently rewritten.
   */
  IF v_revision.change_kind <> 'create'
    OR v_revision.revision_no <> 1
  THEN
    RAISE EXCEPTION
      'D7 borrowing supports only initial create revisions'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Exactly one debt must own the borrowing action.
   */
  SELECT
    count(*),
    count(*) FILTER (
      WHERE link."purpose" = 'borrowing'
    )
  INTO
    v_link_count,
    v_borrowing_link_count
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id;

  IF v_link_count <> 1
    OR v_borrowing_link_count <> 1
  THEN
    RAISE EXCEPTION
      'borrowing requires exactly one borrowing debt-action link'
      USING ERRCODE = '23514';
  END IF;

  SELECT link."debt_id"
  INTO v_debt_id
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id
    AND link."purpose" = 'borrowing';

  SELECT
    debt."liability_ledger_account_id",
    debt."currency",
    debt."debt_type",
    debt."lifecycle",
    debt."breakdown_status",
    debt."opening_cutoff_date",
    debt."start_date",
    debt."original_principal_minor"
  INTO
    v_liability_ledger_id,
    v_debt_currency,
    v_debt_type,
    v_debt_lifecycle,
    v_breakdown_status,
    v_opening_cutoff_date,
    v_debt_start_date,
    v_original_principal_minor
  FROM "finance"."debt" AS debt
  WHERE
    debt."workspace_id" = v_revision.workspace_id
    AND debt."id" = v_debt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'borrowing debt does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_debt_lifecycle <> 'active' THEN
    RAISE EXCEPTION
      'borrowing requires an active debt'
      USING ERRCODE = '23514';
  END IF;

  /*
   * A newly originated borrowing is tracked as actual present-period
   * activity. It must not masquerade as an imported opening baseline.
   */
  IF v_opening_cutoff_date IS NOT NULL THEN
    RAISE EXCEPTION
      'new borrowing cannot use an imported-debt opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  IF v_original_principal_minor IS NULL
    OR v_original_principal_minor <= 0
  THEN
    RAISE EXCEPTION
      'borrowing requires provider-confirmed original principal'
      USING ERRCODE = '23514';
  END IF;

  /*
   * New cash borrowing begins with fully known recognized components:
   *
   * - contractual principal;
   * - explicitly identified capitalized fees, if any.
   *
   * Unknown/partial imported balances belong to opening_debt instead.
   */
  IF v_breakdown_status <> 'known' THEN
    RAISE EXCEPTION
      'new borrowing requires a known opening liability breakdown'
      USING ERRCODE = '23514';
  END IF;

  /*
   * financed_purchase has its own coherent-V1 financial recipe because no
   * cash receipt occurs there.
   */
  IF v_debt_type = 'financed_purchase' THEN
    RAISE EXCEPTION
      'financed purchase debt cannot use the cash borrowing recipe'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.currency IS DISTINCT FROM v_debt_currency THEN
    RAISE EXCEPTION
      'borrowing currency must match its debt'
      USING ERRCODE = '23514';
  END IF;

  /*
   * A provider contract may technically begin before disbursement, but it
   * cannot begin after the borrowing cash receipt represented here.
   */
  IF v_debt_start_date > v_revision.primary_effective_date THEN
    RAISE EXCEPTION
      'debt start date cannot be after the borrowing effective date'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Cash borrowing requires exactly one actual receipt.
   */
  SELECT count(*)
  INTO v_receipt_count
  FROM "finance"."receipt_detail" AS receipt
  WHERE
    receipt."workspace_id" = v_revision.workspace_id
    AND receipt."action_revision_id" = v_revision.id;

  IF v_receipt_count <> 1 THEN
    RAISE EXCEPTION
      'borrowing requires exactly one receipt_detail'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    receipt."receiving_account_id",
    receipt."actual_received_minor",
    account."ledger_account_id",
    account."currency",
    account."opening_cutoff_date",
    account."archived_at"
  INTO
    v_receiving_account_id,
    v_actual_received_minor,
    v_receiving_ledger_id,
    v_receiving_account_currency,
    v_receiving_opening_cutoff_date,
    v_receiving_archived_at
  FROM "finance"."receipt_detail" AS receipt
  JOIN "finance"."financial_account" AS account
    ON account."workspace_id" = receipt."workspace_id"
    AND account."id" = receipt."receiving_account_id"
  WHERE
    receipt."workspace_id" = v_revision.workspace_id
    AND receipt."action_revision_id" = v_revision.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'borrowing receiving account does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_receiving_account_currency
      IS DISTINCT FROM v_revision.currency
  THEN
    RAISE EXCEPTION
      'borrowing receiving account currency must match the action currency'
      USING ERRCODE = '23514';
  END IF;

  IF v_receiving_archived_at IS NOT NULL THEN
    RAISE EXCEPTION
      'new borrowing requires an active receiving financial account'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.primary_effective_date
      <= v_receiving_opening_cutoff_date
  THEN
    RAISE EXCEPTION
      'borrowing activity must occur after the receiving account opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Borrowing must not carry unrelated S1 typed-detail records.
   */
  SELECT count(*)
  INTO v_purchase_count
  FROM "finance"."purchase_detail" AS detail
  WHERE
    detail."workspace_id" = v_revision.workspace_id
    AND detail."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_transfer_count
  FROM "finance"."transfer_detail" AS detail
  WHERE
    detail."workspace_id" = v_revision.workspace_id
    AND detail."action_revision_id" = v_revision.id;

  SELECT count(*)
  INTO v_opening_account_count
  FROM "finance"."financial_account" AS account
  WHERE
    account."workspace_id" = v_revision.workspace_id
    AND account."opening_action_id" = v_revision.action_id;

  IF v_purchase_count <> 0
    OR v_transfer_count <> 0
  THEN
    RAISE EXCEPTION
      'borrowing cannot contain purchase or transfer detail'
      USING ERRCODE = '23514';
  END IF;

  IF v_opening_account_count <> 0 THEN
    RAISE EXCEPTION
      'borrowing cannot be used as a financial-account opening action'
      USING ERRCODE = '23514';
  END IF;

  /*
   * D7 borrowing and its provider-confirmed fees all occur on the borrowing
   * effective date, so one balanced economic journal is sufficient.
   */
  SELECT count(*)
  INTO v_economic_journal_count
  FROM "finance"."journal" AS journal
  WHERE
    journal."workspace_id" = v_revision.workspace_id
    AND journal."action_revision_id" = v_revision.id
    AND journal."role" = 'economic';

  IF v_economic_journal_count <> 1 THEN
    RAISE EXCEPTION
      'D7 borrowing requires exactly one economic journal'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."journal" AS journal
    WHERE
      journal."workspace_id" = v_revision.workspace_id
      AND journal."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND journal."effective_date"
        IS DISTINCT FROM v_revision.primary_effective_date
  )
  THEN
    RAISE EXCEPTION
      'borrowing journal date must equal its primary effective date'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Borrowing may contain only:
   *
   * - receiving cash;
   * - recognized borrowing-fee expense;
   * - the linked debt liability.
   *
   * In particular, it may never contain an income posting.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" NOT IN (
        'cash_asset',
        'expense',
        'debt_liability'
      )
  )
  THEN
    RAISE EXCEPTION
      'borrowing may contain only cash_asset, expense and debt_liability postings'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Exactly one cash posting must represent actual proceeds received.
   */
  SELECT
    count(*),
    COALESCE(
      sum(posting."amount_minor"::numeric),
      0
    )
  INTO
    v_cash_posting_count,
    v_cash_total
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  JOIN "finance"."ledger_account" AS ledger
    ON ledger."workspace_id" = posting."workspace_id"
    AND ledger."id" = posting."ledger_account_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND ledger."kind" = 'cash_asset';

  IF v_cash_posting_count <> 1
    OR v_cash_total <> v_actual_received_minor
  THEN
    RAISE EXCEPTION
      'borrowing cash increase must equal actual_received_minor exactly'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" = 'cash_asset'
      AND (
        posting."ledger_account_id"
          IS DISTINCT FROM v_receiving_ledger_id
        OR posting."amount_minor"
          IS DISTINCT FROM v_actual_received_minor
        OR posting."cash_flow_kind" <> 'borrowing'
        OR posting."cash_flow_direction" <> 'in'
      )
  )
  THEN
    RAISE EXCEPTION
      'borrowing receipt must post once to its receiving account as borrowing cash inflow'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Borrowing has no separate fee cash-out posting.
   *
   * Withheld fees have already reduced gross proceeds before cash arrived.
   * Capitalized fees increase liability instead.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND posting."cash_flow_kind" = 'fee'
  )
  THEN
    RAISE EXCEPTION
      'withheld/capitalized borrowing fees cannot create a separate fee cash posting'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Every debt-liability posting belongs to this debt and is a credit.
   *
   * New borrowing supports only known principal and explicitly capitalized
   * fee components. Interest/penalty/unclassified recognition belongs to
   * later explicit debt-charge/payment workflows.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" = 'debt_liability'
      AND (
        posting."ledger_account_id"
          IS DISTINCT FROM v_liability_ledger_id
        OR posting."amount_minor" >= 0
        OR posting."liability_component"
          NOT IN ('principal', 'fee')
      )
  )
  THEN
    RAISE EXCEPTION
      'borrowing liability postings must credit the linked debt principal/fee liability'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Contractual principal is represented once and exactly.
   */
  SELECT
    count(*),
    COALESCE(
      sum(-(posting."amount_minor"::numeric)),
      0
    )
  INTO
    v_principal_posting_count,
    v_principal_liability_total
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND posting."ledger_account_id" = v_liability_ledger_id
    AND posting."liability_component" = 'principal';

  IF v_principal_posting_count <> 1
    OR v_principal_liability_total
      <> v_original_principal_minor::numeric
  THEN
    RAISE EXCEPTION
      'borrowing principal liability must equal original_principal_minor exactly'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Borrowing fee evidence.
   */
  SELECT count(*)
  INTO v_fee_count
  FROM "finance"."fee_component" AS fee
  WHERE
    fee."workspace_id" = v_revision.workspace_id
    AND fee."action_revision_id" = v_revision.id;

  /*
   * D7 permits only withheld and capitalized borrowing fees.
   *
   * Both are borne by the debt liability:
   *
   * - withheld: part of contractual principal finances the fee before the
   *   remaining proceeds arrive as cash;
   * - capitalized: liability increases above contractual principal.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS fee
    WHERE
      fee."workspace_id" = v_revision.workspace_id
      AND fee."action_revision_id" = v_revision.id
      AND (
        fee."treatment" NOT IN ('withheld', 'capitalized')
        OR fee."bearing_ledger_account_id"
          IS DISTINCT FROM v_liability_ledger_id
        OR fee."effective_date"
          IS DISTINCT FROM v_revision.primary_effective_date
      )
  )
  THEN
    RAISE EXCEPTION
      'borrowing fees must be withheld/capitalized against the linked debt on the borrowing date'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Each fee component identifies exactly one matching recognized expense
   * posting.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS fee
    LEFT JOIN "finance"."posting" AS posting
      ON posting."workspace_id" = fee."workspace_id"
      AND posting."action_revision_id" = fee."action_revision_id"
      AND posting."id" = fee."expense_posting_id"
    LEFT JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    LEFT JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    WHERE
      fee."workspace_id" = v_revision.workspace_id
      AND fee."action_revision_id" = v_revision.id
      AND (
        posting."id" IS NULL
        OR journal."role" <> 'economic'
        OR journal."effective_date"
          IS DISTINCT FROM fee."effective_date"
        OR ledger."kind" <> 'expense'
        OR posting."amount_minor" <> fee."amount_minor"
        OR posting."expense_class" <> 'gross'
        OR posting."income_class" <> 'none'
        OR posting."cash_flow_kind" <> 'none'
        OR posting."cash_flow_direction" <> 'none'
        OR posting."liability_component" IS NOT NULL
      )
  )
  THEN
    RAISE EXCEPTION
      'borrowing fee expense posting does not match its fee component'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Every borrowing expense posting must be accounted for by exactly one
   * fee_component. This prevents an unrelated expense from being smuggled
   * into the borrowing journal.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."posting" AS posting
    JOIN "finance"."journal" AS journal
      ON journal."workspace_id" = posting."workspace_id"
      AND journal."action_revision_id" = posting."action_revision_id"
      AND journal."id" = posting."journal_id"
    JOIN "finance"."ledger_account" AS ledger
      ON ledger."workspace_id" = posting."workspace_id"
      AND ledger."id" = posting."ledger_account_id"
    LEFT JOIN "finance"."fee_component" AS fee
      ON fee."workspace_id" = posting."workspace_id"
      AND fee."action_revision_id" = posting."action_revision_id"
      AND fee."expense_posting_id" = posting."id"
    WHERE
      posting."workspace_id" = v_revision.workspace_id
      AND posting."action_revision_id" = v_revision.id
      AND journal."role" = 'economic'
      AND ledger."kind" = 'expense'
      AND fee."id" IS NULL
  )
  THEN
    RAISE EXCEPTION
      'borrowing expense postings require matching fee-component evidence'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    sum(fee."amount_minor"::numeric)
      FILTER (WHERE fee."treatment" = 'withheld'),
    0
  )
  INTO v_withheld_fee_total
  FROM "finance"."fee_component" AS fee
  WHERE
    fee."workspace_id" = v_revision.workspace_id
    AND fee."action_revision_id" = v_revision.id;

  SELECT COALESCE(
    sum(fee."amount_minor"::numeric)
      FILTER (WHERE fee."treatment" = 'capitalized'),
    0
  )
  INTO v_capitalized_fee_total
  FROM "finance"."fee_component" AS fee
  WHERE
    fee."workspace_id" = v_revision.workspace_id
    AND fee."action_revision_id" = v_revision.id;

  SELECT COALESCE(
    sum(posting."amount_minor"::numeric),
    0
  )
  INTO v_fee_expense_total
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  JOIN "finance"."ledger_account" AS ledger
    ON ledger."workspace_id" = posting."workspace_id"
    AND ledger."id" = posting."ledger_account_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND ledger."kind" = 'expense';

  IF v_fee_expense_total
      <> v_withheld_fee_total + v_capitalized_fee_total
  THEN
    RAISE EXCEPTION
      'borrowing fee expense total must equal its fee components exactly'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Net proceeds:
   *
   * actual cash = contractual principal - withheld fees.
   */
  IF v_withheld_fee_total >= v_original_principal_minor::numeric THEN
    RAISE EXCEPTION
      'withheld borrowing fees must be less than contractual principal'
      USING ERRCODE = '23514';
  END IF;

  IF v_actual_received_minor::numeric
      <> v_original_principal_minor::numeric
        - v_withheld_fee_total
  THEN
    RAISE EXCEPTION
      'borrowing receipt must equal principal minus withheld fees'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Capitalized fees alone increase recognized liability above principal.
   */
  SELECT
    count(*),
    COALESCE(
      sum(-(posting."amount_minor"::numeric)),
      0
    )
  INTO
    v_liability_fee_posting_count,
    v_liability_fee_total
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND posting."ledger_account_id" = v_liability_ledger_id
    AND posting."liability_component" = 'fee';

  IF v_liability_fee_total <> v_capitalized_fee_total THEN
    RAISE EXCEPTION
      'capitalized fee liability must equal capitalized fee components exactly'
      USING ERRCODE = '23514';
  END IF;

  IF v_capitalized_fee_total = 0
    AND v_liability_fee_posting_count <> 0
  THEN
    RAISE EXCEPTION
      'borrowing without capitalized fees cannot create fee liability'
      USING ERRCODE = '23514';
  END IF;

  IF v_capitalized_fee_total > 0
    AND v_liability_fee_posting_count < 1
  THEN
    RAISE EXCEPTION
      'capitalized borrowing fees require recognized fee liability postings'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(
    sum(-(posting."amount_minor"::numeric)),
    0
  )
  INTO v_total_liability
  FROM "finance"."posting" AS posting
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = posting."workspace_id"
    AND journal."action_revision_id" = posting."action_revision_id"
    AND journal."id" = posting."journal_id"
  WHERE
    posting."workspace_id" = v_revision.workspace_id
    AND posting."action_revision_id" = v_revision.id
    AND journal."role" = 'economic'
    AND posting."ledger_account_id" = v_liability_ledger_id;

  IF v_total_liability
      <> v_original_principal_minor::numeric
        + v_capitalized_fee_total
  THEN
    RAISE EXCEPTION
      'borrowing recognized liability must equal principal plus capitalized fees'
      USING ERRCODE = '23514';
  END IF;

  /*
   * The generic posted-journal invariant independently proves the journal
   * balances to zero. The explicit equations above prove the business
   * semantics rather than relying on balancing alone.
   */

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION "finance"."validate_borrowing_revision_recipe"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "finance"."validate_borrowing_revision_recipe"()
TO app_domain;

/*
 * ---------------------------------------------------------------------------
 * Action recipe routing
 * ---------------------------------------------------------------------------
 *
 * opening_debt and borrowing now have dedicated coherent-V1 recipes.
 *
 * Keep the original S1 recipe limited to the action kinds it understands.
 */

DROP TRIGGER "action_revision_s1_recipe_integrity"
ON "finance"."action_revision";

CREATE CONSTRAINT TRIGGER "action_revision_s1_recipe_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  NEW."action_kind" NOT IN (
    'opening_debt',
    'borrowing'
  )
)
EXECUTE FUNCTION "finance"."validate_s1_revision_recipe"();

CREATE CONSTRAINT TRIGGER "action_revision_borrowing_recipe_integrity"
AFTER INSERT OR UPDATE
ON "finance"."action_revision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."action_kind" = 'borrowing')
EXECUTE FUNCTION "finance"."validate_borrowing_revision_recipe"();