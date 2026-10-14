/* Reviewed STABLE, security-invoker evidence helper used by installment due. */
GRANT EXECUTE ON FUNCTION finance.installment_refund_evidence(uuid,uuid) TO worker_domain;
GRANT SELECT ON finance.card_action_detail TO worker_domain;
CREATE POLICY notification_refund_read ON finance.card_action_detail FOR SELECT TO worker_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'));

