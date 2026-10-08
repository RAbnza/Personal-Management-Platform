/* D12: immutable refunds, explicit corrections and durable acknowledgements.
 * Existing migrations remain unchanged. Reversal-set and posting validators
 * continue enforcing the complete signed correspondence. */
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['refund_detail','refund_allocation'] LOOP
  EXECUTE format('REVOKE ALL ON finance.%I FROM PUBLIC, app_domain, auth_adapter, queue_broker, worker_domain, lifecycle_operator',t);
  EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO app_domain',t);
  EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON finance.%I FOR ALL TO app_domain
   USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid
    AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))
   WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid
    AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',t||'_owner_access',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence()',t||'_immutability',t);
 END LOOP;
END $$;


CREATE OR REPLACE FUNCTION "finance"."validate_borrowing_revision_recipe"()
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
  IF v_revision.change_kind NOT IN ('create','replace')
  THEN
    RAISE EXCEPTION
      'borrowing supports explicit creation or replacement'
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

  IF v_receiving_archived_at IS NOT NULL AND v_revision.change_kind='create' THEN
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


CREATE OR REPLACE FUNCTION finance.guard_adjustment_detail() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE ar finance.action_revision%ROWTYPE; a finance.financial_account%ROWTYPE; r finance.reconciliation%ROWTYPE; v_amount numeric; v_sources bigint;
BEGIN
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 SELECT * INTO ar FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND action_id=NEW.action_id AND id=NEW.action_revision_id FOR UPDATE;
 IF NOT FOUND OR ar.state<>'building' OR ar.action_kind<>'balance_adjustment' OR ar.change_kind NOT IN ('create','replace') THEN RAISE EXCEPTION 'adjustment requires a building adjustment action' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=NEW.workspace_id AND id=NEW.financial_account_id;
 IF NOT FOUND OR (a.archived_at IS NOT NULL AND ar.change_kind='create') OR a.currency<>ar.currency OR ar.primary_effective_date<=a.opening_cutoff_date THEN RAISE EXCEPTION 'invalid adjustment account or date' USING ERRCODE='23514'; END IF;
 IF NEW.reconciliation_id IS NOT NULL THEN
  SELECT * INTO r FROM finance.reconciliation WHERE workspace_id=NEW.workspace_id AND financial_account_id=a.id AND id=NEW.reconciliation_id;
  IF NOT FOUND OR ar.primary_effective_date>r.cutoff_date OR EXISTS(SELECT 1 FROM finance.reconciliation s WHERE s.workspace_id=r.workspace_id AND s.supersedes_reconciliation_id=r.id) THEN RAISE EXCEPTION 'adjustment requires a current comparison and applicable date' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(p.amount_minor::numeric),0),count(DISTINCT j.id) INTO v_amount,v_sources FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision rev ON rev.workspace_id=p.workspace_id AND rev.id=p.action_revision_id AND rev.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=r.cutoff_date;
  IF v_sources<>r.source_journal_count OR v_amount<>r.calculated_minor::numeric THEN RAISE EXCEPTION 'adjustment comparison needs review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION finance.validate_adjustment_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.adjustment_detail%ROWTYPE; a finance.financial_account%ROWTYPE; v_audit jsonb; v_balance numeric; v_current numeric;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.action_kind<>'balance_adjustment' THEN RETURN NULL; END IF;
 IF r.state<>'posted' OR r.change_kind NOT IN ('create','replace','void') THEN RAISE EXCEPTION 'adjustment must be finalized' USING ERRCODE='23514'; END IF;
 IF r.change_kind='void' THEN IF EXISTS(SELECT 1 FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'void adjustment cannot contain new typed economics' USING ERRCODE='23514'; END IF; RETURN NULL; END IF;
 SELECT * INTO d FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'adjustment requires typed evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=d.workspace_id AND id=d.financial_account_id;
 IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic')<>1 OR NOT EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND state='posted' AND role='economic' AND effective_date=r.primary_effective_date)
  OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>2 THEN RAISE EXCEPTION 'adjustment requires one journal and exactly two postings' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.posting p WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.ledger_account_id=a.ledger_account_id AND p.amount_minor=d.signed_adjustment_minor AND p.cash_flow_kind='adjustment' AND p.cash_flow_direction='adjustment' AND p.expense_class='none' AND p.income_class='none' AND p.category_id IS NULL AND p.liability_component IS NULL)
  OR NOT EXISTS(SELECT 1 FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND l.kind='adjustment_equity' AND p.amount_minor::numeric=-d.signed_adjustment_minor::numeric AND p.cash_flow_kind='none' AND p.cash_flow_direction='none' AND p.expense_class='none' AND p.income_class='none' AND p.category_id IS NULL AND p.liability_component IS NULL)
  THEN RAISE EXCEPTION 'adjustment requires exact cash/equity effects without income or expense' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'adjustment cannot contain another financial recipe' USING ERRCODE='23514'; END IF;
 SELECT after_json INTO v_audit FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no;
 IF NOT FOUND OR v_audit->>'actionKind' IS DISTINCT FROM 'balance_adjustment' OR v_audit->>'signedAdjustmentMinor' IS DISTINCT FROM d.signed_adjustment_minor::text OR v_audit->>'financialAccountId' IS DISTINCT FROM a.id::text OR v_audit->>'reason' IS DISTINCT FROM d.reason OR v_audit->>'effectiveDate' IS DISTINCT FROM r.primary_effective_date::text OR (v_audit->>'reconciliationId')::uuid IS DISTINCT FROM d.reconciliation_id THEN RAISE EXCEPTION 'adjustment requires exact audit evidence' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(p.amount_minor::numeric) FILTER(WHERE j.effective_date<=r.primary_effective_date),0),COALESCE(sum(p.amount_minor::numeric),0) INTO v_balance,v_current FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id;
 IF (v_balance<0 OR v_current<0) AND (v_audit->'acknowledgeNegativeBalance') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'negative adjustment balance requires explicit acknowledgement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION finance.validate_debt_charge_recipe()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.debt%ROWTYPE; intent jsonb; charge_amount bigint; charge_kind text;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
  IF NOT FOUND OR r.action_kind<>'debt_charge' THEN RETURN NULL; END IF;
  IF r.state<>'posted' OR r.change_kind NOT IN ('create','replace','void') THEN
    RAISE EXCEPTION 'debt charge requires a finalized explicit create action' USING ERRCODE='23514'; END IF;
  IF r.change_kind='void' THEN IF EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'void charge cannot contain new financial evidence' USING ERRCODE='23514'; END IF; RETURN NULL; END IF;
  IF (SELECT count(*) FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>1 THEN
    RAISE EXCEPTION 'debt charge requires one debt link' USING ERRCODE='23514'; END IF;
  SELECT debt.* INTO d FROM finance.debt debt JOIN finance.debt_action_link l ON l.workspace_id=debt.workspace_id AND l.debt_id=debt.id
    WHERE l.workspace_id=r.workspace_id AND l.action_revision_id=r.id AND l.purpose='charge';
  IF NOT FOUND OR d.lifecycle<>'active' OR d.currency<>r.currency OR r.primary_effective_date<d.start_date
    OR (d.opening_cutoff_date IS NOT NULL AND r.primary_effective_date<=d.opening_cutoff_date) THEN
    RAISE EXCEPTION 'debt charge context invalid' USING ERRCODE='23514'; END IF;
  SELECT after_json INTO intent FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id
    AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no AND operation IN ('create','replace');
  IF NOT FOUND OR COALESCE(intent->>'providerConfirmed','')<>'true' OR COALESCE(intent->>'actionKind','')<>'debt_charge'
    OR intent->>'debtId' IS DISTINCT FROM d.id::text OR COALESCE(length(trim(intent->>'explanation')),0)=0
    OR COALESCE(intent->>'amountMinor','') !~ '^[1-9][0-9]{0,11}$' THEN
    RAISE EXCEPTION 'debt charge requires explicit provider-confirmed audit evidence' USING ERRCODE='23514'; END IF;
  charge_amount:=(intent->>'amountMinor')::bigint; charge_kind:=intent->>'kind';
  IF charge_amount>100000000000 OR charge_kind NOT IN ('interest','fee','penalty') OR charge_kind IS NULL THEN
    RAISE EXCEPTION 'unsupported debt charge' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND state='posted' AND role='economic' AND effective_date=r.primary_effective_date)<>1
    OR (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic')<>1
    OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>2
    OR (SELECT count(*) FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id
      WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND l.kind='expense' AND p.amount_minor=charge_amount AND p.expense_class='gross'
      AND p.category_id IS NOT DISTINCT FROM (intent->>'categoryId')::uuid)<>1
    OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL AND ledger_account_id=d.liability_ledger_account_id
      AND amount_minor=-charge_amount AND liability_component=charge_kind)<>1
    OR EXISTS (SELECT 1 FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND cash_flow_kind<>'none')
    OR EXISTS (SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS (SELECT 1 FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS (SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS (SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR (SELECT count(*) FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>(CASE WHEN charge_kind='fee' THEN 1 ELSE 0 END)
    OR EXISTS (SELECT 1 FROM finance.fee_component f JOIN finance.posting p ON p.workspace_id=f.workspace_id AND p.id=f.expense_posting_id
      WHERE f.workspace_id=r.workspace_id AND f.action_revision_id=r.id AND (f.amount_minor<>charge_amount OR f.effective_date<>r.primary_effective_date
        OR f.bearing_ledger_account_id<>d.liability_ledger_account_id OR f.treatment<>'capitalized' OR p.amount_minor<>charge_amount OR p.expense_class<>'gross')) THEN
    RAISE EXCEPTION 'debt charge must recognize expense and liability exactly once without cash or unrelated evidence' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER refund_detail_parent BEFORE INSERT ON finance.refund_detail FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();
CREATE TRIGGER refund_allocation_parent BEFORE INSERT ON finance.refund_allocation FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();
DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN(NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge','debt_settlement','balance_adjustment','refund')) EXECUTE FUNCTION finance.validate_s1_revision_recipe();

CREATE FUNCTION finance.validate_refund_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.refund_detail%ROWTYPE; a finance.financial_account%ROWTYPE; v_audit jsonb; n bigint;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.action_kind<>'refund' THEN RETURN NULL; END IF;
 IF r.state<>'posted' THEN RAISE EXCEPTION 'refund must be finalized' USING ERRCODE='23514'; END IF;
 IF r.change_kind='void' THEN
  IF EXISTS(SELECT 1 FROM finance.refund_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'void refund cannot contain economic evidence' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO d FROM finance.refund_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF NOT FOUND OR d.action_id=d.purchase_action_id THEN RAISE EXCEPTION 'refund requires a separate linked purchase' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=d.workspace_id AND ledger_account_id=d.destination_ledger_account_id;
 IF NOT FOUND OR a.currency<>r.currency OR r.primary_effective_date<=a.opening_cutoff_date OR (a.archived_at IS NOT NULL AND r.change_kind='create') THEN RAISE EXCEPTION 'invalid refund destination or date' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND receiving_account_id=a.id AND actual_received_minor=d.refund_minor) THEN RAISE EXCEPTION 'refund requires exact receipt evidence' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM finance.refund_allocation WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF n=0 OR n>100 OR (SELECT sum(amount_minor::numeric) FROM finance.refund_allocation WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>d.refund_minor THEN RAISE EXCEPTION 'refund allocations must equal the actual receipt' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic')<>1
 OR NOT EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic' AND state='posted' AND effective_date=r.primary_effective_date)
 OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>n+1
 OR NOT EXISTS(SELECT 1 FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL AND ledger_account_id=a.ledger_account_id AND amount_minor=d.refund_minor AND cash_flow_kind='refund' AND cash_flow_direction='in' AND income_class='none' AND expense_class='none') THEN RAISE EXCEPTION 'refund requires exactly one cash receipt without income' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.refund_allocation x JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id
 JOIN finance.journal oj ON oj.workspace_id=op.workspace_id AND oj.id=op.journal_id
 JOIN finance.action_revision orev ON orev.workspace_id=op.workspace_id AND orev.id=op.action_revision_id
 JOIN finance.posting rp ON rp.workspace_id=x.workspace_id AND rp.id=x.refund_posting_id
 WHERE x.workspace_id=r.workspace_id AND x.action_revision_id=r.id AND
 (op.action_id<>d.purchase_action_id OR oj.role<>'economic' OR oj.state<>'posted' OR orev.state<>'posted' OR op.expense_class<>'gross' OR op.amount_minor<=0 OR x.amount_minor>op.amount_minor
 OR oj.effective_date>r.primary_effective_date OR rp.amount_minor::numeric<>-x.amount_minor::numeric OR rp.expense_class<>'refund_offset' OR rp.income_class<>'none' OR rp.cash_flow_kind<>'none' OR rp.category_id IS DISTINCT FROM op.category_id OR rp.ledger_account_id<>op.ledger_account_id OR rp.reverses_posting_id IS NOT NULL
 OR (x.allocation_kind='fee' AND NOT EXISTS(SELECT 1 FROM finance.fee_component f WHERE f.workspace_id=op.workspace_id AND f.expense_posting_id=op.id))
 OR (x.allocation_kind='purchase' AND (orev.action_kind<>'expense' OR EXISTS(SELECT 1 FROM finance.fee_component f WHERE f.workspace_id=op.workspace_id AND f.expense_posting_id=op.id))))) THEN RAISE EXCEPTION 'refund allocation must preserve eligible original purchase/fee classification' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'refund cannot contain another recipe' USING ERRCODE='23514'; END IF;
 SELECT after_json INTO v_audit FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no;
 IF NOT FOUND OR v_audit->>'actionKind' IS DISTINCT FROM 'refund' OR v_audit->>'refundMinor' IS DISTINCT FROM d.refund_minor::text OR v_audit->>'purchaseActionId' IS DISTINCT FROM d.purchase_action_id::text THEN RAISE EXCEPTION 'refund requires exact audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER refund_recipe AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_refund_recipe();

CREATE FUNCTION finance.validate_refund_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; source_id uuid;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.state<>'posted' THEN RETURN NULL; END IF;
 PERFORM finance.lock_active_workspace(r.workspace_id);
 FOR source_id IN SELECT DISTINCT d.purchase_action_id FROM finance.refund_detail d WHERE d.workspace_id=r.workspace_id AND (d.action_id=r.action_id OR d.purchase_action_id=r.action_id) LOOP
  IF EXISTS(WITH used AS (
    SELECT op.category_id,x.allocation_kind,sum(x.amount_minor::numeric) AS amount,min(ar.primary_effective_date) AS first_refund FROM finance.refund_detail d
    JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.id=d.action_id AND f.current_revision_id=d.action_revision_id
    JOIN finance.action_revision ar ON ar.workspace_id=f.workspace_id AND ar.id=f.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
    JOIN finance.refund_allocation x ON x.workspace_id=d.workspace_id AND x.action_revision_id=d.action_revision_id JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id
    WHERE d.workspace_id=r.workspace_id AND d.purchase_action_id=source_id GROUP BY op.category_id,x.allocation_kind
  ), eligible AS (
    SELECT p.category_id,CASE WHEN fc.id IS NOT NULL THEN 'fee' ELSE 'purchase' END AS kind,sum(p.amount_minor::numeric) AS amount,max(j.effective_date) AS purchase_date FROM finance.financial_action f
    JOIN finance.action_revision ar ON ar.workspace_id=f.workspace_id AND ar.id=f.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
    JOIN finance.journal j ON j.workspace_id=ar.workspace_id AND j.action_revision_id=ar.id AND j.role='economic' AND j.state='posted'
    JOIN finance.posting p ON p.workspace_id=j.workspace_id AND p.journal_id=j.id AND p.expense_class='gross' AND p.amount_minor>0
    LEFT JOIN finance.fee_component fc ON fc.workspace_id=p.workspace_id AND fc.expense_posting_id=p.id
    WHERE f.workspace_id=r.workspace_id AND f.id=source_id AND (ar.action_kind='expense' OR fc.id IS NOT NULL) GROUP BY p.category_id,CASE WHEN fc.id IS NOT NULL THEN 'fee' ELSE 'purchase' END
  ) SELECT 1 FROM used u LEFT JOIN eligible e ON e.category_id IS NOT DISTINCT FROM u.category_id AND e.kind=u.allocation_kind WHERE u.amount>COALESCE(e.amount,0) OR u.first_refund<e.purchase_date) THEN RAISE EXCEPTION 'dependent refunds exceed corrected eligible portions; reverse/reallocate dependent refunds explicitly first' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER refund_capacity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_refund_capacity();

CREATE FUNCTION finance.validate_manual_negative_acknowledgement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; a jsonb; affected record; bal numeric;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.state<>'posted' OR r.action_kind IN ('opening_cash','opening_debt') THEN RETURN NULL; END IF;
 SELECT after_json INTO a FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no;
 FOR affected IN SELECT p.ledger_account_id,j.effective_date FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='cash_asset'
 WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY p.ledger_account_id,j.effective_date HAVING sum(p.amount_minor::numeric)<0 LOOP
  SELECT COALESCE(sum(p.amount_minor::numeric),0) INTO bal FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=affected.ledger_account_id AND j.effective_date<=affected.effective_date;
  IF bal<0 AND (a->'acknowledgeNegativeBalance') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'negative balance requires durable explicit command acknowledgement' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER manual_negative_acknowledgement AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_manual_negative_acknowledgement();

CREATE FUNCTION finance.validate_correction_liability() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.change_kind='create' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted'
 WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id IN (SELECT DISTINCT sp.ledger_account_id FROM finance.posting sp JOIN finance.ledger_account l ON l.workspace_id=sp.workspace_id AND l.id=sp.ledger_account_id WHERE sp.workspace_id=r.workspace_id AND sp.action_revision_id=r.id AND l.kind='debt_liability') GROUP BY p.ledger_account_id,p.liability_component HAVING sum(p.amount_minor::numeric)>0) THEN RAISE EXCEPTION 'correction would over-repay a recognized liability component; resolve dependent payments explicitly' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER correction_liability AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_correction_liability();
REVOKE ALL ON FUNCTION finance.validate_refund_recipe(),finance.validate_refund_capacity(),finance.validate_manual_negative_acknowledgement(),finance.validate_correction_liability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_refund_recipe(),finance.validate_refund_capacity(),finance.validate_manual_negative_acknowledgement(),finance.validate_correction_liability() TO app_domain;
