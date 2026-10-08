-- Preserve both immutable original-line limits and current corrected category budgets.
CREATE OR REPLACE FUNCTION finance.validate_refund_capacity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE; source_id uuid;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.state<>'posted' THEN RETURN NULL; END IF;
 PERFORM finance.lock_active_workspace(r.workspace_id);
 FOR source_id IN SELECT DISTINCT d.purchase_action_id FROM finance.refund_detail d WHERE d.workspace_id=r.workspace_id AND (d.action_id=r.action_id OR d.purchase_action_id=r.action_id) LOOP
  IF EXISTS(WITH used AS (
    SELECT op.category_id,x.allocation_kind,sum(x.amount_minor::numeric) AS amount,min(ar.primary_effective_date) AS first_refund FROM finance.refund_detail d
    JOIN finance.financial_action f ON f.workspace_id=d.workspace_id AND f.id=d.action_id AND f.current_revision_id=d.action_revision_id
    JOIN finance.action_revision ar ON ar.workspace_id=f.workspace_id AND ar.id=f.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
    JOIN finance.refund_allocation x ON x.workspace_id=d.workspace_id AND x.action_revision_id=d.action_revision_id JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id
    WHERE d.workspace_id=r.workspace_id AND d.purchase_action_id=source_id GROUP BY op.category_id,x.allocation_kind
  ), eligible AS (
    SELECT p.category_id,CASE WHEN fc.id IS NOT NULL THEN 'fee' ELSE 'purchase' END AS kind,sum(p.amount_minor::numeric) AS amount,max(j.effective_date) AS purchase_date FROM finance.financial_action f
    JOIN finance.action_revision ar ON ar.workspace_id=f.workspace_id AND ar.id=f.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
    JOIN finance.journal j ON j.workspace_id=ar.workspace_id AND j.action_revision_id=ar.id AND j.role='economic' AND j.state='posted'
    JOIN finance.posting p ON p.workspace_id=j.workspace_id AND p.journal_id=j.id AND p.expense_class='gross' AND p.amount_minor>0
    LEFT JOIN finance.fee_component fc ON fc.workspace_id=p.workspace_id AND fc.expense_posting_id=p.id
    WHERE f.workspace_id=r.workspace_id AND f.id=source_id AND (ar.action_kind='expense' OR fc.id IS NOT NULL) GROUP BY p.category_id,CASE WHEN fc.id IS NOT NULL THEN 'fee' ELSE 'purchase' END
  ) SELECT 1 FROM used u LEFT JOIN eligible e ON e.category_id IS NOT DISTINCT FROM u.category_id AND e.kind=u.allocation_kind WHERE u.amount>COALESCE(e.amount,0) OR u.first_refund<e.purchase_date) THEN RAISE EXCEPTION 'dependent refunds exceed corrected eligible portions; reverse/reallocate dependent refunds explicitly first' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM finance.refund_detail d
    JOIN finance.financial_action a ON a.workspace_id=d.workspace_id AND a.id=d.action_id AND a.current_revision_id=d.action_revision_id
    JOIN finance.action_revision ar ON ar.workspace_id=a.workspace_id AND ar.id=a.current_revision_id AND ar.state='posted' AND ar.change_kind<>'void'
    JOIN finance.refund_allocation x ON x.workspace_id=d.workspace_id AND x.action_revision_id=d.action_revision_id
    JOIN finance.posting op ON op.workspace_id=x.workspace_id AND op.id=x.original_purchase_posting_id
    WHERE d.workspace_id=r.workspace_id AND d.purchase_action_id=source_id
    GROUP BY op.id,op.amount_minor HAVING sum(x.amount_minor::numeric)>op.amount_minor::numeric)
  THEN RAISE EXCEPTION 'dependent refunds exceed their immutable original purchase portion' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE FUNCTION finance.validate_resolved_fee_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r finance.action_revision%ROWTYPE;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF NOT FOUND OR r.state<>'posted' OR r.action_kind<>'payment_reclassification' OR r.change_kind='void' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM finance.fee_component f WHERE f.workspace_id=r.workspace_id AND f.action_revision_id=r.id AND NOT EXISTS(
   SELECT 1 FROM finance.payment_reclassification c
   JOIN finance.payment_component pc ON pc.workspace_id=c.workspace_id AND pc.id=c.source_component_id
   JOIN finance.debt_payment_revision pr ON pr.workspace_id=pc.workspace_id AND pr.id=pc.payment_revision_id
   JOIN finance.financial_account a ON a.workspace_id=pr.workspace_id AND a.id=pr.paying_account_id
   WHERE c.workspace_id=r.workspace_id AND c.action_revision_id=r.id AND a.ledger_account_id=f.bearing_ledger_account_id))
 THEN RAISE EXCEPTION 'resolved fee must retain the original payment account provenance' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER resolved_fee_provenance AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_resolved_fee_provenance();
REVOKE ALL ON FUNCTION finance.validate_resolved_fee_provenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.validate_resolved_fee_provenance() TO app_domain;
