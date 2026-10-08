/* Every affected historical cash point is checked; a backdated reduction of
 * a receipt/baseline can expose a later negative balance. */
CREATE OR REPLACE FUNCTION finance.validate_manual_negative_acknowledgement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; a jsonb; affected record;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.state<>'posted' OR r.action_kind='opening_debt' OR (r.action_kind='opening_cash' AND r.change_kind='create') THEN RETURN NULL; END IF;
 SELECT after_json INTO a FROM audit.private_revision WHERE workspace_id=r.workspace_id AND command_receipt_id=r.command_receipt_id AND subject_kind='financial_action' AND subject_id=r.action_id AND subject_version=r.revision_no;
 FOR affected IN SELECT p.ledger_account_id,min(j.effective_date) AS earliest FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id AND l.kind='cash_asset' WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY p.ledger_account_id HAVING bool_or(p.amount_minor<0) LOOP
  IF EXISTS(SELECT 1 FROM (SELECT j.effective_date,sum(sum(p.amount_minor::numeric)) OVER(ORDER BY j.effective_date) AS balance FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted' JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted' WHERE p.workspace_id=r.workspace_id AND p.ledger_account_id=affected.ledger_account_id GROUP BY j.effective_date) balances WHERE effective_date>=affected.earliest AND balance<0) AND (a->'acknowledgeNegativeBalance') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'negative balance requires durable explicit command acknowledgement' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
