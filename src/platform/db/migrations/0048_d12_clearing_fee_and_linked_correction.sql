/* D12 later clearing classification carries no cash; explicitly recognized
 * fees retain typed evidence. Correction of an adjustment retains its original
 * comparison provenance even though that comparison already needs review. */
CREATE OR REPLACE FUNCTION finance.validate_payment_revision_recipe()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  r finance.action_revision%ROWTYPE;
  v_payment finance.debt_payment_revision%ROWTYPE;
  d finance.debt%ROWTYPE;
  a finance.financial_account%ROWTYPE;
  v_debt_id uuid;
  v_count bigint;
  v_total numeric;
  v_external numeric;
  v_credit numeric;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id = NEW.workspace_id AND id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.action_kind NOT IN ('debt_payment','payment_reclassification','debt_settlement') THEN RETURN NULL; END IF;
  IF r.state <> 'posted' THEN
    RAISE EXCEPTION 'payment revision must be finalized' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit.private_revision WHERE workspace_id = r.workspace_id
    AND command_receipt_id = r.command_receipt_id AND subject_kind = 'financial_action'
    AND subject_id = r.action_id AND subject_version = r.revision_no) THEN
    RAISE EXCEPTION 'payment action requires immutable audit evidence' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.receipt_detail WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
    OR EXISTS (SELECT 1 FROM finance.purchase_detail WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
    OR EXISTS (SELECT 1 FROM finance.transfer_detail WHERE workspace_id = r.workspace_id AND action_revision_id = r.id) THEN
    RAISE EXCEPTION 'payment action cannot carry unrelated typed detail' USING ERRCODE = '23514';
  END IF;
  IF r.change_kind = 'void' THEN
    IF EXISTS (SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
      OR EXISTS (SELECT 1 FROM finance.payment_reclassification WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
      OR EXISTS (SELECT 1 FROM finance.fee_component WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
      OR EXISTS (SELECT 1 FROM finance.debt_action_link WHERE workspace_id = r.workspace_id AND action_revision_id = r.id) THEN
      RAISE EXCEPTION 'void retains historical evidence but has no new economic detail' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  SELECT count(*) INTO v_count FROM finance.debt_action_link
    WHERE workspace_id = r.workspace_id AND action_revision_id = r.id;
  SELECT debt_id INTO v_debt_id FROM finance.debt_action_link
    WHERE workspace_id = r.workspace_id AND action_revision_id = r.id
      AND purpose = CASE r.action_kind WHEN 'debt_payment' THEN 'payment' WHEN 'debt_settlement' THEN 'settlement' ELSE 'reclassification' END;
  IF v_count <> 1 OR v_debt_id IS NULL THEN
    RAISE EXCEPTION 'payment action requires exactly one matching debt link' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO d FROM finance.debt WHERE workspace_id = r.workspace_id AND id = v_debt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment debt unavailable' USING ERRCODE = '23503'; END IF;
  IF r.primary_effective_date < d.start_date
    OR (d.opening_cutoff_date IS NOT NULL AND r.primary_effective_date <= d.opening_cutoff_date) THEN
    RAISE EXCEPTION 'payment must follow debt coverage cutoff' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.journal WHERE workspace_id = r.workspace_id
    AND action_revision_id = r.id AND role = 'economic' AND effective_date <> r.primary_effective_date) THEN
    RAISE EXCEPTION 'payment economic dates must match' USING ERRCODE = '23514';
  END IF;

  IF r.action_kind = 'debt_settlement' AND NOT EXISTS (SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RETURN NULL; END IF;
  IF r.action_kind IN ('debt_payment','debt_settlement') THEN
    SELECT * INTO v_payment FROM finance.debt_payment_revision
      WHERE workspace_id = r.workspace_id AND action_revision_id = r.id;
    IF NOT FOUND OR v_payment.debt_id <> d.id THEN
      RAISE EXCEPTION 'payment requires same-debt revision evidence' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_reclassification WHERE workspace_id = r.workspace_id AND action_revision_id = r.id) THEN
      RAISE EXCEPTION 'payment cannot contain reclassification evidence' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO a FROM finance.financial_account WHERE workspace_id = r.workspace_id AND id = v_payment.paying_account_id;
    IF NOT FOUND OR a.currency <> r.currency OR r.primary_effective_date <= a.opening_cutoff_date
      OR (r.change_kind = 'create' AND a.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'payment paying account or cutoff invalid' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM finance.debt_schedule_version WHERE workspace_id = r.workspace_id
      AND debt_id = d.id AND id = v_payment.paid_against_schedule_version_id AND state = 'finalized') THEN
      RAISE EXCEPTION 'payment schedule context must be finalized' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount_minor::numeric),0),
      COALESCE(sum(amount_minor::numeric) FILTER (WHERE disposition = 'external_fee'),0)
      INTO v_total, v_external FROM finance.payment_component
      WHERE workspace_id = r.workspace_id AND payment_revision_id = v_payment.id;
    IF v_total <> v_payment.actual_paid_minor OR v_external <> v_payment.external_fee_minor THEN
      RAISE EXCEPTION 'payment component or external-fee totals mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount_minor::numeric),0) INTO v_total FROM finance.payment_due_allocation
      WHERE workspace_id = r.workspace_id AND payment_revision_id = v_payment.id;
    IF v_total + v_payment.unapplied_contractual_minor <> v_payment.contractual_minor THEN
      RAISE EXCEPTION 'due allocations plus unapplied must equal contractual payment' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_due_allocation x JOIN finance.scheduled_installment i
      ON i.workspace_id = x.workspace_id AND i.id = x.installment_id
      WHERE x.workspace_id = r.workspace_id AND x.payment_revision_id = v_payment.id
        AND (x.schedule_version_id <> v_payment.paid_against_schedule_version_id OR i.disposition <> 'scheduled')) THEN
      RAISE EXCEPTION 'due allocation must use the payment schedule and a scheduled obligation' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM finance.payment_component c
      JOIN finance.posting x ON x.workspace_id = c.workspace_id AND x.id = c.posting_id
      JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      JOIN finance.ledger_account l ON l.workspace_id = x.workspace_id AND l.id = x.ledger_account_id
      LEFT JOIN finance.fee_component f ON f.workspace_id = c.workspace_id AND f.id = c.fee_component_id
      WHERE c.workspace_id = r.workspace_id AND c.payment_revision_id = v_payment.id AND (
        x.action_revision_id <> r.id OR j.role <> 'economic' OR x.amount_minor <> c.amount_minor
        OR CASE c.disposition
          WHEN 'liability_reduction' THEN l.kind <> 'debt_liability' OR l.id <> d.liability_ledger_account_id
            OR (v_payment.allocation_certainty = 'confirmed_total' AND x.liability_component <> 'unclassified')
          WHEN 'clearing' THEN l.kind <> 'payment_clearing_asset' OR l.id IS DISTINCT FROM d.clearing_ledger_account_id
            OR v_payment.allocation_certainty <> 'unresolved'
          WHEN 'advance' THEN l.kind <> 'payment_clearing_asset' OR l.id IS DISTINCT FROM d.clearing_ledger_account_id
          ELSE l.kind <> 'expense' OR x.expense_class <> 'gross' END
        OR (c.disposition IN ('new_fee','external_fee') AND c.fee_component_id IS NULL)
        OR (c.disposition NOT IN ('new_fee','external_fee') AND c.fee_component_id IS NOT NULL)
        OR (c.fee_component_id IS NOT NULL AND (f.action_revision_id <> r.id OR f.expense_posting_id <> x.id
          OR f.amount_minor <> c.amount_minor OR f.bearing_ledger_account_id <> a.ledger_account_id
          OR f.effective_date <> r.primary_effective_date OR f.treatment NOT IN ('separate','source_additional')))
      )) THEN
      RAISE EXCEPTION 'payment component posting, disposition, or fee evidence mismatch' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.fee_component f WHERE f.workspace_id = r.workspace_id
      AND f.action_revision_id = r.id AND NOT EXISTS (SELECT 1 FROM finance.payment_component c
        WHERE c.workspace_id = f.workspace_id AND c.payment_revision_id = v_payment.id AND c.fee_component_id = f.id)
        AND NOT (r.action_kind='debt_settlement' AND EXISTS (SELECT 1 FROM finance.settlement_component sc JOIN finance.debt_settlement st ON st.workspace_id=sc.workspace_id AND st.id=sc.settlement_id WHERE st.workspace_id=r.workspace_id AND st.action_revision_id=r.id AND sc.component_kind='recognized_charge' AND sc.counter_posting_id=f.expense_posting_id AND sc.liability_component='fee'))) THEN
      RAISE EXCEPTION 'payment fee evidence must be consumed exactly once' USING ERRCODE = '23514';
    END IF;
    -- Every economic debit is explained once; every credit is cash from the
    -- owned paying account. External fees have a separate reporting cash leg.
    IF EXISTS (SELECT 1 FROM finance.posting x JOIN finance.journal j
      ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      JOIN finance.ledger_account l ON l.workspace_id = x.workspace_id AND l.id = x.ledger_account_id
      WHERE x.workspace_id = r.workspace_id AND x.action_revision_id = r.id AND j.role = 'economic' AND (
        (l.kind = 'cash_asset' AND (x.ledger_account_id <> a.ledger_account_id OR x.amount_minor >= 0
          OR x.cash_flow_direction <> 'out' OR x.cash_flow_kind NOT IN ('debt_payment','fee')))
        OR (l.kind <> 'cash_asset' AND NOT EXISTS (SELECT 1 FROM finance.payment_component c
          WHERE c.workspace_id = x.workspace_id AND c.payment_revision_id = v_payment.id AND c.posting_id = x.id)
          AND NOT (r.action_kind='debt_settlement' AND EXISTS (SELECT 1 FROM finance.settlement_component sc JOIN finance.debt_settlement st ON st.workspace_id=sc.workspace_id AND st.id=sc.settlement_id WHERE st.workspace_id=r.workspace_id AND st.action_revision_id=r.id AND x.id IN (sc.effect_posting_id,sc.counter_posting_id)))))) THEN
      RAISE EXCEPTION 'payment has an unexplained economic posting' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(-x.amount_minor::numeric) FILTER (WHERE x.cash_flow_kind = 'debt_payment'),0),
      COALESCE(sum(-x.amount_minor::numeric) FILTER (WHERE x.cash_flow_kind = 'fee'),0)
      INTO v_total, v_external FROM finance.posting x JOIN finance.journal j
        ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE x.workspace_id = r.workspace_id AND x.action_revision_id = r.id AND j.role = 'economic';
    IF v_total <> v_payment.contractual_minor OR v_external <> v_payment.external_fee_minor THEN
      RAISE EXCEPTION 'payment cash deduction must equal contractual plus external fee' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT count(*), COALESCE(sum(amount_minor::numeric),0) INTO v_count, v_total
      FROM finance.payment_reclassification WHERE workspace_id = r.workspace_id AND action_revision_id = r.id;
    IF v_count = 0 OR EXISTS (SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id = r.workspace_id AND action_revision_id = r.id)
      THEN
      RAISE EXCEPTION 'reclassification requires only its own typed evidence' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.fee_component f JOIN finance.posting fp ON fp.workspace_id=f.workspace_id AND fp.id=f.expense_posting_id WHERE f.workspace_id=r.workspace_id AND f.action_revision_id=r.id AND (fp.reverses_posting_id IS NOT NULL OR fp.expense_class<>'gross' OR fp.amount_minor<>f.amount_minor OR f.effective_date<>r.primary_effective_date OR f.treatment<>'source_additional')) THEN RAISE EXCEPTION 'resolved fee requires exact recognized expense evidence' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_reclassification c
      JOIN finance.payment_component s ON s.workspace_id = c.workspace_id AND s.id = c.source_component_id
      JOIN finance.debt_payment_revision source_revision ON source_revision.workspace_id = s.workspace_id AND source_revision.id = s.payment_revision_id
      JOIN finance.posting x ON x.workspace_id = c.workspace_id AND x.id = c.clearing_credit_posting_id
      JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE c.workspace_id = r.workspace_id AND c.action_revision_id = r.id AND (
        c.debt_id <> d.id OR source_revision.payment_id <> c.payment_id OR s.disposition NOT IN ('clearing','advance')
        OR x.ledger_account_id IS DISTINCT FROM d.clearing_ledger_account_id
        OR x.amount_minor::numeric <> -c.amount_minor::numeric OR j.role <> 'economic')) THEN
      RAISE EXCEPTION 'reclassification must credit its same-payment clearing component' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.posting x JOIN finance.journal j
      ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      JOIN finance.ledger_account l ON l.workspace_id = x.workspace_id AND l.id = x.ledger_account_id
      WHERE x.workspace_id = r.workspace_id AND x.action_revision_id = r.id AND j.role = 'economic' AND NOT (
        (x.amount_minor > 0 AND ((l.kind = 'debt_liability' AND l.id = d.liability_ledger_account_id)
          OR (l.kind = 'expense' AND x.expense_class = 'gross')))
        OR (x.amount_minor < 0 AND EXISTS (SELECT 1 FROM finance.payment_reclassification c
          WHERE c.workspace_id = x.workspace_id AND c.action_revision_id = r.id AND c.clearing_credit_posting_id = x.id)))) THEN
      RAISE EXCEPTION 'reclassification cannot post cash or unrelated accounts' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(x.amount_minor::numeric) FILTER (WHERE x.amount_minor > 0),0),
      COALESCE(sum(-x.amount_minor::numeric) FILTER (WHERE x.amount_minor < 0),0)
      INTO v_external, v_credit FROM finance.posting x JOIN finance.journal j
        ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE x.workspace_id = r.workspace_id AND x.action_revision_id = r.id AND j.role = 'economic';
    IF v_total <> v_external OR v_total <> v_credit THEN
      RAISE EXCEPTION 'reclassification debit and clearing totals mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
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
 IF ar.change_kind='replace' AND NEW.reconciliation_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM finance.adjustment_detail d WHERE d.workspace_id=NEW.workspace_id AND d.action_revision_id=ar.previous_revision_id AND d.financial_account_id=NEW.financial_account_id AND d.reconciliation_id=NEW.reconciliation_id) THEN RAISE EXCEPTION 'replacement adjustment must retain an owned original comparison or explicitly detach it' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.reconciliation_id IS NOT NULL THEN
  SELECT * INTO r FROM finance.reconciliation WHERE workspace_id=NEW.workspace_id AND financial_account_id=a.id AND id=NEW.reconciliation_id;
  IF NOT FOUND OR ar.primary_effective_date>r.cutoff_date OR EXISTS(SELECT 1 FROM finance.reconciliation s WHERE s.workspace_id=r.workspace_id AND s.supersedes_reconciliation_id=r.id) THEN RAISE EXCEPTION 'adjustment requires a current comparison and applicable date' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(p.amount_minor::numeric),0),count(DISTINCT j.id) INTO v_amount,v_sources FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision rev ON rev.workspace_id=p.workspace_id AND rev.id=p.action_revision_id AND rev.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=r.cutoff_date;
  IF v_sources<>r.source_journal_count OR v_amount<>r.calculated_minor::numeric THEN RAISE EXCEPTION 'adjustment comparison needs review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

