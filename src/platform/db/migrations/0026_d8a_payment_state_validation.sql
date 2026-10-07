/* Follow-up to the first test application: avoid PL/pgSQL record/table-alias
 * collisions. Applied migrations stay immutable. */
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
        WHERE c.workspace_id = f.workspace_id AND c.payment_revision_id = v_payment.id AND c.fee_component_id = f.id)) THEN
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
          WHERE c.workspace_id = x.workspace_id AND c.payment_revision_id = v_payment.id AND c.posting_id = x.id)))) THEN
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
      WHERE v.workspace_id = w AND v.debt_id = d.id AND (
        (v.paid_against_schedule_version_id = d.current_schedule_version_id AND v.unapplied_contractual_minor > 0)
        OR EXISTS (SELECT 1 FROM finance.schedule_allocation_map m WHERE m.workspace_id = w
          AND m.payment_revision_id = v.id AND m.target_schedule_version_id = d.current_schedule_version_id AND m.target_kind = 'unapplied'))))) THEN
    RAISE EXCEPTION 'debt cannot close with unresolved clearing or unapplied contractual allocation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


/* Surviving obligations carry their historical opening satisfaction exactly;
 * payment satisfaction must travel through allocations, never a copied baseline. */
CREATE FUNCTION finance.validate_schedule_opening_carry()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE s finance.debt_schedule_version%ROWTYPE;
BEGIN
  SELECT * INTO s FROM finance.debt_schedule_version WHERE workspace_id = NEW.workspace_id AND id = NEW.id;
  IF NOT FOUND OR s.version_no = 1 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM finance.scheduled_installment i
    LEFT JOIN finance.scheduled_installment old_entry ON old_entry.workspace_id = i.workspace_id
      AND old_entry.debt_id = i.debt_id AND old_entry.schedule_version_id = s.previous_version_id
      AND old_entry.obligation_id = i.obligation_id
    WHERE i.workspace_id = s.workspace_id AND i.schedule_version_id = s.id
      AND i.opening_satisfied_minor <> COALESCE(old_entry.opening_satisfied_minor,0)) THEN
    RAISE EXCEPTION 'schedule revision cannot invent or alter historical opening satisfaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER debt_schedule_opening_carry_integrity
AFTER INSERT OR UPDATE ON finance.debt_schedule_version DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finance.validate_schedule_opening_carry();
REVOKE ALL ON FUNCTION finance.validate_schedule_opening_carry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_schedule_opening_carry() TO app_domain;

