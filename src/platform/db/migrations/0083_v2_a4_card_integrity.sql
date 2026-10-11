/* A4 releases actual payments, charges and refunds. Installments/opening/adjustment remain gated. */
ALTER TABLE finance.card_statement_allocation ADD CONSTRAINT fk_card_allocation_reversal FOREIGN KEY(workspace_id,reverses_allocation_id) REFERENCES finance.card_statement_allocation(workspace_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['card_action_detail','card_refund_part','card_statement_allocation'] LOOP
  EXECUTE format('REVOKE ALL ON finance.%I FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator',relation);
  EXECUTE format('GRANT SELECT,INSERT ON finance.%I TO app_domain',relation);
  EXECUTE format('GRANT SELECT,DELETE ON finance.%I TO lifecycle_operator',relation);
  EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY card_command_owner ON finance.%I TO app_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')) WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',relation);
  EXECUTE format('CREATE POLICY lifecycle_purge_scope ON finance.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',relation);
  EXECUTE format('CREATE TRIGGER a_card_command_root BEFORE INSERT ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.guard_financial_root_write()',relation);
  EXECUTE format('CREATE TRIGGER card_command_immutable BEFORE UPDATE OR DELETE ON finance.%I FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence()',relation);
 END LOOP;
END $$;
CREATE TRIGGER card_action_parent BEFORE INSERT ON finance.card_action_detail FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();
CREATE TRIGGER card_refund_parent BEFORE INSERT ON finance.card_refund_part FOR EACH ROW EXECUTE FUNCTION finance.guard_revision_evidence_parent();
CREATE OR REPLACE FUNCTION finance.guard_unreleased_card_action() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.action_kind IN ('opening_card','card_adjustment') THEN RAISE EXCEPTION 'card financial command is not enabled' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION finance.guard_unreleased_card_posting() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM finance.ledger_account WHERE workspace_id=NEW.workspace_id AND id=NEW.ledger_account_id AND kind='card_liability') AND NOT EXISTS(SELECT 1 FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.action_revision_id AND action_kind IN('card_purchase','card_payment','card_fee','card_interest','card_refund')) THEN RAISE EXCEPTION 'card liability requires a released recipe' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
DROP TRIGGER action_revision_s1_recipe_integrity ON finance.action_revision;
CREATE CONSTRAINT TRIGGER action_revision_s1_recipe_integrity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN(NEW.action_kind NOT IN('opening_debt','borrowing','debt_payment','payment_reclassification','debt_charge','debt_settlement','balance_adjustment','refund','card_purchase','card_payment','card_fee','card_interest','card_refund')) EXECUTE FUNCTION finance.validate_s1_revision_recipe();
CREATE VIEW finance.card_recognized_evidence_v WITH(security_invoker=true) AS
 SELECT r.workspace_id,r.action_id,r.id AS action_revision_id,r.action_kind,c.id AS card_id,r.primary_effective_date AS transaction_date,d.card_posting_date AS posting_date,d.card_provider_reference AS provider_reference,d.purchase_minor AS amount_minor,d.purchase_minor::numeric AS signed_liability_minor
 FROM finance.action_revision r JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id WHERE r.state='posted' AND r.change_kind<>'void' AND r.action_kind='card_purchase'
 UNION ALL SELECT r.workspace_id,r.action_id,r.id,r.action_kind,d.card_id,r.primary_effective_date,d.posting_date,d.provider_reference,d.amount_minor,CASE WHEN r.action_kind IN('card_payment','card_refund') THEN -d.amount_minor::numeric ELSE d.amount_minor::numeric END
 FROM finance.action_revision r JOIN finance.card_action_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id WHERE r.state='posted' AND r.change_kind<>'void' AND r.action_kind IN('card_payment','card_fee','card_interest','card_refund');
CREATE VIEW finance.effective_card_allocation_v WITH(security_invoker=true) AS
 SELECT x.* FROM finance.card_statement_allocation x
 JOIN finance.card_statement_revision r ON r.workspace_id=x.workspace_id AND r.id=x.statement_revision_id AND r.state='verified'
 JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id AND s.current_revision_id=r.id
 JOIN finance.card_recognized_evidence_v e ON e.workspace_id=x.workspace_id AND e.action_revision_id=x.source_action_revision_id AND e.card_id=s.card_id AND e.action_kind IN('card_payment','card_refund')
 JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id
 WHERE x.reverses_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.card_statement_allocation undo WHERE undo.workspace_id=x.workspace_id AND undo.reverses_allocation_id=x.id);
REVOKE ALL ON finance.card_recognized_evidence_v,finance.effective_card_allocation_v FROM PUBLIC;
GRANT SELECT ON finance.card_recognized_evidence_v,finance.effective_card_allocation_v TO app_domain,lifecycle_operator;
--> statement-breakpoint
CREATE FUNCTION finance.validate_card_command_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.card_action_detail%ROWTYPE; c finance.credit_card%ROWTYPE; ca finance.financial_account%ROWTYPE; movement record; activity finance.card_activity%ROWTYPE; evidence finance.card_action_detail%ROWTYPE; expected_date date; n bigint:=0; sign integer; a jsonb;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.action_kind NOT IN('card_payment','card_fee','card_interest','card_refund') THEN
  IF EXISTS(SELECT 1 FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'card typed evidence requires supported recipe' USING ERRCODE='23514'; END IF; RETURN NULL;
 END IF;
 IF r.state<>'posted' OR (r.previous_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance.action_revision WHERE workspace_id=r.workspace_id AND id=r.previous_revision_id AND action_kind=r.action_kind)) THEN RAISE EXCEPTION 'card command requires posted same-kind revision chain' USING ERRCODE='23514'; END IF;
 SELECT after_json INTO a FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no AND recorded_by_user_id=r.recorded_by_user_id AND actor_kind=r.actor_kind AND request_id IS NOT DISTINCT FROM r.request_id AND operation=CASE WHEN r.change_kind='create' THEN 'create' WHEN r.change_kind='replace' THEN 'replace' ELSE 'void' END AND (r.change_kind='create' OR (reason IS NOT DISTINCT FROM r.reason AND before_json IS NOT NULL));
 IF a IS NULL OR NOT a @> jsonb_build_object('actionRevisionId',r.id,'actionKind',r.action_kind) THEN RAISE EXCEPTION 'card command requires exact attributed audit' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.purchase_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.receipt_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.transfer_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.refund_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.fee_component WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.debt_action_link WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.debt_payment_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.adjustment_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR EXISTS(SELECT 1 FROM finance.payment_reclassification WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'card command cannot contain another recipe' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF r.change_kind='void' THEN
  IF FOUND OR EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic') OR EXISTS(SELECT 1 FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) THEN RAISE EXCEPTION 'void card command contains reversal evidence only' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT FOUND THEN RAISE EXCEPTION 'card command requires typed provider evidence' USING ERRCODE='23514'; END IF;
  SELECT * INTO c FROM finance.credit_card WHERE workspace_id=r.workspace_id AND id=d.card_id;
  IF NOT FOUND OR c.currency<>r.currency OR (c.archived_at IS NOT NULL AND NOT (r.change_kind='replace' AND EXISTS(SELECT 1 FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.previous_revision_id AND card_id=c.id))) THEN RAISE EXCEPTION 'card command requires active owned same-currency card or retained correction reference' USING ERRCODE='23514'; END IF;
  IF NOT a @> jsonb_build_object('cardId',c.id,'amountMinor',d.amount_minor::text,'postingDate',d.posting_date::text,'effectiveDate',r.primary_effective_date::text,'providerReference',d.provider_reference,'confirmationSource',d.confirmation_source,'providerConfirmed',true,'payingAccountId',d.paying_account_id,'purchaseActionId',d.purchase_action_id) THEN RAISE EXCEPTION 'card command audit must match typed evidence' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic')<>1 OR EXISTS(SELECT 1 FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic' AND (state<>'posted' OR effective_date<>r.primary_effective_date)) THEN RAISE EXCEPTION 'card command requires one posted transaction-date economic journal' USING ERRCODE='23514'; END IF;
  sign:=CASE WHEN r.action_kind IN('card_payment','card_refund') THEN 1 ELSE -1 END;
  IF (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL AND ledger_account_id=c.liability_ledger_account_id)<>1 OR NOT EXISTS(SELECT 1 FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL AND ledger_account_id=c.liability_ledger_account_id AND amount_minor::numeric=sign*d.amount_minor::numeric) THEN RAISE EXCEPTION 'card command requires exact liability movement' USING ERRCODE='23514'; END IF;
  IF r.action_kind='card_payment' THEN
   SELECT * INTO ca FROM finance.financial_account WHERE workspace_id=r.workspace_id AND id=d.paying_account_id;
   IF NOT FOUND OR ca.currency<>r.currency OR r.primary_effective_date<=ca.opening_cutoff_date OR (ca.archived_at IS NOT NULL AND NOT(r.change_kind='replace' AND EXISTS(SELECT 1 FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.previous_revision_id AND paying_account_id=ca.id))) OR d.purchase_action_id IS NOT NULL OR a->'categoryId'<>'null'::jsonb OR EXISTS(SELECT 1 FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>2 OR NOT EXISTS(SELECT 1 FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL AND ledger_account_id=ca.ledger_account_id AND amount_minor::numeric=-d.amount_minor::numeric AND cash_flow_kind='transfer' AND cash_flow_direction='out') THEN RAISE EXCEPTION 'card payment requires exact cash transfer without expense' USING ERRCODE='23514'; END IF;
  ELSE
   IF d.paying_account_id IS NOT NULL OR (r.action_kind<>'card_refund' AND d.purchase_action_id IS NOT NULL) OR EXISTS(SELECT 1 FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND NOT(p.ledger_account_id=c.liability_ledger_account_id OR (l.kind='expense' AND p.expense_class=CASE WHEN r.action_kind='card_refund' THEN 'refund_offset' ELSE 'gross' END AND p.amount_minor::numeric*sign<0))) THEN RAISE EXCEPTION 'card charge/refund requires only matching spending and card liability, without income/cash' USING ERRCODE='23514'; END IF;
   IF d.purchase_action_id IS NULL THEN
    IF (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>2 OR EXISTS(SELECT 1 FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR NOT EXISTS(SELECT 1 FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='expense' WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.amount_minor::numeric=-sign*d.amount_minor::numeric AND p.category_id IS NOT DISTINCT FROM (a->>'categoryId')::uuid) THEN RAISE EXCEPTION 'unlinked charge/refund requires exact confirmed spending classification' USING ERRCODE='23514'; END IF;
   ELSE
    IF (SELECT COALESCE(sum(amount_minor::numeric),0) FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>d.amount_minor::numeric OR (SELECT count(*) FROM finance.posting WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND reverses_posting_id IS NULL)<>(SELECT count(*)+1 FROM finance.card_refund_part WHERE workspace_id=r.workspace_id AND action_revision_id=r.id) OR a->'refundParts' IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('originalPurchasePostingId',x.original_purchase_posting_id,'amountMinor',x.amount_minor::text) ORDER BY rp.line_no) FROM finance.card_refund_part x JOIN finance.posting rp ON rp.workspace_id=x.workspace_id AND rp.id=x.refund_posting_id WHERE x.workspace_id=r.workspace_id AND x.action_revision_id=r.id) THEN RAISE EXCEPTION 'linked refund requires exact immutable portion/audit evidence' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM finance.card_refund_part x JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id JOIN finance.action_revision source ON source.workspace_id=op.workspace_id AND source.id=op.action_revision_id JOIN finance.purchase_detail pd ON pd.workspace_id=source.workspace_id AND pd.action_revision_id=source.id JOIN finance.posting rp ON rp.workspace_id=x.workspace_id AND rp.id=x.refund_posting_id WHERE x.workspace_id=r.workspace_id AND x.action_revision_id=r.id AND (source.action_kind<>'card_purchase' OR source.state<>'posted' OR source.action_id<>d.purchase_action_id OR pd.funding_ledger_account_id<>c.liability_ledger_account_id OR source.primary_effective_date>r.primary_effective_date OR op.expense_class<>'gross' OR op.reverses_posting_id IS NOT NULL OR rp.amount_minor::numeric<>-x.amount_minor::numeric OR rp.expense_class<>'refund_offset' OR rp.category_id IS DISTINCT FROM op.category_id OR rp.ledger_account_id<>op.ledger_account_id OR x.amount_minor>op.amount_minor)) THEN RAISE EXCEPTION 'refund must preserve eligible original purchase classification/card' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM finance.posting p JOIN core.category cat ON cat.workspace_id=p.workspace_id AND cat.id=p.category_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND cat.archived_at IS NOT NULL AND r.action_kind<>'card_refund' AND NOT(r.change_kind='replace' AND EXISTS(SELECT 1 FROM finance.posting prev WHERE prev.workspace_id=r.workspace_id AND prev.action_revision_id=r.previous_revision_id AND prev.category_id=cat.id))) THEN RAISE EXCEPTION 'new card charge category must be active' USING ERRCODE='23514'; END IF;
 END IF;
 FOR movement IN SELECT cc.id AS card_id,(-sum(p.amount_minor::numeric)) AS signed_minor FROM finance.posting p JOIN finance.credit_card cc ON cc.workspace_id=p.workspace_id AND cc.liability_ledger_account_id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY cc.id HAVING sum(p.amount_minor::numeric)<>0 LOOP
  n:=n+1; SELECT * INTO activity FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND card_id=movement.card_id;
  IF NOT FOUND OR activity.signed_liability_minor::numeric<>movement.signed_minor OR activity.activity_kind<>replace(r.action_kind,'card_','') THEN RAISE EXCEPTION 'card activity must match exact net revision movement' USING ERRCODE='23514'; END IF;
  SELECT * INTO evidence FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND card_id=movement.card_id; expected_date:=r.primary_effective_date;
  IF NOT FOUND THEN SELECT * INTO evidence FROM finance.card_action_detail WHERE workspace_id=r.workspace_id AND action_revision_id=r.previous_revision_id AND card_id=movement.card_id; SELECT primary_effective_date INTO expected_date FROM finance.action_revision WHERE workspace_id=r.workspace_id AND id=r.previous_revision_id; END IF;
  IF evidence.action_revision_id IS NULL OR activity.transaction_date IS DISTINCT FROM expected_date OR activity.posting_date IS DISTINCT FROM evidence.posting_date OR activity.provider_reference IS DISTINCT FROM evidence.provider_reference THEN RAISE EXCEPTION 'card movement must preserve provider dates/reference' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM finance.card_activity WHERE workspace_id=r.workspace_id AND action_revision_id=r.id)<>n THEN RAISE EXCEPTION 'unexpected card activity' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER card_command_recipe AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_card_command_recipe();
--> statement-breakpoint
/* Current linked refund totals must fit current purchase classifications, even after purchase correction. */
CREATE FUNCTION finance.validate_card_refund_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE scope uuid:=NEW.workspace_id;
BEGIN
 IF EXISTS(WITH used AS(SELECT d.purchase_action_id,op.category_id,d.card_id,sum(x.amount_minor::numeric) AS amount,min(r.primary_effective_date) AS first_refund FROM finance.card_action_detail d JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.id=d.action_id AND f.current_revision_id=d.action_revision_id JOIN finance.action_revision r ON r.workspace_id=d.workspace_id AND r.id=d.action_revision_id JOIN finance.card_refund_part x ON x.workspace_id=d.workspace_id AND x.action_revision_id=d.action_revision_id JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id WHERE d.workspace_id=scope GROUP BY d.purchase_action_id,op.category_id,d.card_id), eligible AS(SELECT f.id AS purchase_action_id,p.category_id,c.id AS card_id,sum(p.amount_minor::numeric) AS amount,min(r.primary_effective_date) AS purchase_date FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.action_kind='card_purchase' AND r.state='posted' AND r.change_kind<>'void' JOIN finance.purchase_detail d ON d.workspace_id=r.workspace_id AND d.action_revision_id=r.id JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.liability_ledger_account_id=d.funding_ledger_account_id JOIN finance.posting p ON p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.reverses_posting_id IS NULL AND p.expense_class='gross' WHERE f.workspace_id=scope GROUP BY f.id,p.category_id,c.id) SELECT 1 FROM used u LEFT JOIN eligible e ON e.purchase_action_id=u.purchase_action_id AND e.category_id IS NOT DISTINCT FROM u.category_id AND e.card_id=u.card_id WHERE u.amount>COALESCE(e.amount,0) OR u.first_refund<e.purchase_date) THEN RAISE EXCEPTION 'dependent card refunds exceed current purchase classification; resolve refunds first' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER card_refund_capacity AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_card_refund_capacity();
CREATE FUNCTION finance.guard_card_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE original finance.card_statement_allocation%ROWTYPE;
BEGIN
 IF NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'allocation requires trusted owner attribution' USING ERRCODE='23514'; END IF;
 NEW.created_at:=clock_timestamp();
 IF NEW.reverses_allocation_id IS NOT NULL THEN
  SELECT * INTO original FROM finance.card_statement_allocation WHERE workspace_id=NEW.workspace_id AND id=NEW.reverses_allocation_id;
  IF NOT FOUND OR original.reverses_allocation_id IS NOT NULL OR NEW.statement_revision_id<>original.statement_revision_id OR NEW.source_action_revision_id<>original.source_action_revision_id OR NEW.amount_minor<>original.amount_minor OR NEW.confirmation_kind<>original.confirmation_kind OR NEW.confirmed_date<>original.confirmed_date THEN RAISE EXCEPTION 'allocation reversal must exactly reverse one original allocation' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM finance.card_statement_revision r JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id AND s.current_revision_id=r.id JOIN finance.card_recognized_evidence_v e ON e.workspace_id=r.workspace_id AND e.action_revision_id=NEW.source_action_revision_id AND e.card_id=s.card_id AND e.action_kind IN('card_payment','card_refund') JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.statement_revision_id AND r.state='verified' AND NEW.amount_minor<=e.amount_minor AND NEW.amount_minor::numeric<=r.balance_minor::numeric) THEN RAISE EXCEPTION 'allocation requires current same-card payment/credit and verified statement evidence' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER card_allocation_guard BEFORE INSERT ON finance.card_statement_allocation FOR EACH ROW EXECUTE FUNCTION finance.guard_card_allocation();
CREATE FUNCTION finance.validate_card_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE x finance.card_statement_allocation%ROWTYPE; card uuid; expected jsonb; original finance.card_statement_allocation%ROWTYPE;
BEGIN
 SELECT * INTO x FROM finance.card_statement_allocation WHERE workspace_id=NEW.workspace_id AND id=NEW.id; IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT s.card_id INTO card FROM finance.card_statement_revision r JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id WHERE r.workspace_id=x.workspace_id AND r.id=x.statement_revision_id;
 expected:=jsonb_build_object('allocationId',x.id,'cardId',card,'statementRevisionId',x.statement_revision_id,'sourceActionRevisionId',x.source_action_revision_id,'amountMinor',x.amount_minor::text,'confirmationKind',x.confirmation_kind,'confirmationSource',x.confirmation_source,'confirmedDate',x.confirmed_date::text,'reversesAllocationId',x.reverses_allocation_id);
 IF NOT EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.workspace_id=x.workspace_id AND c.id=x.command_receipt_id AND c.state='completed' AND c.command_type=CASE WHEN x.reverses_allocation_id IS NULL THEN 'finance.record_card_allocation' ELSE 'finance.reverse_card_allocation' END AND c.result_json @> jsonb_build_object('allocationId',x.id)) OR EXISTS(SELECT 1 FROM finance.action_revision WHERE workspace_id=x.workspace_id AND command_receipt_id=x.command_receipt_id) THEN RAISE EXCEPTION 'allocation requires completed nonfinancial command' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=x.workspace_id AND a.command_receipt_id=x.command_receipt_id AND a.subject_kind='card_allocation' AND a.subject_id=x.id AND a.subject_version=1 AND a.recorded_by_user_id=x.recorded_by_user_id AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM x.request_id AND a.effective_date=x.confirmed_date AND a.after_json=expected AND a.operation=CASE WHEN x.reverses_allocation_id IS NULL THEN 'create' ELSE 'void' END AND (CASE WHEN x.reverses_allocation_id IS NULL THEN a.before_json IS NULL AND a.reason IS NULL ELSE a.before_json @> jsonb_build_object('allocationId',x.reverses_allocation_id,'amountMinor',x.amount_minor::text) AND a.reason=x.confirmation_source END)) THEN RAISE EXCEPTION 'allocation requires exact immutable confirmation/reversal audit evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.effective_card_allocation_v a JOIN finance.card_recognized_evidence_v e ON e.workspace_id=a.workspace_id AND e.action_revision_id=a.source_action_revision_id WHERE a.workspace_id=x.workspace_id GROUP BY a.source_action_revision_id,e.amount_minor HAVING sum(a.amount_minor::numeric)>e.amount_minor::numeric) OR EXISTS(SELECT 1 FROM finance.effective_card_allocation_v a JOIN finance.card_statement_revision r ON r.workspace_id=a.workspace_id AND r.id=a.statement_revision_id WHERE a.workspace_id=x.workspace_id GROUP BY r.id,r.balance_minor HAVING sum(a.amount_minor::numeric)>GREATEST(r.balance_minor::numeric,0)) THEN RAISE EXCEPTION 'effective allocations exceed supported payment/credit or statement balance' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER card_allocation_integrity AFTER INSERT ON finance.card_statement_allocation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_card_allocation();
CREATE OR REPLACE FUNCTION finance.guard_statement_financial_command() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM core.command_receipt r WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.command_receipt_id AND r.command_type IN('finance.record_card_statement','finance.revise_card_statement','finance.record_card_allocation','finance.reverse_card_allocation')) THEN RAISE EXCEPTION 'statement/allocation commands cannot create financial revisions' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION finance.guard_statement_entry() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.card_statement_revision%ROWTYPE; s finance.card_statement%ROWTYPE;
BEGIN
 SELECT * INTO r FROM finance.card_statement_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.statement_revision_id;
 IF NOT FOUND OR r.state<>'building' THEN RAISE EXCEPTION 'entries require building statement snapshot' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM finance.card_statement WHERE workspace_id=r.workspace_id AND id=r.statement_id;
 IF NEW.action_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance.card_recognized_evidence_v e WHERE e.workspace_id=r.workspace_id AND e.action_revision_id=NEW.action_revision_id AND e.card_id=s.card_id AND NEW.amount_minor::numeric=e.signed_liability_minor AND NEW.posting_date=e.posting_date AND (EXISTS(SELECT 1 FROM finance.financial_action f WHERE f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id) OR EXISTS(SELECT 1 FROM finance.card_statement_entry old WHERE old.workspace_id=r.workspace_id AND old.statement_revision_id=r.previous_revision_id AND old.action_revision_id=e.action_revision_id))) THEN RAISE EXCEPTION 'statement association requires exact same-card recognized provider evidence' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
DO $$ DECLARE fn text; BEGIN FOREACH fn IN ARRAY ARRAY['validate_card_command_recipe','validate_card_refund_capacity','guard_card_allocation','validate_card_allocation'] LOOP EXECUTE format('REVOKE ALL ON FUNCTION finance.%I() FROM PUBLIC',fn); EXECUTE format('GRANT EXECUTE ON FUNCTION finance.%I() TO app_domain,lifecycle_operator',fn); END LOOP; END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance.validate_card_purchase_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; d finance.purchase_detail%ROWTYPE; c finance.credit_card%ROWTYPE;
  activity finance.card_activity%ROWTYPE; movement record; nd finance.purchase_detail%ROWTYPE; pd finance.purchase_detail%ROWTYPE;
  expected_date date; expected_posting_date date; expected_reference text; n bigint;
BEGIN
  SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF; -- approved whole-workspace purge
  IF r.action_kind IN('card_payment','card_fee','card_interest','card_refund') THEN RETURN NULL; END IF;
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

--> statement-breakpoint
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

      THEN RAISE EXCEPTION 'invalid card purchase liability classification' USING ERRCODE='23514'; END IF;

    ELSE
      RAISE EXCEPTION
        'ledger kind is not supported by the financial posting classifier'
        USING ERRCODE = '23514';
  END CASE;

  RETURN NEW;
END;
$$;
