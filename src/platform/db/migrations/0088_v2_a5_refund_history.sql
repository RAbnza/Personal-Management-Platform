/* Track each ever-linked refund's current immutable head, including a void or
   corrected-away head. Reversing a refund must not reactivate old provider
   schedules or old applications whose allocation capacity was reused. */
CREATE OR REPLACE FUNCTION finance.installment_refund_evidence(scope uuid,purchase uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'actionRevisionId',f.current_revision_id,
  'amountMinor',COALESCE(current_detail.amount_minor,0)::text
 ) ORDER BY f.current_revision_id),'[]'::jsonb)
 FROM finance.financial_action f
 LEFT JOIN finance.card_action_detail current_detail
  ON current_detail.workspace_id=f.workspace_id
  AND current_detail.action_revision_id=f.current_revision_id
  AND current_detail.purchase_action_id=purchase
 WHERE f.workspace_id=scope AND EXISTS(
  SELECT 1 FROM finance.card_action_detail history
  WHERE history.workspace_id=f.workspace_id AND history.action_id=f.id
   AND history.purchase_action_id=purchase
 )
$$;
