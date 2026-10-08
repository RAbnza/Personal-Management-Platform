/* D10: explicit supported rounding, provider-confirmed evidence, and preserved satisfaction. */
CREATE OR REPLACE FUNCTION finance.validate_settlement_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE st finance.debt_settlement%ROWTYPE; r finance.action_revision%ROWTYPE; d finance.debt%ROWTYPE; v_component record; p finance.posting%ROWTYPE; cp finance.posting%ROWTYPE; src finance.posting%ROWTYPE; kind text; counter_kind text; treatment text; intent jsonb; expected_components jsonb; actual_components jsonb; used numeric; mapped numeric;
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
  SELECT after_json INTO intent FROM audit.private_revision WHERE workspace_id=st.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=1;
  IF COALESCE(jsonb_typeof(intent->'adjustments'),'')<>'array' OR intent->>'actualCashPaidMinor' IS DISTINCT FROM st.actual_cash_paid_minor::text OR intent->>'confirmedPayoffMinor' IS DISTINCT FROM st.confirmed_payoff_minor::text OR intent->>'confirmationNote' IS DISTINCT FROM st.confirmation_note THEN RAISE EXCEPTION 'settlement audit intent mismatch' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO expected_components FROM (SELECT value-'categoryId'-'recognizedSourcePostingId' AS value FROM jsonb_array_elements(intent->'adjustments')) normalized;
  SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) INTO actual_components FROM (SELECT jsonb_build_object('kind',c.component_kind,'liabilityComponent',c.liability_component,'amountMinor',c.amount_minor::text,'roundingTreatment',c.rounding_treatment,'unknownOpening',c.unknown_opening,'explanation',c.explanation,'providerConfirmed',true) AS value FROM finance.settlement_component c WHERE c.workspace_id=st.workspace_id AND c.settlement_id=st.id) normalized;
  IF expected_components<>actual_components THEN RAISE EXCEPTION 'settlement components require exact provider-confirmed audit intent' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.debt_action_link WHERE workspace_id=st.workspace_id AND action_revision_id=r.id)<>1 OR NOT EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=st.workspace_id AND action_revision_id=r.id AND debt_id=d.id AND purpose='settlement') THEN RAISE EXCEPTION 'settlement requires one same-debt link' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.payment_reclassification WHERE workspace_id=st.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'unrelated settlement detail' USING ERRCODE='23514'; END IF;
  IF (st.actual_cash_paid_minor>0 AND NOT EXISTS(SELECT 1 FROM finance.debt_payment_revision pr WHERE pr.workspace_id=st.workspace_id AND pr.payment_id=st.payment_id AND pr.debt_id=d.id AND pr.action_id=r.action_id AND pr.action_revision_id=r.id AND pr.actual_paid_minor=st.actual_cash_paid_minor AND pr.contractual_minor=st.confirmed_payoff_minor AND pr.allocation_certainty<>'unresolved'))
    OR (st.actual_cash_paid_minor=0 AND (st.payment_id IS NOT NULL OR st.confirmed_payoff_minor<>0 OR EXISTS(SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=st.workspace_id AND action_revision_id=r.id))) THEN RAISE EXCEPTION 'settlement payoff must share the same action' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.payment_component c JOIN finance.debt_payment_revision pr ON pr.workspace_id=c.workspace_id AND pr.id=c.payment_revision_id WHERE pr.workspace_id=st.workspace_id AND pr.action_revision_id=r.id AND c.disposition NOT IN ('liability_reduction','external_fee')) THEN RAISE EXCEPTION 'settlement payment cannot leave clearing or untyped charges' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM finance.debt_schedule_version s WHERE s.workspace_id=st.workspace_id AND s.debt_id=d.id AND s.id=st.closing_schedule_version_id AND s.state='finalized' AND s.revision_kind='settlement' AND s.previous_version_id=st.prior_schedule_version_id AND s.effective_date=st.settlement_date) THEN RAISE EXCEPTION 'settlement requires immutable closing version' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.scheduled_installment prior_entry LEFT JOIN finance.scheduled_installment n ON n.workspace_id=prior_entry.workspace_id AND n.obligation_id=prior_entry.obligation_id AND n.schedule_version_id=st.closing_schedule_version_id WHERE prior_entry.workspace_id=st.workspace_id AND prior_entry.schedule_version_id=st.prior_schedule_version_id AND (n.id IS NULL OR prior_entry.contractual_minor<>n.contractual_minor OR prior_entry.due_date<>n.due_date OR prior_entry.opening_satisfied_minor<>n.opening_satisfied_minor OR prior_entry.known_principal_minor IS DISTINCT FROM n.known_principal_minor OR prior_entry.known_interest_minor IS DISTINCT FROM n.known_interest_minor OR prior_entry.known_fee_minor IS DISTINCT FROM n.known_fee_minor OR prior_entry.breakdown_complete<>n.breakdown_complete OR (prior_entry.disposition='cancelled' AND n.disposition<>'cancelled'))) OR (SELECT count(*) FROM finance.scheduled_installment WHERE workspace_id=st.workspace_id AND schedule_version_id=st.prior_schedule_version_id)<>(SELECT count(*) FROM finance.scheduled_installment WHERE workspace_id=st.workspace_id AND schedule_version_id=st.closing_schedule_version_id) THEN RAISE EXCEPTION 'closing version must preserve original terms and obligations' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.current_installment_due_v WHERE workspace_id=st.workspace_id AND debt_id=d.id AND remaining_minor<>0) OR EXISTS(SELECT 1 FROM finance.scheduled_installment i WHERE i.workspace_id=st.workspace_id AND i.schedule_version_id=st.closing_schedule_version_id AND i.disposition='cancelled' AND length(trim(i.cancellation_reason))=0) THEN RAISE EXCEPTION 'settlement leaves unpaid projections' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.scheduled_installment prior_entry JOIN finance.current_installment_due_v n ON n.workspace_id=prior_entry.workspace_id AND n.obligation_id=prior_entry.obligation_id WHERE prior_entry.workspace_id=st.workspace_id AND prior_entry.schedule_version_id=st.prior_schedule_version_id AND n.debt_id=d.id AND n.payment_satisfied_minor < COALESCE((SELECT sum(alloc.amount_minor::numeric) FROM finance.payment_due_allocation alloc JOIN finance.debt_payment_revision pr ON pr.workspace_id=alloc.workspace_id AND pr.id=alloc.payment_revision_id JOIN finance.financial_action a ON a.workspace_id=pr.workspace_id AND a.current_revision_id=pr.action_revision_id JOIN finance.action_revision ar ON ar.workspace_id=a.workspace_id AND ar.id=a.current_revision_id AND ar.change_kind<>'void' WHERE alloc.workspace_id=st.workspace_id AND alloc.installment_id=prior_entry.id AND pr.paid_against_schedule_version_id=st.prior_schedule_version_id),0)+COALESCE((SELECT sum(m.amount_minor::numeric) FROM finance.schedule_allocation_map m JOIN finance.debt_payment_revision pr ON pr.workspace_id=m.workspace_id AND pr.id=m.payment_revision_id JOIN finance.financial_action a ON a.workspace_id=pr.workspace_id AND a.current_revision_id=pr.action_revision_id JOIN finance.action_revision ar ON ar.workspace_id=a.workspace_id AND ar.id=a.current_revision_id AND ar.change_kind<>'void' WHERE m.workspace_id=st.workspace_id AND m.target_installment_id=prior_entry.id AND pr.paid_against_schedule_version_id<>st.prior_schedule_version_id),0)) THEN RAISE EXCEPTION 'closing schedule cannot lose historical payment satisfaction' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(amount_minor::numeric),0) INTO mapped FROM finance.schedule_allocation_map WHERE workspace_id=st.workspace_id AND target_schedule_version_id=st.closing_schedule_version_id AND target_kind='unapplied';
  IF mapped<>st.resolved_unapplied_minor THEN RAISE EXCEPTION 'settlement unapplied disposition must explain every remaining pool' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.posting x JOIN finance.journal j ON j.workspace_id=x.workspace_id AND j.id=x.journal_id WHERE x.workspace_id=st.workspace_id AND x.ledger_account_id IN (d.liability_ledger_account_id,d.clearing_ledger_account_id) AND j.state='posted' GROUP BY x.ledger_account_id HAVING sum(x.amount_minor::numeric)<>0) THEN RAISE EXCEPTION 'settlement requires accounting and clearing resolution' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.journal j JOIN finance.debt_action_link l ON l.workspace_id=j.workspace_id AND l.action_revision_id=j.action_revision_id WHERE l.workspace_id=st.workspace_id AND l.debt_id=d.id AND j.state='posted' AND j.effective_date>st.settlement_date) THEN RAISE EXCEPTION 'settlement cannot precede recognized debt activity' USING ERRCODE='23514'; END IF;
  FOR v_component IN SELECT * FROM finance.settlement_component WHERE workspace_id=st.workspace_id AND settlement_id=st.id LOOP
   IF v_component.component_kind='avoided_future_charge' THEN CONTINUE; END IF;
   treatment:=CASE WHEN v_component.component_kind='rounding_correction' THEN v_component.rounding_treatment ELSE v_component.component_kind END;
   IF treatment IS NULL OR treatment NOT IN ('recognized_charge','recognized_waiver') THEN RAISE EXCEPTION 'unsupported adjustment treatment' USING ERRCODE='23514'; END IF;
   SELECT * INTO p FROM finance.posting WHERE workspace_id=st.workspace_id AND id=v_component.effect_posting_id;
   SELECT * INTO cp FROM finance.posting WHERE workspace_id=st.workspace_id AND id=v_component.counter_posting_id;
   SELECT l.kind INTO counter_kind FROM finance.ledger_account l WHERE workspace_id=st.workspace_id AND id=cp.ledger_account_id;
   IF p.action_revision_id<>r.id OR cp.action_revision_id<>r.id OR p.journal_id<>cp.journal_id OR p.id=cp.id OR p.ledger_account_id<>d.liability_ledger_account_id OR p.liability_component IS DISTINCT FROM v_component.liability_component OR abs(p.amount_minor::numeric)<>v_component.amount_minor OR p.amount_minor::numeric+cp.amount_minor<>0 THEN RAISE EXCEPTION 'settlement adjustment posting mismatch' USING ERRCODE='23514'; END IF;
   IF treatment='recognized_charge' THEN
    IF p.amount_minor>=0 OR counter_kind<>'expense' OR cp.expense_class<>'gross' OR v_component.liability_component NOT IN ('interest','fee','penalty') OR v_component.unknown_opening OR v_component.recognized_source_posting_id IS DISTINCT FROM cp.id THEN RAISE EXCEPTION 'settlement charge requires newly recognized expense evidence' USING ERRCODE='23514'; END IF;
    IF v_component.liability_component='fee' AND NOT EXISTS(SELECT 1 FROM finance.fee_component f WHERE f.workspace_id=st.workspace_id AND f.action_revision_id=r.id AND f.expense_posting_id=cp.id AND f.amount_minor=v_component.amount_minor AND f.bearing_ledger_account_id=d.liability_ledger_account_id AND f.treatment='capitalized' AND f.effective_date=st.settlement_date) THEN RAISE EXCEPTION 'settlement charge fee evidence missing' USING ERRCODE='23514'; END IF;
   ELSE
    IF p.amount_minor<=0 THEN RAISE EXCEPTION 'waiver must reduce recognized liability' USING ERRCODE='23514'; END IF;
    IF v_component.unknown_opening THEN
     IF (SELECT sum(c.amount_minor::numeric) FROM finance.settlement_component c WHERE c.workspace_id=st.workspace_id AND c.settlement_id=st.id AND c.unknown_opening AND c.liability_component=v_component.liability_component) > (SELECT COALESCE(-sum(op.amount_minor::numeric),0) FROM finance.posting op JOIN finance.debt_action_link ol ON ol.workspace_id=op.workspace_id AND ol.action_revision_id=op.action_revision_id WHERE op.workspace_id=st.workspace_id AND ol.debt_id=d.id AND ol.purpose='opening' AND op.ledger_account_id=d.liability_ledger_account_id AND op.liability_component=v_component.liability_component) THEN RAISE EXCEPTION 'opening waivers exceed recognized opening source' USING ERRCODE='23514'; END IF;
     IF v_component.recognized_source_posting_id IS NOT NULL OR counter_kind<>'adjustment_equity' OR d.opening_cutoff_date IS NULL OR NOT EXISTS(SELECT 1 FROM finance.posting op JOIN finance.debt_action_link ol ON ol.workspace_id=op.workspace_id AND ol.action_revision_id=op.action_revision_id WHERE op.workspace_id=st.workspace_id AND ol.debt_id=d.id AND ol.purpose='opening' AND op.ledger_account_id=d.liability_ledger_account_id AND op.liability_component=v_component.liability_component GROUP BY op.liability_component HAVING -sum(op.amount_minor::numeric)>=v_component.amount_minor) THEN RAISE EXCEPTION 'unknown imported waiver requires disclosed opening adjustment evidence' USING ERRCODE='23514'; END IF;
    ELSE
     SELECT x.* INTO src FROM finance.posting x JOIN finance.journal j ON j.workspace_id=x.workspace_id AND j.id=x.journal_id JOIN finance.financial_action a ON a.workspace_id=x.workspace_id AND a.current_revision_id=x.action_revision_id JOIN finance.debt_action_link l ON l.workspace_id=x.workspace_id AND l.action_revision_id=x.action_revision_id JOIN finance.ledger_account la ON la.workspace_id=x.workspace_id AND la.id=x.ledger_account_id WHERE x.workspace_id=st.workspace_id AND x.id=v_component.recognized_source_posting_id AND l.debt_id=d.id AND l.purpose IN ('charge','borrowing') AND j.state='posted' AND la.kind='expense' AND x.expense_class='gross' AND x.amount_minor>0 AND j.effective_date<=st.settlement_date AND EXISTS(SELECT 1 FROM finance.posting lp WHERE lp.workspace_id=x.workspace_id AND lp.action_revision_id=x.action_revision_id AND lp.ledger_account_id=d.liability_ledger_account_id AND lp.liability_component=v_component.liability_component AND lp.amount_minor::numeric=-x.amount_minor::numeric);
     IF NOT FOUND OR counter_kind<>'expense' OR cp.expense_class<>'waiver_offset' OR cp.ledger_account_id<>src.ledger_account_id OR cp.category_id IS DISTINCT FROM src.category_id THEN RAISE EXCEPTION 'recognized waiver must offset its identified eligible charge' USING ERRCODE='23514'; END IF;
     SELECT sum(amount_minor::numeric) INTO used FROM finance.settlement_component WHERE workspace_id=st.workspace_id AND (component_kind='recognized_waiver' OR (component_kind='rounding_correction' AND rounding_treatment='recognized_waiver')) AND recognized_source_posting_id=src.id;
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
        AND NOT (r.action_kind='debt_settlement' AND EXISTS (SELECT 1 FROM finance.settlement_component sc JOIN finance.debt_settlement st ON st.workspace_id=sc.workspace_id AND st.id=sc.settlement_id WHERE st.workspace_id=r.workspace_id AND st.action_revision_id=r.id AND (sc.component_kind='recognized_charge' OR (sc.component_kind='rounding_correction' AND sc.rounding_treatment='recognized_charge')) AND sc.counter_posting_id=f.expense_posting_id AND sc.liability_component='fee'))) THEN
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
