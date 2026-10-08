/* D12 controlled baseline amount/component corrections preserve account,
 * debt and coverage-cutoff identities, never mutate opening satisfaction. */
CREATE OR REPLACE FUNCTION "finance"."validate_opening_debt_revision_recipe"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_revision "finance"."action_revision"%ROWTYPE;

  v_link_count bigint;
  v_opening_link_count bigint;

  v_debt_id uuid;
  v_liability_ledger_id uuid;

  v_debt_currency text;
  v_breakdown_status text;
  v_debt_lifecycle text;
  v_opening_cutoff_date date;

  v_economic_journal_count bigint;

  v_debt_posting_count bigint;
  v_equity_posting_count bigint;

  v_debt_total numeric;
  v_equity_total numeric;

  v_classified_liability_count bigint;
  v_unclassified_liability_count bigint;
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
      'opening_debt recipe validation requires a finalized revision'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.action_kind <> 'opening_debt' THEN
    RETURN NULL;
  END IF;

  /*
   * D6a creates imported opening debt only.
   *
   * Economic correction of an opening debt is intentionally not enabled until
   * the reviewed baseline-correction workflow exists.
   */
  IF v_revision.change_kind='void' THEN IF EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=v_revision.workspace_id AND action_revision_id=v_revision.id) THEN RAISE EXCEPTION 'void opening debt cannot contain new liability evidence' USING ERRCODE='23514'; END IF; RETURN NULL; END IF;
  IF v_revision.change_kind NOT IN ('create','replace')
  THEN
    RAISE EXCEPTION
      'opening debt requires explicit create or replacement'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE link."purpose" = 'opening'
    )
  INTO
    v_link_count,
    v_opening_link_count
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id;

  IF v_link_count <> 1
    OR v_opening_link_count <> 1
  THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one opening debt-action link'
      USING ERRCODE = '23514';
  END IF;

  SELECT link."debt_id"
  INTO v_debt_id
  FROM "finance"."debt_action_link" AS link
  WHERE
    link."workspace_id" = v_revision.workspace_id
    AND link."action_revision_id" = v_revision.id
    AND link."purpose" = 'opening';

  SELECT
    debt."liability_ledger_account_id",
    debt."currency",
    debt."breakdown_status",
    debt."lifecycle",
    debt."opening_cutoff_date"
  INTO
    v_liability_ledger_id,
    v_debt_currency,
    v_breakdown_status,
    v_debt_lifecycle,
    v_opening_cutoff_date
  FROM "finance"."debt" AS debt
  WHERE
    debt."workspace_id" = v_revision.workspace_id
    AND debt."id" = v_debt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'opening_debt debt does not exist in the active scope'
      USING ERRCODE = '23503';
  END IF;

  IF v_debt_lifecycle <> 'active' THEN
    RAISE EXCEPTION
      'opening_debt requires an active debt'
      USING ERRCODE = '23514';
  END IF;

  IF v_opening_cutoff_date IS NULL THEN
    RAISE EXCEPTION
      'imported opening debt requires an opening cutoff date'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.currency IS DISTINCT FROM v_debt_currency THEN
    RAISE EXCEPTION
      'opening_debt currency must match its debt'
      USING ERRCODE = '23514';
  END IF;

  IF v_revision.primary_effective_date
      IS DISTINCT FROM v_opening_cutoff_date
  THEN
    RAISE EXCEPTION
      'opening_debt effective date must equal the debt opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * Imported baseline debt must not masquerade as a receipt, purchase,
   * transfer or fee.
   */
  IF EXISTS (
    SELECT 1
    FROM "finance"."receipt_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."purchase_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."transfer_detail" AS detail
    WHERE
      detail."workspace_id" = v_revision.workspace_id
      AND detail."action_revision_id" = v_revision.id
  )
  OR EXISTS (
    SELECT 1
    FROM "finance"."fee_component" AS fee
    WHERE
      fee."workspace_id" = v_revision.workspace_id
      AND fee."action_revision_id" = v_revision.id
  )
  THEN
    RAISE EXCEPTION
      'opening_debt cannot contain cash receipt/purchase/transfer/fee detail'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "finance"."financial_account" AS account
    WHERE
      account."workspace_id" = v_revision.workspace_id
      AND account."opening_action_id" = v_revision.action_id
  )
  THEN
    RAISE EXCEPTION
      'opening_debt cannot be used as a financial-account opening action'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_economic_journal_count
  FROM "finance"."journal" AS journal
  WHERE
    journal."workspace_id" = v_revision.workspace_id
    AND journal."action_revision_id" = v_revision.id
    AND journal."role" = 'economic';

  IF v_economic_journal_count <> 1 THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one economic journal'
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
        IS DISTINCT FROM v_opening_cutoff_date
  )
  THEN
    RAISE EXCEPTION
      'opening_debt journal date must equal the debt opening cutoff'
      USING ERRCODE = '23514';
  END IF;

  /*
   * No present-period cash, income, expense or adjustment is allowed in an
   * imported opening liability.
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
        'opening_equity',
        'debt_liability'
      )
  )
  THEN
    RAISE EXCEPTION
      'opening_debt may contain only opening_equity and debt_liability postings'
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
      AND ledger."kind" = 'debt_liability'
      AND (
        posting."ledger_account_id"
          IS DISTINCT FROM v_liability_ledger_id
        OR posting."amount_minor" >= 0
        OR posting."liability_component" IS NULL
      )
  )
  THEN
    RAISE EXCEPTION
      'opening_debt liability postings must credit the debt liability ledger'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    COALESCE(
      sum(-(posting."amount_minor"::numeric)),
      0
    ),
    count(*) FILTER (
      WHERE posting."liability_component" = 'unclassified'
    ),
    count(*) FILTER (
      WHERE posting."liability_component" <> 'unclassified'
    )
  INTO
    v_debt_posting_count,
    v_debt_total,
    v_unclassified_liability_count,
    v_classified_liability_count
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

  IF v_debt_posting_count < 1
    OR v_debt_total <= 0
  THEN
    RAISE EXCEPTION
      'opening_debt requires a positive recognized opening liability'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'known'
    AND v_unclassified_liability_count <> 0
  THEN
    RAISE EXCEPTION
      'known debt breakdown cannot contain unclassified liability'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'unknown'
    AND v_classified_liability_count <> 0
  THEN
    RAISE EXCEPTION
      'unknown debt breakdown must remain unclassified'
      USING ERRCODE = '23514';
  END IF;

  IF v_breakdown_status = 'partial'
    AND (
      v_unclassified_liability_count = 0
      OR v_classified_liability_count = 0
    )
  THEN
    RAISE EXCEPTION
      'partial debt breakdown requires classified and unclassified liability portions'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    COALESCE(
      sum(posting."amount_minor"::numeric),
      0
    )
  INTO
    v_equity_posting_count,
    v_equity_total
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
    AND ledger."kind" = 'opening_equity';

  IF v_equity_posting_count <> 1
    OR v_equity_total <= 0
  THEN
    RAISE EXCEPTION
      'opening_debt requires exactly one positive opening-equity posting'
      USING ERRCODE = '23514';
  END IF;

  IF v_equity_total <> v_debt_total THEN
    RAISE EXCEPTION
      'opening_debt equity baseline must equal recognized opening liability'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;
