-- Custom SQL migration file, put your code below! --
/* D9: preserve predecessor terms for correction kinds and prevent loss of
 * imported opening evidence. Existing D8a guards prove pool exhaustiveness,
 * same-debt targets, current sources, no double allocation and nonnegative dues. */
CREATE FUNCTION finance.validate_schedule_revision_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s finance.debt_schedule_version%ROWTYPE;
BEGIN
  SELECT * INTO s FROM finance.debt_schedule_version WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
  IF NOT FOUND OR s.version_no=1 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM finance.scheduled_installment o
    WHERE o.workspace_id=s.workspace_id AND o.schedule_version_id=s.previous_version_id AND o.opening_satisfied_minor>0
    AND NOT EXISTS (SELECT 1 FROM finance.scheduled_installment n WHERE n.workspace_id=o.workspace_id AND n.schedule_version_id=s.id AND n.obligation_id=o.obligation_id)) THEN
    RAISE EXCEPTION 'schedule revision cannot discard historical opening satisfaction' USING ERRCODE='23514';
  END IF;
  IF s.revision_kind IN ('date_correction','allocation_correction') THEN
    IF s.frequency IS DISTINCT FROM (SELECT frequency FROM finance.debt_schedule_version WHERE workspace_id=s.workspace_id AND id=s.previous_version_id)
      OR EXISTS (
        SELECT 1 FROM (SELECT * FROM finance.scheduled_installment WHERE workspace_id=s.workspace_id AND schedule_version_id=s.previous_version_id) o
        FULL JOIN (SELECT * FROM finance.scheduled_installment WHERE workspace_id=s.workspace_id AND schedule_version_id=s.id) n USING(obligation_id)
        WHERE o.id IS NULL OR n.id IS NULL OR o.contractual_minor<>n.contractual_minor
          OR o.known_principal_minor IS DISTINCT FROM n.known_principal_minor OR o.known_interest_minor IS DISTINCT FROM n.known_interest_minor
          OR o.known_fee_minor IS DISTINCT FROM n.known_fee_minor OR o.breakdown_complete<>n.breakdown_complete
          OR o.disposition<>n.disposition OR o.cancellation_reason IS DISTINCT FROM n.cancellation_reason
          OR (s.revision_kind='allocation_correction' AND o.due_date<>n.due_date)
      ) THEN RAISE EXCEPTION 'schedule corrections must preserve contractual terms and obligation identities' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER debt_schedule_revision_terms_integrity AFTER INSERT OR UPDATE ON finance.debt_schedule_version
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_schedule_revision_terms();
REVOKE ALL ON FUNCTION finance.validate_schedule_revision_terms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_schedule_revision_terms() TO app_domain;

/* A provider-confirmed recognized charge uses its own noncash action, never a
 * scheduled amount or another payment. The audit is its explicit intent. */
DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge'))
EXECUTE FUNCTION finance.validate_s1_revision_recipe();

CREATE FUNCTION finance.validate_debt_charge_recipe()
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
  IF NOT FOUND OR intent->>'providerConfirmed'<>'true' OR intent->>'actionKind'<>'debt_charge'
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
    OR EXISTS (SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN
    RAISE EXCEPTION 'debt charge must recognize expense and liability exactly once without cash or unrelated evidence' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER action_revision_debt_charge_integrity AFTER INSERT OR UPDATE ON finance.action_revision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.action_kind='debt_charge') EXECUTE FUNCTION finance.validate_debt_charge_recipe();
REVOKE ALL ON FUNCTION finance.validate_debt_charge_recipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_debt_charge_recipe() TO app_domain;
