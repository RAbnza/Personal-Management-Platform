/* Immutable cutoff comparisons. Finalized journal identities and postings
 * cannot change or disappear, so their distinct count is an exact temporal
 * source version, including net-zero reversal/replacement changes. */
ALTER TABLE finance.reconciliation ADD CONSTRAINT fk_reconciliation_previous
 FOREIGN KEY(workspace_id,financial_account_id,supersedes_reconciliation_id)
 REFERENCES finance.reconciliation(workspace_id,financial_account_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reconciliation','adjustment_detail'] LOOP
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

CREATE FUNCTION finance.guard_reconciliation_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a finance.financial_account%ROWTYPE; v_amount numeric; v_sources bigint; v_revision bigint;
BEGIN
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=NEW.workspace_id AND id=NEW.financial_account_id;
 IF NOT FOUND OR NEW.cutoff_date<a.opening_cutoff_date THEN RAISE EXCEPTION 'invalid reconciliation account or cutoff' USING ERRCODE='23514'; END IF;
 SELECT financial_revision INTO v_revision FROM core.workspace WHERE id=NEW.workspace_id;
 SELECT COALESCE(sum(p.amount_minor::numeric),0),count(DISTINCT j.id) INTO v_amount,v_sources FROM finance.posting p
  JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
  JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
  WHERE p.workspace_id=NEW.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=NEW.cutoff_date;
 IF NEW.calculated_minor::numeric<>v_amount OR NEW.source_journal_count<>v_sources OR NEW.financial_revision<>v_revision THEN RAISE EXCEPTION 'reconciliation must capture exact current cutoff sources' USING ERRCODE='23514'; END IF;
 IF NEW.actor_kind='user' AND NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'reconciliation actor mismatch' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.workspace_id=NEW.workspace_id AND c.id=NEW.command_receipt_id AND c.command_type='finance.reconcile_account' AND c.state='claimed') THEN RAISE EXCEPTION 'reconciliation requires its active command receipt' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_snapshot BEFORE INSERT ON finance.reconciliation FOR EACH ROW EXECUTE FUNCTION finance.guard_reconciliation_snapshot();

CREATE FUNCTION finance.validate_reconciliation_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=NEW.command_receipt_id AND a.subject_kind='reconciliation' AND a.subject_id=NEW.id AND a.subject_version=1
  AND a.after_json->>'financialAccountId'=NEW.financial_account_id::text AND a.after_json->>'cutoffDate'=NEW.cutoff_date::text AND a.after_json->>'observedMinor'=NEW.observed_minor::text AND a.after_json->>'calculatedMinor'=NEW.calculated_minor::text AND a.after_json->>'sourceJournalCount'=NEW.source_journal_count::text AND a.after_json->>'financialRevision'=NEW.financial_revision::text)
 THEN RAISE EXCEPTION 'reconciliation requires exact immutable audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reconciliation_audit AFTER INSERT ON finance.reconciliation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_reconciliation_audit();

CREATE FUNCTION finance.guard_adjustment_detail() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE ar finance.action_revision%ROWTYPE; a finance.financial_account%ROWTYPE; r finance.reconciliation%ROWTYPE; v_amount numeric; v_sources bigint;
BEGIN
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 SELECT * INTO ar FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND action_id=NEW.action_id AND id=NEW.action_revision_id FOR UPDATE;
 IF NOT FOUND OR ar.state<>'building' OR ar.action_kind<>'balance_adjustment' OR ar.change_kind<>'create' THEN RAISE EXCEPTION 'adjustment requires a building adjustment action' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=NEW.workspace_id AND id=NEW.financial_account_id;
 IF NOT FOUND OR a.archived_at IS NOT NULL OR a.currency<>ar.currency OR ar.primary_effective_date<=a.opening_cutoff_date THEN RAISE EXCEPTION 'invalid adjustment account or date' USING ERRCODE='23514'; END IF;
 IF NEW.reconciliation_id IS NOT NULL THEN
  SELECT * INTO r FROM finance.reconciliation WHERE workspace_id=NEW.workspace_id AND financial_account_id=a.id AND id=NEW.reconciliation_id;
  IF NOT FOUND OR ar.primary_effective_date>r.cutoff_date OR EXISTS(SELECT 1 FROM finance.reconciliation s WHERE s.workspace_id=r.workspace_id AND s.supersedes_reconciliation_id=r.id) THEN RAISE EXCEPTION 'adjustment requires a current comparison and applicable date' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(p.amount_minor::numeric),0),count(DISTINCT j.id) INTO v_amount,v_sources FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision rev ON rev.workspace_id=p.workspace_id AND rev.id=p.action_revision_id AND rev.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=r.cutoff_date;
  IF v_sources<>r.source_journal_count OR v_amount<>r.calculated_minor::numeric THEN RAISE EXCEPTION 'adjustment comparison needs review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER adjustment_parent BEFORE INSERT ON finance.adjustment_detail FOR EACH ROW EXECUTE FUNCTION finance.guard_adjustment_detail();

DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN(NEW.action_kind NOT IN ('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge','debt_settlement','balance_adjustment')) EXECUTE FUNCTION finance.validate_s1_revision_recipe();

CREATE FUNCTION finance.validate_adjustment_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.adjustment_detail%ROWTYPE; a finance.financial_account%ROWTYPE; v_audit jsonb; v_balance numeric; v_current numeric;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.action_kind<>'balance_adjustment' THEN RETURN NULL; END IF;
 IF r.state<>'posted' OR r.change_kind<>'create' THEN RAISE EXCEPTION 'adjustment must be finalized' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'adjustment requires typed evidence' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM finance.financial_account WHERE workspace_id=d.workspace_id AND id=d.financial_account_id;
 IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>1 OR NOT EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND state='posted' AND role='economic' AND effective_date=r.primary_effective_date)
  OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>2 THEN RAISE EXCEPTION 'adjustment requires one journal and exactly two postings' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM finance.posting p WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.ledger_account_id=a.ledger_account_id AND p.amount_minor=d.signed_adjustment_minor AND p.cash_flow_kind='adjustment' AND p.cash_flow_direction='adjustment' AND p.expense_class='none' AND p.income_class='none' AND p.category_id IS NULL AND p.liability_component IS NULL)
  OR NOT EXISTS(SELECT 1 FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND l.kind='adjustment_equity' AND p.amount_minor::numeric=-d.signed_adjustment_minor::numeric AND p.cash_flow_kind='none' AND p.cash_flow_direction='none' AND p.expense_class='none' AND p.income_class='none' AND p.category_id IS NULL AND p.liability_component IS NULL)
  THEN RAISE EXCEPTION 'adjustment requires exact cash/equity effects without income or expense' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'adjustment cannot contain another financial recipe' USING ERRCODE='23514'; END IF;
 SELECT after_json INTO v_audit FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no;
 IF NOT FOUND OR v_audit->>'actionKind' IS DISTINCT FROM 'balance_adjustment' OR v_audit->>'signedAdjustmentMinor' IS DISTINCT FROM d.signed_adjustment_minor::text OR v_audit->>'financialAccountId' IS DISTINCT FROM a.id::text OR v_audit->>'reason' IS DISTINCT FROM d.reason OR v_audit->>'effectiveDate' IS DISTINCT FROM r.primary_effective_date::text OR (v_audit->>'reconciliationId')::uuid IS DISTINCT FROM d.reconciliation_id THEN RAISE EXCEPTION 'adjustment requires exact audit evidence' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(p.amount_minor::numeric) FILTER(WHERE j.effective_date<=r.primary_effective_date),0),COALESCE(sum(p.amount_minor::numeric),0) INTO v_balance,v_current FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=a.ledger_account_id;
 IF (v_balance<0 OR v_current<0) AND (v_audit->'acknowledgeNegativeBalance') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'negative adjustment balance requires explicit acknowledgement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER adjustment_recipe AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_adjustment_recipe();

REVOKE ALL ON FUNCTION finance.guard_reconciliation_snapshot(),finance.validate_reconciliation_audit(),finance.guard_adjustment_detail(),finance.validate_adjustment_recipe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.guard_reconciliation_snapshot(),finance.validate_reconciliation_audit(),finance.guard_adjustment_detail(),finance.validate_adjustment_recipe() TO app_domain;
