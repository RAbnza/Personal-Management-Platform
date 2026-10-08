/* D10: one settlement action, typed payment and noncash adjustments. Original
 * allocation pools and opening evidence survive the immutable closing version.
 * Resolved unapplied pools require explicit final-payoff confirmation; this
 * handles debts without supplied dates without manufacturing obligations. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['debt_settlement','settlement_component'] LOOP
    EXECUTE format('REVOKE ALL ON finance.%I FROM PUBLIC, app_domain, auth_adapter, queue_broker, worker_domain, lifecycle_operator', t);
    EXECUTE format('GRANT SELECT, INSERT ON finance.%I TO app_domain', t);
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON finance.%I FOR ALL TO app_domain
      USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid
        AND EXISTS (SELECT 1 FROM core.workspace w JOIN core.user_profile p
          ON p.user_id = w.owner_user_id WHERE w.id = workspace_id
          AND w.owner_user_id = NULLIF(current_setting(''app.user_id'', true), '''')::uuid
          AND w.state = ''active'' AND p.lifecycle = ''active''))
      WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid
        AND EXISTS (SELECT 1 FROM core.workspace w JOIN core.user_profile p
          ON p.user_id = w.owner_user_id WHERE w.id = workspace_id
          AND w.owner_user_id = NULLIF(current_setting(''app.user_id'', true), '''')::uuid
          AND w.state = ''active'' AND p.lifecycle = ''active''))', t || '_owner_access', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON finance.%I
      FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence()', t || '_immutability', t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION finance.guard_payment_evidence_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_revision_id uuid;
  v_action_id uuid;
  v_state text;
  v_kind text;
  v_schedule_id uuid;
BEGIN
  PERFORM finance.lock_active_workspace(NEW.workspace_id);
  IF TG_TABLE_NAME = 'schedule_allocation_map' THEN
    SELECT state INTO v_state FROM finance.debt_schedule_version
      WHERE workspace_id = NEW.workspace_id AND debt_id = NEW.debt_id
        AND id = NEW.target_schedule_version_id FOR UPDATE;
    IF NOT FOUND OR v_state <> 'building' THEN
      RAISE EXCEPTION 'allocation map requires a building target schedule' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'debt_payment' THEN
    SELECT current_revision_id INTO v_revision_id FROM finance.financial_action
      WHERE workspace_id = NEW.workspace_id AND id = NEW.action_id;
    v_action_id := NEW.action_id;
  ELSIF TG_TABLE_NAME IN ('payment_component','payment_due_allocation') THEN
    SELECT action_id, action_revision_id INTO v_action_id, v_revision_id
      FROM finance.debt_payment_revision WHERE workspace_id = NEW.workspace_id
        AND debt_id = NEW.debt_id AND id = NEW.payment_revision_id;
  ELSE
    v_action_id := NEW.action_id;
    v_revision_id := NEW.action_revision_id;
  END IF;
  SELECT state, action_kind INTO v_state, v_kind FROM finance.action_revision
    WHERE workspace_id = NEW.workspace_id AND action_id = v_action_id
      AND id = v_revision_id FOR UPDATE;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'payment evidence requires a building action revision' USING ERRCODE = '23514';
  END IF;
  IF (TG_TABLE_NAME = 'payment_reclassification' AND v_kind <> 'payment_reclassification')
    OR (TG_TABLE_NAME <> 'payment_reclassification' AND v_kind NOT IN ('debt_payment','debt_settlement')) THEN
    RAISE EXCEPTION 'payment evidence action kind mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'debt_payment_revision' THEN
    SELECT current_schedule_version_id INTO v_schedule_id FROM finance.debt
      WHERE workspace_id = NEW.workspace_id AND id = NEW.debt_id;
    IF NOT FOUND OR v_schedule_id IS NULL THEN
      RAISE EXCEPTION 'payment requires explicit schedule context' USING ERRCODE = '23514';
    END IF;
    -- Replacements can retain their original context while atomically rebuilding
    -- maps in a new allocation-correction version. New payments use live terms.
    IF (SELECT change_kind FROM finance.action_revision WHERE workspace_id = NEW.workspace_id AND id = v_revision_id) = 'create'
      AND NEW.paid_against_schedule_version_id IS DISTINCT FROM v_schedule_id THEN
      RAISE EXCEPTION 'new payment must use the current schedule' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
      OR EXISTS (SELECT 1 FROM finance.fee_component WHERE workspace_id = r.workspace_id AND action_revision_id = r.id) THEN
      RAISE EXCEPTION 'reclassification requires only its own typed evidence' USING ERRCODE = '23514';
    END IF;
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

CREATE OR REPLACE FUNCTION finance.validate_payment_workspace_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  w uuid := NEW.workspace_id;
  v_payment record;
  pool record;
  v_total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.workspace WHERE id = w) THEN
    RAISE EXCEPTION 'payment integrity scope unavailable' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.debt_payment p JOIN finance.financial_action a
    ON a.workspace_id = p.workspace_id AND a.id = p.action_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id
    LEFT JOIN finance.debt_payment_revision v ON v.workspace_id = r.workspace_id AND v.action_revision_id = r.id
    WHERE p.workspace_id = w AND (r.action_kind NOT IN ('debt_payment','debt_settlement')
      OR (r.change_kind <> 'void' AND (v.id IS NULL OR v.payment_id <> p.id OR v.debt_id <> p.debt_id)))) THEN
    RAISE EXCEPTION 'logical payment current revision identity mismatch' USING ERRCODE = '23514';
  END IF;
  -- A later classification cannot survive replacement/void of its source pool
  -- unless dependent facts are atomically corrected as well.
  IF EXISTS (SELECT 1 FROM finance.payment_reclassification c
    JOIN finance.financial_action a ON a.workspace_id = c.workspace_id AND a.current_revision_id = c.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.payment_component s ON s.workspace_id = c.workspace_id AND s.id = c.source_component_id
    JOIN finance.debt_payment_revision v ON v.workspace_id = s.workspace_id AND v.id = s.payment_revision_id
    JOIN finance.financial_action pa ON pa.workspace_id = v.workspace_id AND pa.id = v.action_id
    JOIN finance.action_revision pr ON pr.workspace_id = pa.workspace_id AND pr.id = pa.current_revision_id
    WHERE c.workspace_id = w AND (pr.id <> v.action_revision_id OR pr.change_kind = 'void' OR r.action_kind <> 'payment_reclassification')) THEN
    RAISE EXCEPTION 'reclassification source must remain the current payment revision' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.payment_reclassification c
    JOIN finance.financial_action a ON a.workspace_id = c.workspace_id AND a.current_revision_id = c.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.payment_component s ON s.workspace_id = c.workspace_id AND s.id = c.source_component_id
    WHERE c.workspace_id = w GROUP BY s.id, s.amount_minor
    HAVING sum(c.amount_minor::numeric) > s.amount_minor) THEN
    RAISE EXCEPTION 'clearing component cannot be reclassified twice' USING ERRCODE = '23514';
  END IF;
  -- Nonvoid current payment revisions supply source pools exactly once.
  FOR v_payment IN SELECT v.*, d.current_schedule_version_id AS target_id, ts.version_no AS target_no,
      ss.version_no AS source_no FROM finance.debt_payment_revision v
    JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.debt d ON d.workspace_id = v.workspace_id AND d.id = v.debt_id
    JOIN finance.debt_schedule_version ts ON ts.workspace_id = d.workspace_id AND ts.id = d.current_schedule_version_id
    JOIN finance.debt_schedule_version ss ON ss.workspace_id = v.workspace_id AND ss.id = v.paid_against_schedule_version_id
    WHERE v.workspace_id = w LOOP
    IF v_payment.source_no > v_payment.target_no THEN
      RAISE EXCEPTION 'payment schedule cannot follow current schedule' USING ERRCODE = '23514';
    END IF;
    IF v_payment.source_no = v_payment.target_no THEN
      IF EXISTS (SELECT 1 FROM finance.schedule_allocation_map WHERE workspace_id = w
        AND target_schedule_version_id = v_payment.target_id AND payment_revision_id = v_payment.id) THEN
        RAISE EXCEPTION 'direct and mapped allocation paths cannot overlap' USING ERRCODE = '23514';
      END IF;
    ELSE
      FOR pool IN SELECT id, amount_minor FROM finance.payment_due_allocation
        WHERE workspace_id = w AND payment_revision_id = v_payment.id
        UNION ALL SELECT NULL::uuid, v_payment.unapplied_contractual_minor LOOP
        SELECT COALESCE(sum(amount_minor::numeric),0) INTO v_total FROM finance.schedule_allocation_map
          WHERE workspace_id = w AND target_schedule_version_id = v_payment.target_id AND payment_revision_id = v_payment.id
            AND source_allocation_id IS NOT DISTINCT FROM pool.id;
        IF v_total <> pool.amount_minor THEN
          RAISE EXCEPTION 'schedule mappings must exhaust each original source pool exactly' USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM finance.schedule_allocation_map m
    JOIN finance.debt d ON d.workspace_id = m.workspace_id AND d.current_schedule_version_id = m.target_schedule_version_id
    JOIN finance.debt_payment_revision v ON v.workspace_id = m.workspace_id AND v.id = m.payment_revision_id
    JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.id = v.action_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id
    WHERE m.workspace_id = w AND (a.current_revision_id <> v.action_revision_id OR r.change_kind = 'void')) THEN
    RAISE EXCEPTION 'current schedule maps cannot retain superseded payment pools' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.scheduled_installment i JOIN finance.debt d
    ON d.workspace_id = i.workspace_id AND d.current_schedule_version_id = i.schedule_version_id
    WHERE i.workspace_id = w AND (
      i.opening_satisfied_minor::numeric
      + COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.payment_due_allocation x
        JOIN finance.debt_payment_revision v ON v.workspace_id = x.workspace_id AND v.id = x.payment_revision_id
        JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
        JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
        WHERE x.workspace_id = w AND x.installment_id = i.id AND v.paid_against_schedule_version_id = i.schedule_version_id),0)
      + COALESCE((SELECT sum(m.amount_minor::numeric) FROM finance.schedule_allocation_map m
        JOIN finance.debt_payment_revision v ON v.workspace_id = m.workspace_id AND v.id = m.payment_revision_id
        JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
        JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
        WHERE m.workspace_id = w AND m.target_installment_id = i.id),0)
      > i.contractual_minor OR (i.disposition = 'cancelled' AND NOT EXISTS (SELECT 1 FROM finance.debt_settlement st WHERE st.workspace_id=i.workspace_id AND st.debt_id=i.debt_id AND st.closing_schedule_version_id=i.schedule_version_id) AND EXISTS (SELECT 1 FROM finance.schedule_allocation_map m
        WHERE m.workspace_id = w AND m.target_installment_id = i.id)))) THEN
    RAISE EXCEPTION 'current installment cannot be over-satisfied or allocated when cancelled' USING ERRCODE = '23514';
  END IF;
  -- Recognized liability reductions may consume only recognized components;
  -- excess is advance/clearing, never a silently negative debt.
  IF EXISTS (SELECT 1 FROM finance.posting x JOIN finance.journal j
    ON j.workspace_id = x.workspace_id AND j.id = x.journal_id AND j.state = 'posted'
    JOIN finance.debt d ON d.workspace_id = x.workspace_id AND d.liability_ledger_account_id = x.ledger_account_id
    WHERE x.workspace_id = w GROUP BY d.id, x.liability_component HAVING sum(x.amount_minor::numeric) > 0) THEN
    RAISE EXCEPTION 'payment cannot reduce more than recognized liability component' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM finance.debt d WHERE d.workspace_id = w AND d.lifecycle <> 'active' AND (
    EXISTS (SELECT 1 FROM finance.posting x JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE x.workspace_id = w AND x.ledger_account_id = d.clearing_ledger_account_id AND j.state = 'posted'
      GROUP BY x.ledger_account_id HAVING sum(x.amount_minor::numeric) <> 0)
    OR EXISTS (SELECT 1 FROM finance.debt_payment_revision v JOIN finance.financial_action a
      ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
      WHERE v.workspace_id = w AND v.debt_id = d.id AND (
        (v.paid_against_schedule_version_id = d.current_schedule_version_id AND v.unapplied_contractual_minor > 0)
        OR EXISTS (SELECT 1 FROM finance.schedule_allocation_map m WHERE m.workspace_id = w
          AND m.payment_revision_id = v.id AND m.target_schedule_version_id = d.current_schedule_version_id AND m.target_kind = 'unapplied' AND NOT EXISTS (SELECT 1 FROM finance.debt_settlement st WHERE st.workspace_id=m.workspace_id AND st.debt_id=m.debt_id AND st.closing_schedule_version_id=m.target_schedule_version_id AND st.resolved_unapplied_minor>0 AND length(trim(st.unapplied_resolution_note))>0)))))) THEN
    RAISE EXCEPTION 'debt cannot close with unresolved clearing or unapplied contractual allocation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION "finance"."validate_committed_action_revision"()
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
    IF (v_economic_count < 1 AND NOT (v_revision.action_kind='debt_settlement' AND EXISTS (SELECT 1 FROM finance.debt_settlement st WHERE st.workspace_id=v_revision.workspace_id AND st.action_revision_id=v_revision.id AND st.actual_cash_paid_minor=0) AND NOT EXISTS (SELECT 1 FROM finance.settlement_component sc JOIN finance.debt_settlement st ON st.workspace_id=sc.workspace_id AND st.id=sc.settlement_id WHERE st.workspace_id=v_revision.workspace_id AND st.action_revision_id=v_revision.id AND sc.component_kind<>'avoided_future_charge'))) OR v_reversal_count <> 0 THEN
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


DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge','debt_settlement')) EXECUTE FUNCTION finance.validate_s1_revision_recipe();

CREATE FUNCTION finance.guard_settlement_parent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v uuid; k text; state text;
BEGIN
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 IF TG_TABLE_NAME='debt_settlement' THEN v:=NEW.action_revision_id;
 ELSE SELECT action_revision_id INTO v FROM finance.debt_settlement WHERE workspace_id=NEW.workspace_id AND id=NEW.settlement_id; END IF;
 SELECT action_kind,r.state INTO k,state FROM finance.action_revision r WHERE workspace_id=NEW.workspace_id AND id=v FOR UPDATE;
 IF NOT FOUND OR k<>'debt_settlement' OR state<>'building' THEN RAISE EXCEPTION 'settlement evidence requires its building financial action' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER debt_settlement_parent BEFORE INSERT ON finance.debt_settlement FOR EACH ROW EXECUTE FUNCTION finance.guard_settlement_parent();
CREATE TRIGGER settlement_component_parent BEFORE INSERT ON finance.settlement_component FOR EACH ROW EXECUTE FUNCTION finance.guard_settlement_parent();

CREATE FUNCTION finance.validate_settlement_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE st finance.debt_settlement%ROWTYPE; r finance.action_revision%ROWTYPE; d finance.debt%ROWTYPE; sc record; p finance.posting%ROWTYPE; cp finance.posting%ROWTYPE; src finance.posting%ROWTYPE; kind text; counter_kind text; used numeric; mapped numeric;
BEGIN
 -- Check final state rather than the trigger's intermediate NEW snapshot.
 IF EXISTS(SELECT 1 FROM finance.action_revision ar WHERE ar.workspace_id=NEW.workspace_id AND ar.action_kind='debt_settlement' AND NOT EXISTS(SELECT 1 FROM finance.debt_settlement s WHERE s.workspace_id=ar.workspace_id AND s.action_revision_id=ar.id)) THEN RAISE EXCEPTION 'settlement action lacks typed evidence' USING ERRCODE='23514'; END IF;
 FOR st IN SELECT * FROM finance.debt_settlement WHERE workspace_id=NEW.workspace_id LOOP
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=st.workspace_id AND id=st.action_revision_id;
  SELECT * INTO d FROM finance.debt WHERE workspace_id=st.workspace_id AND id=st.debt_id;
  IF r.state<>'posted' OR r.action_kind<>'debt_settlement' OR r.change_kind<>'create' OR r.revision_no<>1 OR r.primary_effective_date<>st.settlement_date OR r.currency<>d.currency
    OR NOT EXISTS(SELECT 1 FROM finance.financial_action WHERE workspace_id=st.workspace_id AND id=st.action_id AND current_revision_id=r.id)
    OR d.lifecycle<>(CASE st.settlement_kind WHEN 'early' THEN 'settled_early' ELSE 'settled' END) OR d.closed_at IS NULL OR d.current_schedule_version_id<>st.closing_schedule_version_id
    OR st.settlement_date<d.start_date OR (d.opening_cutoff_date IS NOT NULL AND st.settlement_date<=d.opening_cutoff_date)
    THEN RAISE EXCEPTION 'settlement action, closure or date mismatch' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM audit.private_revision WHERE workspace_id=st.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=1 AND operation='create' AND after_json->>'actionKind'='debt_settlement' AND after_json->>'allocationConfirmed'='true') THEN RAISE EXCEPTION 'settlement requires confirmed immutable audit' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.debt_action_link WHERE workspace_id=st.workspace_id AND action_revision_id=r.id)<>1 OR NOT EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=st.workspace_id AND action_revision_id=r.id AND debt_id=d.id AND purpose='settlement') THEN RAISE EXCEPTION 'settlement requires one same-debt link' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.payment_reclassification WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'unrelated settlement detail' USING ERRCODE='23514'; END IF;
  IF (st.actual_cash_paid_minor>0 AND NOT EXISTS(SELECT 1 FROM finance.debt_payment_revision pr WHERE pr.workspace_id=st.workspace_id AND pr.payment_id=st.payment_id AND pr.debt_id=d.id AND pr.action_id=r.action_id AND pr.action_revision_id=r.id AND pr.actual_paid_minor=st.actual_cash_paid_minor AND pr.contractual_minor=st.confirmed_payoff_minor AND pr.allocation_certainty<>'unresolved'))
    OR (st.actual_cash_paid_minor=0 AND (st.payment_id IS NOT NULL OR st.confirmed_payoff_minor<>0 OR EXISTS(SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=st.workspace_id AND action_revision_id=r.id))) THEN RAISE EXCEPTION 'settlement payoff must share the same action' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.payment_component c JOIN finance.debt_payment_revision pr ON pr.workspace_id=c.workspace_id AND pr.id=c.payment_revision_id WHERE pr.workspace_id=st.workspace_id AND pr.action_revision_id=r.id AND c.disposition NOT IN ('liability_reduction','external_fee')) THEN RAISE EXCEPTION 'settlement payment cannot leave clearing or untyped charges' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM finance.debt_schedule_version s WHERE s.workspace_id=st.workspace_id AND s.debt_id=d.id AND s.id=st.closing_schedule_version_id AND s.state='finalized' AND s.revision_kind='settlement' AND s.previous_version_id=st.prior_schedule_version_id AND s.effective_date=st.settlement_date) THEN RAISE EXCEPTION 'settlement requires immutable closing version' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.scheduled_installment old FULL JOIN finance.scheduled_installment n ON n.workspace_id=old.workspace_id AND n.obligation_id=old.obligation_id AND n.schedule_version_id=st.closing_schedule_version_id WHERE old.workspace_id=st.workspace_id AND old.schedule_version_id=st.prior_schedule_version_id AND (n.id IS NULL OR old.contractual_minor<>n.contractual_minor OR old.due_date<>n.due_date OR old.opening_satisfied_minor<>n.opening_satisfied_minor OR old.known_principal_minor IS DISTINCT FROM n.known_principal_minor OR old.known_interest_minor IS DISTINCT FROM n.known_interest_minor OR old.known_fee_minor IS DISTINCT FROM n.known_fee_minor OR old.breakdown_complete<>n.breakdown_complete OR (old.disposition='cancelled' AND n.disposition<>'cancelled'))) OR (SELECT count(*) FROM finance.scheduled_installment WHERE workspace_id=st.workspace_id AND schedule_version_id=st.prior_schedule_version_id)<>(SELECT count(*) FROM finance.scheduled_installment WHERE workspace_id=st.workspace_id AND schedule_version_id=st.closing_schedule_version_id) THEN RAISE EXCEPTION 'closing version must preserve original terms and obligations' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.current_installment_due_v WHERE workspace_id=st.workspace_id AND debt_id=d.id AND remaining_minor<>0) OR EXISTS(SELECT 1 FROM finance.scheduled_installment i WHERE i.workspace_id=st.workspace_id AND i.schedule_version_id=st.closing_schedule_version_id AND i.disposition='cancelled' AND length(trim(i.cancellation_reason))=0) THEN RAISE EXCEPTION 'settlement leaves unpaid projections' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(amount_minor::numeric),0) INTO mapped FROM finance.schedule_allocation_map WHERE workspace_id=st.workspace_id AND target_schedule_version_id=st.closing_schedule_version_id AND target_kind='unapplied';
  IF mapped<>st.resolved_unapplied_minor THEN RAISE EXCEPTION 'settlement unapplied disposition must explain every remaining pool' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.posting x JOIN finance.journal j ON j.workspace_id=x.workspace_id AND j.id=x.journal_id WHERE x.workspace_id=st.workspace_id AND x.ledger_account_id IN (d.liability_ledger_account_id,d.clearing_ledger_account_id) AND j.state='posted' GROUP BY x.ledger_account_id HAVING sum(x.amount_minor::numeric)<>0) THEN RAISE EXCEPTION 'settlement requires accounting and clearing resolution' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.journal j JOIN finance.debt_action_link l ON l.workspace_id=j.workspace_id AND l.action_revision_id=j.action_revision_id WHERE l.workspace_id=st.workspace_id AND l.debt_id=d.id AND j.state='posted' AND j.effective_date>st.settlement_date) THEN RAISE EXCEPTION 'settlement cannot precede recognized debt activity' USING ERRCODE='23514'; END IF;
  FOR sc IN SELECT * FROM finance.settlement_component WHERE workspace_id=st.workspace_id AND settlement_id=st.id LOOP
   IF sc.component_kind='avoided_future_charge' THEN CONTINUE; END IF;
   IF sc.component_kind='rounding_correction' THEN RAISE EXCEPTION 'rounding corrections require a separately released explicit supported recipe' USING ERRCODE='23514'; END IF;
   SELECT * INTO p FROM finance.posting WHERE workspace_id=st.workspace_id AND id=sc.effect_posting_id;
   SELECT * INTO cp FROM finance.posting WHERE workspace_id=st.workspace_id AND id=sc.counter_posting_id;
   SELECT l.kind INTO counter_kind FROM finance.ledger_account l WHERE workspace_id=st.workspace_id AND id=cp.ledger_account_id;
   IF p.action_revision_id<>r.id OR cp.action_revision_id<>r.id OR p.journal_id<>cp.journal_id OR p.id=cp.id OR p.ledger_account_id<>d.liability_ledger_account_id OR p.liability_component<>sc.liability_component OR abs(p.amount_minor::numeric)<>sc.amount_minor OR p.amount_minor::numeric+cp.amount_minor<>0 THEN RAISE EXCEPTION 'settlement adjustment posting mismatch' USING ERRCODE='23514'; END IF;
   IF sc.component_kind='recognized_charge' THEN
    IF p.amount_minor>=0 OR counter_kind<>'expense' OR cp.expense_class<>'gross' OR sc.liability_component NOT IN ('interest','fee','penalty') OR sc.unknown_opening OR sc.recognized_source_posting_id IS DISTINCT FROM cp.id THEN RAISE EXCEPTION 'settlement charge requires newly recognized expense evidence' USING ERRCODE='23514'; END IF;
    IF sc.liability_component='fee' AND NOT EXISTS(SELECT 1 FROM finance.fee_component f WHERE f.workspace_id=st.workspace_id AND f.action_revision_id=r.id AND f.expense_posting_id=cp.id AND f.amount_minor=sc.amount_minor AND f.bearing_ledger_account_id=d.liability_ledger_account_id AND f.treatment='capitalized' AND f.effective_date=st.settlement_date) THEN RAISE EXCEPTION 'settlement charge fee evidence missing' USING ERRCODE='23514'; END IF;
   ELSE
    IF p.amount_minor<=0 THEN RAISE EXCEPTION 'waiver must reduce recognized liability' USING ERRCODE='23514'; END IF;
    IF sc.unknown_opening THEN
     IF sc.recognized_source_posting_id IS NOT NULL OR counter_kind<>'adjustment_equity' OR d.opening_cutoff_date IS NULL OR NOT EXISTS(SELECT 1 FROM finance.posting op JOIN finance.debt_action_link ol ON ol.workspace_id=op.workspace_id AND ol.action_revision_id=op.action_revision_id WHERE op.workspace_id=st.workspace_id AND ol.debt_id=d.id AND ol.purpose='opening' AND op.ledger_account_id=d.liability_ledger_account_id AND op.liability_component=sc.liability_component GROUP BY op.liability_component HAVING -sum(op.amount_minor::numeric)>=sc.amount_minor) THEN RAISE EXCEPTION 'unknown imported waiver requires disclosed opening adjustment evidence' USING ERRCODE='23514'; END IF;
    ELSE
     SELECT x.* INTO src FROM finance.posting x JOIN finance.journal j ON j.workspace_id=x.workspace_id AND j.id=x.journal_id JOIN finance.financial_action a ON a.workspace_id=x.workspace_id AND a.current_revision_id=x.action_revision_id JOIN finance.debt_action_link l ON l.workspace_id=x.workspace_id AND l.action_revision_id=x.action_revision_id JOIN finance.ledger_account la ON la.workspace_id=x.workspace_id AND la.id=x.ledger_account_id WHERE x.workspace_id=st.workspace_id AND x.id=sc.recognized_source_posting_id AND l.debt_id=d.id AND l.purpose='charge' AND j.state='posted' AND la.kind='expense' AND x.expense_class='gross' AND x.amount_minor>0 AND j.effective_date<=st.settlement_date AND EXISTS(SELECT 1 FROM finance.posting lp WHERE lp.workspace_id=x.workspace_id AND lp.action_revision_id=x.action_revision_id AND lp.ledger_account_id=d.liability_ledger_account_id AND lp.liability_component=sc.liability_component AND lp.amount_minor::numeric=-x.amount_minor::numeric);
     IF NOT FOUND OR counter_kind<>'expense' OR cp.expense_class<>'waiver_offset' OR cp.ledger_account_id<>src.ledger_account_id OR cp.category_id IS DISTINCT FROM src.category_id THEN RAISE EXCEPTION 'recognized waiver must offset its identified eligible charge' USING ERRCODE='23514'; END IF;
     SELECT sum(amount_minor::numeric) INTO used FROM finance.settlement_component WHERE workspace_id=st.workspace_id AND component_kind='recognized_waiver' AND recognized_source_posting_id=src.id;
     IF used>src.amount_minor THEN RAISE EXCEPTION 'recognized charge cannot be waived twice' USING ERRCODE='23514'; END IF;
    END IF;
   END IF;
  END LOOP;
  -- Every noncash posting is covered once by typed payment/adjustment evidence.
  IF EXISTS(SELECT 1 FROM finance.posting x JOIN finance.ledger_account l ON l.workspace_id=x.workspace_id AND l.id=x.ledger_account_id WHERE x.workspace_id=st.workspace_id AND x.action_revision_id=r.id AND l.kind<>'cash_asset' AND (SELECT count(*) FROM (SELECT c.posting_id AS id FROM finance.payment_component c JOIN finance.debt_payment_revision pr ON pr.workspace_id=c.workspace_id AND pr.id=c.payment_revision_id WHERE c.workspace_id=st.workspace_id AND pr.action_revision_id=r.id UNION ALL SELECT sc.effect_posting_id FROM finance.settlement_component sc WHERE sc.workspace_id=st.workspace_id AND sc.settlement_id=st.id UNION ALL SELECT sc.counter_posting_id FROM finance.settlement_component sc WHERE sc.workspace_id=st.workspace_id AND sc.settlement_id=st.id) evidence WHERE evidence.id=x.id)<>1) THEN RAISE EXCEPTION 'settlement has unexplained or double-used posting' USING ERRCODE='23514'; END IF;
  IF st.actual_cash_paid_minor=0 AND EXISTS(SELECT 1 FROM finance.posting x JOIN finance.ledger_account l ON l.workspace_id=x.workspace_id AND l.id=x.ledger_account_id WHERE x.workspace_id=st.workspace_id AND x.action_revision_id=r.id AND l.kind='cash_asset') THEN RAISE EXCEPTION 'zero cash settlement cannot deduct cash' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.posting x JOIN finance.ledger_account l ON l.workspace_id=x.workspace_id AND l.id=x.ledger_account_id WHERE x.workspace_id=st.workspace_id AND x.action_revision_id=r.id AND l.kind='cash_asset' GROUP BY x.cash_flow_kind HAVING count(*)<>1) THEN RAISE EXCEPTION 'settlement cash deduction duplicated' USING ERRCODE='23514'; END IF;
  IF (SELECT COALESCE(sum(sc.amount_minor::numeric),0) FROM finance.settlement_component sc WHERE sc.workspace_id=st.workspace_id AND sc.settlement_id=st.id AND sc.component_kind='avoided_future_charge') > (SELECT COALESCE(sum(i.contractual_minor::numeric-i.opening_satisfied_minor-i.payment_satisfied_minor),0) FROM finance.current_installment_due_v i WHERE i.workspace_id=st.workspace_id AND i.debt_id=d.id AND i.disposition='cancelled') THEN RAISE EXCEPTION 'avoided charges exceed cancelled contractual remainder' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END; $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['debt_settlement','settlement_component','action_revision','debt','posting','debt_schedule_version','schedule_allocation_map','financial_action'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON finance.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_settlement_state()',t||'_settlement_integrity',t);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION finance.guard_settlement_parent(),finance.validate_settlement_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_settlement_parent(),finance.validate_settlement_state() TO app_domain;
