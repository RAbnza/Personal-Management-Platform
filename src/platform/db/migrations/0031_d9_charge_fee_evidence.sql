/* D9 follow-up: require explicit confirmation even for missing JSON fields, and typed capitalized fee evidence. */
CREATE OR REPLACE FUNCTION finance.validate_debt_charge_recipe()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.debt%ROWTYPE; intent jsonb; charge_amount bigint; charge_kind text;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
  IF NOT FOUND OR r.action_kind<>'debt_charge' THEN RETURN NULL; END IF;
  IF r.state<>'posted' OR r.change_kind<>'create' OR r.revision_no<>1 THEN
    RAISE EXCEPTION 'debt charge requires a finalized explicit create action' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>1 THEN
    RAISE EXCEPTION 'debt charge requires one debt link' USING ERRCODE='23514'; END IF;
  SELECT debt.* INTO d FROM finance.debt debt JOIN finance.debt_action_link l ON l.workspace_id=debt.workspace_id AND l.debt_id=debt.id
    WHERE l.workspace_id=r.workspace_id AND l.action_revision_id=r.id AND l.purpose='charge';
  IF NOT FOUND OR d.lifecycle<>'active' OR d.currency<>r.currency OR r.primary_effective_date<d.start_date
    OR (d.opening_cutoff_date IS NOT NULL AND r.primary_effective_date<=d.opening_cutoff_date) THEN
    RAISE EXCEPTION 'debt charge context invalid' USING ERRCODE='23514'; END IF;
  SELECT after_json INTO intent FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id
    AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=1 AND operation='create';
  IF NOT FOUND OR COALESCE(intent->>'providerConfirmed','')<>'true' OR COALESCE(intent->>'actionKind','')<>'debt_charge'
    OR intent->>'debtId' IS DISTINCT FROM d.id::text OR COALESCE(length(trim(intent->>'explanation')),0)=0
    OR COALESCE(intent->>'amountMinor','') !~ '^[1-9][0-9]{0,11}$' THEN
    RAISE EXCEPTION 'debt charge requires explicit provider-confirmed audit evidence' USING ERRCODE='23514'; END IF;
  charge_amount:=(intent->>'amountMinor')::bigint; charge_kind:=intent->>'kind';
  IF charge_amount>100000000000 OR charge_kind NOT IN ('interest','fee','penalty') OR charge_kind IS NULL THEN
    RAISE EXCEPTION 'unsupported debt charge' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND state='posted' AND role='economic' AND effective_date=r.primary_effective_date)<>1
    OR (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>1
    OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>2
    OR (SELECT count(*) FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id
      WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND l.kind='expense' AND p.amount_minor=charge_amount AND p.expense_class='gross'
      AND p.category_id IS NOT DISTINCT FROM (intent->>'categoryId')::uuid)<>1
    OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND ledger_account_id=d.liability_ledger_account_id
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
