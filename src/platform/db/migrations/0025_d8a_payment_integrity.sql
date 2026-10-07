/* D8a, Database Architecture §§5.4, 7.2–7.3, 17–18.
 * Evidence never creates another financial effect. All arithmetic accumulates
 * as numeric; mutation roots serialize on the existing workspace guard.
 * No payment service, schedule-revision workflow, or settlement is released.
 */

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['debt_payment','debt_payment_revision',
    'payment_component','payment_due_allocation','schedule_allocation_map',
    'payment_reclassification'] LOOP
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

CREATE FUNCTION finance.guard_payment_evidence_parent()
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
  IF v_kind IS DISTINCT FROM (CASE WHEN TG_TABLE_NAME = 'payment_reclassification'
    THEN 'payment_reclassification' ELSE 'debt_payment' END) THEN
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['debt_payment','debt_payment_revision',
    'payment_component','payment_due_allocation','schedule_allocation_map',
    'payment_reclassification'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON finance.%I
      FOR EACH ROW EXECUTE FUNCTION finance.guard_payment_evidence_parent()', t || '_parent_guard', t);
  END LOOP;
END;
$$;

/* Validate a newly finalized economic revision, including typed coverage.
 * Generic revision/reversal/receipt validators remain in force for corrections.
 */
CREATE FUNCTION finance.validate_payment_revision_recipe()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  r finance.action_revision%ROWTYPE;
  p finance.debt_payment_revision%ROWTYPE;
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
  IF r.action_kind NOT IN ('debt_payment','payment_reclassification') THEN RETURN NULL; END IF;
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
      AND purpose = CASE r.action_kind WHEN 'debt_payment' THEN 'payment' ELSE 'reclassification' END;
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

  IF r.action_kind = 'debt_payment' THEN
    SELECT * INTO p FROM finance.debt_payment_revision
      WHERE workspace_id = r.workspace_id AND action_revision_id = r.id;
    IF NOT FOUND OR p.debt_id <> d.id THEN
      RAISE EXCEPTION 'payment requires same-debt revision evidence' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_reclassification WHERE workspace_id = r.workspace_id AND action_revision_id = r.id) THEN
      RAISE EXCEPTION 'payment cannot contain reclassification evidence' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO a FROM finance.financial_account WHERE workspace_id = r.workspace_id AND id = p.paying_account_id;
    IF NOT FOUND OR a.currency <> r.currency OR r.primary_effective_date <= a.opening_cutoff_date
      OR (r.change_kind = 'create' AND a.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'payment paying account or cutoff invalid' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM finance.debt_schedule_version WHERE workspace_id = r.workspace_id
      AND debt_id = d.id AND id = p.paid_against_schedule_version_id AND state = 'finalized') THEN
      RAISE EXCEPTION 'payment schedule context must be finalized' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount_minor::numeric),0),
      COALESCE(sum(amount_minor::numeric) FILTER (WHERE disposition = 'external_fee'),0)
      INTO v_total, v_external FROM finance.payment_component
      WHERE workspace_id = r.workspace_id AND payment_revision_id = p.id;
    IF v_total <> p.actual_paid_minor OR v_external <> p.external_fee_minor THEN
      RAISE EXCEPTION 'payment component or external-fee totals mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(amount_minor::numeric),0) INTO v_total FROM finance.payment_due_allocation
      WHERE workspace_id = r.workspace_id AND payment_revision_id = p.id;
    IF v_total + p.unapplied_contractual_minor <> p.contractual_minor THEN
      RAISE EXCEPTION 'due allocations plus unapplied must equal contractual payment' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment_due_allocation x JOIN finance.scheduled_installment i
      ON i.workspace_id = x.workspace_id AND i.id = x.installment_id
      WHERE x.workspace_id = r.workspace_id AND x.payment_revision_id = p.id
        AND (x.schedule_version_id <> p.paid_against_schedule_version_id OR i.disposition <> 'scheduled')) THEN
      RAISE EXCEPTION 'due allocation must use the payment schedule and a scheduled obligation' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM finance.payment_component c
      JOIN finance.posting x ON x.workspace_id = c.workspace_id AND x.id = c.posting_id
      JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      JOIN finance.ledger_account l ON l.workspace_id = x.workspace_id AND l.id = x.ledger_account_id
      LEFT JOIN finance.fee_component f ON f.workspace_id = c.workspace_id AND f.id = c.fee_component_id
      WHERE c.workspace_id = r.workspace_id AND c.payment_revision_id = p.id AND (
        x.action_revision_id <> r.id OR j.role <> 'economic' OR x.amount_minor <> c.amount_minor
        OR CASE c.disposition
          WHEN 'liability_reduction' THEN l.kind <> 'debt_liability' OR l.id <> d.liability_ledger_account_id
            OR (p.allocation_certainty = 'confirmed_total' AND x.liability_component <> 'unclassified')
          WHEN 'clearing' THEN l.kind <> 'payment_clearing_asset' OR l.id IS DISTINCT FROM d.clearing_ledger_account_id
            OR p.allocation_certainty <> 'unresolved'
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
        WHERE c.workspace_id = f.workspace_id AND c.payment_revision_id = p.id AND c.fee_component_id = f.id)) THEN
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
          WHERE c.workspace_id = x.workspace_id AND c.payment_revision_id = p.id AND c.posting_id = x.id)))) THEN
      RAISE EXCEPTION 'payment has an unexplained economic posting' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(-x.amount_minor::numeric) FILTER (WHERE x.cash_flow_kind = 'debt_payment'),0),
      COALESCE(sum(-x.amount_minor::numeric) FILTER (WHERE x.cash_flow_kind = 'fee'),0)
      INTO v_total, v_external FROM finance.posting x JOIN finance.journal j
        ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE x.workspace_id = r.workspace_id AND x.action_revision_id = r.id AND j.role = 'economic';
    IF v_total <> p.contractual_minor OR v_external <> p.external_fee_minor THEN
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
      JOIN finance.debt_payment_revision p ON p.workspace_id = s.workspace_id AND p.id = s.payment_revision_id
      JOIN finance.posting x ON x.workspace_id = c.workspace_id AND x.id = c.clearing_credit_posting_id
      JOIN finance.journal j ON j.workspace_id = x.workspace_id AND j.id = x.journal_id
      WHERE c.workspace_id = r.workspace_id AND c.action_revision_id = r.id AND (
        c.debt_id <> d.id OR p.payment_id <> c.payment_id OR s.disposition NOT IN ('clearing','advance')
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

/* Validate effective state after pointer transitions, payment corrections,
 * reclassification corrections, and schedule finalization. Historic evidence
 * is retained; only current nonvoid revisions contribute to satisfaction.
 */
CREATE FUNCTION finance.validate_payment_workspace_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  w uuid := NEW.workspace_id;
  p record;
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
    WHERE p.workspace_id = w AND (r.action_kind <> 'debt_payment'
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
  FOR p IN SELECT v.*, d.current_schedule_version_id AS target_id, ts.version_no AS target_no,
      ss.version_no AS source_no FROM finance.debt_payment_revision v
    JOIN finance.financial_action a ON a.workspace_id = v.workspace_id AND a.current_revision_id = v.action_revision_id
    JOIN finance.action_revision r ON r.workspace_id = a.workspace_id AND r.id = a.current_revision_id AND r.change_kind <> 'void'
    JOIN finance.debt d ON d.workspace_id = v.workspace_id AND d.id = v.debt_id
    JOIN finance.debt_schedule_version ts ON ts.workspace_id = d.workspace_id AND ts.id = d.current_schedule_version_id
    JOIN finance.debt_schedule_version ss ON ss.workspace_id = v.workspace_id AND ss.id = v.paid_against_schedule_version_id
    WHERE v.workspace_id = w LOOP
    IF p.source_no > p.target_no THEN
      RAISE EXCEPTION 'payment schedule cannot follow current schedule' USING ERRCODE = '23514';
    END IF;
    IF p.source_no = p.target_no THEN
      IF EXISTS (SELECT 1 FROM finance.schedule_allocation_map WHERE workspace_id = w
        AND target_schedule_version_id = p.target_id AND payment_revision_id = p.id) THEN
        RAISE EXCEPTION 'direct and mapped allocation paths cannot overlap' USING ERRCODE = '23514';
      END IF;
    ELSE
      FOR pool IN SELECT id, amount_minor FROM finance.payment_due_allocation
        WHERE workspace_id = w AND payment_revision_id = p.id
        UNION ALL SELECT NULL::uuid, p.unapplied_contractual_minor LOOP
        SELECT COALESCE(sum(amount_minor::numeric),0) INTO v_total FROM finance.schedule_allocation_map
          WHERE workspace_id = w AND target_schedule_version_id = p.target_id AND payment_revision_id = p.id
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
      > i.contractual_minor OR (i.disposition = 'cancelled' AND EXISTS (SELECT 1 FROM finance.schedule_allocation_map m
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
      WHERE v.workspace_id = w AND v.debt_id = d.id AND v.unapplied_contractual_minor > 0))) THEN
    RAISE EXCEPTION 'debt cannot close with unresolved clearing or unapplied contractual allocation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['debt_payment','debt_payment_revision','payment_component',
    'payment_due_allocation','schedule_allocation_map','payment_reclassification',
    'debt_schedule_version','debt','financial_action','action_revision'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON finance.%I
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION finance.validate_payment_workspace_state()', t || '_payment_state_integrity', t);
  END LOOP;
END;
$$;

DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity
AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification'))
EXECUTE FUNCTION finance.validate_s1_revision_recipe();

CREATE CONSTRAINT TRIGGER action_revision_payment_recipe_integrity
AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finance.validate_payment_revision_recipe();

REVOKE ALL ON FUNCTION finance.guard_payment_evidence_parent(),
  finance.validate_payment_revision_recipe(), finance.validate_payment_workspace_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_payment_evidence_parent(),
  finance.validate_payment_revision_recipe(), finance.validate_payment_workspace_state() TO app_domain;
