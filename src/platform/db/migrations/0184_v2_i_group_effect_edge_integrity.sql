DO $$ DECLARE d text;anchor text; BEGIN
 d:=pg_get_functiondef('finance.validate_group_effect_recipe()'::regprocedure);
 d:=replace(d,'n integer; expected integer;','n integer; expected integer; group_lines integer;');
 anchor:=',count(*) INTO actual_cash';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'effect line count anchor missing'; END IF;
 d:=replace(d,anchor,',count(*),count(*) FILTER(WHERE l.id IN(b.receivable_ledger_account_id,b.payable_ledger_account_id)) INTO actual_cash');
 d:=replace(d,'actual_clearing,n FROM','actual_clearing,n,group_lines FROM');
 d:=replace(d,$q$CASE WHEN (v->>'groupMinor')::numeric<>0 THEN 1 ELSE 0 END$q$,'group_lines');
 d:=replace(d,'IF actual_cash<>',$q$IF ((v->>'groupMinor')::numeric=0 AND group_lines<>0) OR ((v->>'groupMinor')::numeric<>0 AND group_lines NOT IN(1,2)) OR EXISTS(SELECT 1 FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND p.ledger_account_id IN(b.receivable_ledger_account_id,b.payable_ledger_account_id) AND sign(p.amount_minor::numeric)<>sign((v->>'groupMinor')::numeric)) THEN RAISE EXCEPTION 'invalid private group bucket allocation' USING ERRCODE='23514'; END IF; IF actual_cash<>$q$);
 /* Net-zero card correction retains earlier activity, rather than inventing
  * another provider refund. Every new nonzero card movement needs evidence. */
 anchor:=$q$OR NOT EXISTS(SELECT 1 FROM finance.card_activity a JOIN finance.credit_card c$q$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'effect card net movement anchor missing'; END IF;
 d:=replace(d,anchor,$q$OR (coalesce((SELECT sum(p1.amount_minor::numeric) FROM finance.posting p1 WHERE p1.workspace_id=r.workspace_id AND p1.action_revision_id=r.id AND p1.ledger_account_id=l.id),0)<>0 AND NOT EXISTS(SELECT 1 FROM finance.card_activity a JOIN finance.credit_card c$q$);
 d:=replace(d,'AND p0.ledger_account_id=l.id))))))','AND p0.ledger_account_id=l.id)))))))');
 anchor:=' IF NOT EXISTS(SELECT 1 FROM audit.private_revision a JOIN core.command_receipt c';
 d:=replace(d,anchor,$q$ IF (SELECT count(*) FROM finance.card_activity a WHERE a.workspace_id=r.workspace_id AND a.action_revision_id=r.id)<>(SELECT count(*) FROM (SELECT c.id FROM finance.posting p JOIN finance.credit_card c ON c.workspace_id=p.workspace_id AND c.liability_ledger_account_id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id GROUP BY c.id HAVING sum(p.amount_minor::numeric)<>0) movements) THEN RAISE EXCEPTION 'group refund activity must reflect exact net card movement' USING ERRCODE='23514'; END IF;
$q$||anchor);
 EXECUTE d;
END $$;

ALTER FUNCTION sharing.review_invitation(text) RENAME TO review_bill_invitation;
REVOKE ALL ON FUNCTION sharing.review_bill_invitation(text) FROM app_domain;
CREATE FUNCTION sharing.review_invitation(h text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;g uuid;p uuid;refunds jsonb;settlements jsonb;refund_received numeric;refund_share numeric;settled numeric;n integer;
BEGIN
 v:=sharing.review_bill_invitation(h);g:=(v->>'groupId')::uuid;p:=(v->>'claimParticipantId')::uuid;
 IF p IS NULL THEN RETURN v||jsonb_build_object('refunds','[]'::jsonb,'settlements','[]'::jsonb); END IF;
 SELECT count(*) INTO n FROM sharing.refund r WHERE r.group_id=g AND EXISTS(SELECT 1 FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.participant_id=p);
 IF n>100 THEN RAISE EXCEPTION 'manual identity refund history exceeds complete review bound' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'expenseId',r.expense_id,'date',r.refund_date::text,'reason',r.reason,'receivedMinor',(SELECT coalesce(sum(a.amount_minor::numeric),0)::text FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.participant_id=p AND a.axis='received'),'shareCreditMinor',(SELECT coalesce(sum(a.amount_minor::numeric),0)::text FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.participant_id=p AND a.axis='share_credit')) ORDER BY r.created_at,r.id),'[]'::jsonb) INTO refunds FROM sharing.refund r WHERE r.group_id=g AND EXISTS(SELECT 1 FROM sharing.refund_allocation a WHERE a.group_id=g AND a.refund_id=r.id AND a.participant_id=p);
 SELECT coalesce(sum(a.amount_minor::numeric) FILTER(WHERE a.axis='received'),0),coalesce(sum(a.amount_minor::numeric) FILTER(WHERE a.axis='share_credit'),0) INTO refund_received,refund_share FROM sharing.refund_allocation a WHERE a.group_id=g AND a.participant_id=p;
 SELECT count(*) INTO n FROM sharing.settlement s WHERE s.group_id=g AND p IN(s.sender_id,s.recipient_id);
 IF n>100 THEN RAISE EXCEPTION 'manual identity settlement history exceeds complete review bound' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'senderId',s.sender_id,'recipientId',s.recipient_id,'date',s.payment_date::text,'amountMinor',s.amount_minor::text,'advanceMinor',s.advance_minor::text,'state',s.state,'version',s.version,'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',e.version,'actorId',e.actor_id,'confirmationType',e.confirmation_type,'fromState',e.from_state,'toState',e.to_state,'reason',e.reason) ORDER BY e.version),'[]'::jsonb) FROM sharing.settlement_event e WHERE e.group_id=g AND e.settlement_id=s.id)) ORDER BY s.created_at,s.id),'[]'::jsonb),coalesce(sum(CASE WHEN s.state='confirmed' THEN CASE WHEN s.sender_id=p THEN s.amount_minor::numeric ELSE -s.amount_minor::numeric END ELSE 0 END),0) INTO settlements,settled FROM sharing.settlement s WHERE s.group_id=g AND p IN(s.sender_id,s.recipient_id);
 v:=v||jsonb_build_object('refunds',refunds,'settlements',settlements,'netMinor',((v->>'netMinor')::numeric-refund_received+refund_share+settled)::text,'historyNotice','Joining grants existing group history. Leaving retains visible bills, their corrections, and authorized resolution; unrelated later records remain hidden. Claiming accepts the bill, refund and settlement evidence shown. Manual confirmations remain unauthenticated historical evidence. No private money is posted.');
 IF octet_length(v::text)>1048576 THEN RAISE EXCEPTION 'manual identity complete review exceeds byte bound' USING ERRCODE='23514'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION sharing.review_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sharing.review_invitation(text) TO app_domain;
DO $$ BEGIN EXECUTE pg_get_functiondef('sharing.accept_invitation(text,uuid,integer,boolean,text)'::regprocedure); END $$;
