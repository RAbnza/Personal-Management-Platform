/* V2-A2 releases only posted card purchases. All existing V1 validators
 * remain installed; only S1 dispatch excludes the separately validated recipe. */
CREATE OR REPLACE FUNCTION finance.guard_unreleased_card_action() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF NEW.action_kind IN ('opening_card','card_payment','card_fee','card_interest','card_refund','card_adjustment') THEN
    RAISE EXCEPTION 'card financial command is not enabled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION finance.guard_unreleased_card_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM finance.ledger_account l WHERE l.workspace_id=NEW.workspace_id
    AND l.id=NEW.ledger_account_id AND l.kind='card_liability')
    AND NOT EXISTS (SELECT 1 FROM finance.action_revision r WHERE r.workspace_id=NEW.workspace_id
      AND r.id=NEW.action_revision_id AND r.action_kind='card_purchase') THEN
    RAISE EXCEPTION 'card liability requires a released card purchase recipe' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN(NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge','debt_settlement','balance_adjustment','refund','card_purchase'))
EXECUTE FUNCTION finance.validate_s1_revision_recipe();

GRANT INSERT ON finance.card_activity TO app_domain;
DROP TRIGGER card_activity_unreleased_guard ON finance.card_activity;
CREATE TRIGGER card_activity_immutable BEFORE UPDATE OR DELETE ON finance.card_activity
FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
CREATE TRIGGER card_activity_parent BEFORE INSERT ON finance.card_activity
FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();
CREATE TRIGGER a_card_activity_financial_root BEFORE INSERT ON finance.card_activity
FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write();

/* Card fields cannot be attached to a cash or debt recipe. Date ordering is
 * provider evidence, so no guessed transaction/posting ordering is imposed. */
CREATE FUNCTION finance.guard_card_purchase_detail() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; c finance.credit_card%ROWTYPE;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.action_revision_id;
  IF r.action_kind='card_purchase' THEN
    SELECT * INTO c FROM finance.credit_card WHERE workspace_id=NEW.workspace_id AND liability_ledger_account_id=NEW.funding_ledger_account_id;
    IF NOT FOUND OR c.currency<>r.currency OR (c.archived_at IS NOT NULL AND NOT (r.change_kind='replace' AND EXISTS(SELECT 1 FROM finance.purchase_detail prior_detail WHERE prior_detail.workspace_id=r.workspace_id AND prior_detail.action_revision_id=r.previous_revision_id AND prior_detail.funding_ledger_account_id=c.liability_ledger_account_id)))
      OR NEW.card_posting_date IS NULL THEN
      RAISE EXCEPTION 'card purchase requires owned same-currency active card and verified posting date' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.card_posting_date IS NOT NULL OR NEW.card_provider_reference IS NOT NULL THEN
    RAISE EXCEPTION 'card provider evidence requires a card purchase' USING ERRCODE='23514';
  END IF;
  IF NEW.card_provider_reference IS NOT NULL AND (char_length(btrim(NEW.card_provider_reference))=0 OR char_length(NEW.card_provider_reference)>2000) THEN
    RAISE EXCEPTION 'invalid card provider reference' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION finance.guard_card_purchase_detail() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_card_purchase_detail() TO app_domain;
CREATE TRIGGER purchase_detail_card_evidence BEFORE INSERT ON finance.purchase_detail
FOR EACH ROW EXECUTE FUNCTION finance.guard_card_purchase_detail();
--> statement-breakpoint
CREATE FUNCTION finance.validate_card_purchase_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.purchase_detail%ROWTYPE; c finance.credit_card%ROWTYPE;
  activity finance.card_activity%ROWTYPE; movement record; nd finance.purchase_detail%ROWTYPE; pd finance.purchase_detail%ROWTYPE;
  expected_date date; expected_posting_date date; expected_reference text; n bigint;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF; -- approved whole-workspace purge
  IF r.action_kind<>'card_purchase' THEN
    IF EXISTS (SELECT 1 FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN
      RAISE EXCEPTION 'card activity requires released card recipe' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  IF r.state<>'posted' THEN RAISE EXCEPTION 'card revision must be posted' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='financial_action' AND a.subject_id=r.action_id AND a.subject_version=r.revision_no
    AND a.recorded_by_user_id IS NOT DISTINCT FROM r.recorded_by_user_id AND a.actor_kind=r.actor_kind
    AND a.operation=CASE WHEN r.change_kind='create' THEN 'create' WHEN r.change_kind='replace' THEN 'replace' ELSE 'void' END
    AND a.after_json @> jsonb_build_object('actionRevisionId',r.id,'actionKind','card_purchase')
    AND (r.change_kind='create' OR (a.reason IS NOT DISTINCT FROM r.reason AND a.before_json IS NOT NULL))) THEN
    RAISE EXCEPTION 'card revision requires attributed correction audit evidence' USING ERRCODE='23514';
  END IF;
  IF r.previous_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance.action_revision
    WHERE workspace_id=r.workspace_id AND id=r.previous_revision_id AND action_kind='card_purchase') THEN
    RAISE EXCEPTION 'card correction must retain the purchase recipe' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.payment_reclassification WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.refund_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)
    OR EXISTS(SELECT 1 FROM finance.financial_account WHERE workspace_id=r.workspace_id AND opening_action_id=r.action_id) THEN
    RAISE EXCEPTION 'card purchase cannot contain unrelated economic evidence' USING ERRCODE='23514';
  END IF;
  SELECT * INTO d FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
  IF r.change_kind='void' THEN
    IF FOUND OR EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic') THEN
      RAISE EXCEPTION 'void card purchase contains reversal evidence only' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'card purchase requires purchase detail' USING ERRCODE='23514'; END IF;
    SELECT * INTO c FROM finance.credit_card WHERE workspace_id=r.workspace_id AND liability_ledger_account_id=d.funding_ledger_account_id;
    IF NOT FOUND OR c.currency<>r.currency OR d.card_posting_date IS NULL THEN
      RAISE EXCEPTION 'invalid card purchase identity or provider date' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic')<>1
      OR EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic' AND (state<>'posted' OR effective_date<>r.primary_effective_date)) THEN
      RAISE EXCEPTION 'card purchase requires one posted transaction-date journal' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM finance.posting p WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.ledger_account_id=c.liability_ledger_account_id)<>1
      OR NOT EXISTS(SELECT 1 FROM finance.posting p WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.ledger_account_id=c.liability_ledger_account_id AND p.amount_minor::numeric=-d.purchase_minor::numeric)
      OR (SELECT COALESCE(sum(p.amount_minor::numeric),0) FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND l.kind='expense')<>d.purchase_minor::numeric
      OR EXISTS(SELECT 1 FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL
        AND NOT ((p.ledger_account_id=c.liability_ledger_account_id AND l.kind='card_liability') OR (l.kind='expense' AND p.expense_class='gross' AND p.amount_minor>0))) THEN
      RAISE EXCEPTION 'card purchase requires exact gross spending and one card credit without cash' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM finance.posting p JOIN core.category cat ON cat.workspace_id=p.workspace_id AND cat.id=p.category_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND cat.archived_at IS NOT NULL
      AND NOT (r.change_kind='replace' AND EXISTS(SELECT 1 FROM finance.posting prior_posting WHERE prior_posting.workspace_id=r.workspace_id AND prior_posting.action_revision_id=r.previous_revision_id AND prior_posting.reverses_posting_id IS NULL AND prior_posting.category_id=cat.id))) THEN
      RAISE EXCEPTION 'new card category must be active or retained historical classification' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='financial_action' AND a.subject_id=r.action_id AND a.subject_version=r.revision_no
      AND a.operation=CASE WHEN r.change_kind='create' THEN 'create' ELSE 'replace' END
      AND a.after_json @> jsonb_build_object('actionRevisionId',r.id,'actionKind','card_purchase','cardId',c.id,'effectiveDate',r.primary_effective_date::text,'postingDate',d.card_posting_date::text,'providerReference',d.card_provider_reference,'purchaseMinor',d.purchase_minor::text)) THEN
      RAISE EXCEPTION 'card purchase requires matching immutable audit evidence' USING ERRCODE='23514';
    END IF;
  END IF;
  /* Every nonzero net card movement has exactly one matching activity row;
   * no row exists for zero movement. Include the complete reversal/replacement. */
  n:=0;
  FOR movement IN SELECT cc.id AS card_id,cc.liability_ledger_account_id,(-sum(p.amount_minor::numeric)) AS signed_minor
    FROM finance.posting p JOIN finance.credit_card cc ON cc.workspace_id=p.workspace_id AND cc.liability_ledger_account_id=p.ledger_account_id
    WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY cc.id,cc.liability_ledger_account_id HAVING sum(p.amount_minor::numeric)<>0 LOOP
    n:=n+1;
    SELECT * INTO activity FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND card_id=movement.card_id;
    IF NOT FOUND OR activity.signed_liability_minor::numeric<>movement.signed_minor OR activity.activity_kind<>'purchase' THEN
      RAISE EXCEPTION 'card activity must match exact net revision liability movement' USING ERRCODE='23514';
    END IF;
    SELECT * INTO nd FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND funding_ledger_account_id=movement.liability_ledger_account_id;
    IF FOUND THEN
      expected_date:=r.primary_effective_date; expected_posting_date:=nd.card_posting_date; expected_reference:=nd.card_provider_reference;
    ELSE
      SELECT * INTO pd FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.previous_revision_id AND funding_ledger_account_id=movement.liability_ledger_account_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'card reversal requires original provider evidence' USING ERRCODE='23514'; END IF;
      SELECT primary_effective_date INTO expected_date FROM finance.action_revision WHERE workspace_id=r.workspace_id AND id=r.previous_revision_id;
      expected_posting_date:=pd.card_posting_date; expected_reference:=pd.card_provider_reference;
    END IF;
    IF activity.transaction_date IS DISTINCT FROM expected_date OR activity.posting_date IS DISTINCT FROM expected_posting_date OR activity.provider_reference IS DISTINCT FROM expected_reference THEN
      RAISE EXCEPTION 'card activity must preserve purchase provider evidence' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>n THEN
    RAISE EXCEPTION 'unexpected card activity without matching liability movement' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION finance.validate_card_purchase_recipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_card_purchase_recipe() TO app_domain;
CREATE CONSTRAINT TRIGGER action_revision_card_purchase_recipe AFTER INSERT OR UPDATE ON finance.action_revision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_card_purchase_recipe();

--> statement-breakpoint
/* Existing classifier preserved verbatim with one additional card branch. */
CREATE OR REPLACE FUNCTION "finance"."validate_posting_classification"()
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
    ledger."kind",
    journal."role"
  INTO
    v_ledger_kind,
    v_journal_role
  FROM "finance"."ledger_account" AS ledger
  JOIN "finance"."journal" AS journal
    ON journal."workspace_id" = NEW.workspace_id
    AND journal."action_revision_id" = NEW.action_revision_id
    AND journal."id" = NEW.journal_id
  WHERE
    ledger."workspace_id" = NEW.workspace_id
    AND ledger."id" = NEW.ledger_account_id;

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
    SELECT category."kind"
    INTO v_category_kind
    FROM "core"."category" AS category
    WHERE
      category."workspace_id" = NEW.workspace_id
      AND category."id" = NEW.category_id;

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

    WHEN 'debt_liability' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'debt_liability posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'payment_clearing_asset' THEN
      IF NEW.expense_class <> 'none'
        OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none'
        OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL
        OR NEW.category_id IS NOT NULL
      THEN
        RAISE EXCEPTION
          'payment_clearing_asset posting classification is invalid'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'card_liability' THEN
      IF NEW.expense_class <> 'none' OR NEW.income_class <> 'none'
        OR NEW.cash_flow_kind <> 'none' OR NEW.cash_flow_direction <> 'none'
        OR NEW.liability_component IS NOT NULL OR NEW.category_id IS NOT NULL
        OR (v_journal_role='economic' AND NEW.amount_minor>=0)
      THEN RAISE EXCEPTION 'invalid card purchase liability classification' USING ERRCODE='23514'; END IF;

    ELSE
      RAISE EXCEPTION
        'ledger kind is not supported by the financial posting classifier'
        USING ERRCODE = '23514';
  END CASE;

  RETURN NEW;
END;
$$;
