CREATE FUNCTION finance.group_effect_source(g uuid,p uuid,f uuid,s uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE v jsonb; paid numeric; share numeric:=0; movement numeric; resolved boolean; d date; purpose text; state text; version integer; e uuid; fingerprint text;
BEGIN
 IF p IS DISTINCT FROM sharing.actor(g) OR (f IS NULL)=(s IS NULL) THEN RAISE EXCEPTION 'owned concrete group source required' USING ERRCODE='42501'; END IF;
 IF f IS NOT NULL THEN
  SELECT r.expense_id,r.refund_date,coalesce(sum(a.amount_minor::numeric) FILTER(WHERE a.axis='received'),0),coalesce(sum(a.amount_minor::numeric) FILTER(WHERE a.axis='share_credit'),0) INTO e,d,paid,share FROM sharing.refund r LEFT JOIN sharing.refund_allocation a ON a.group_id=r.group_id AND a.refund_id=r.id AND a.participant_id=p WHERE r.group_id=g AND r.id=f GROUP BY r.id;
  IF d IS NULL OR paid+share=0 THEN RAISE EXCEPTION 'refund allocation unavailable' USING ERRCODE='42501'; END IF;
  movement:=paid;purpose:='refund_adoption';version:=1;state:='effective';
 ELSE
  SELECT x.payment_date,x.amount_minor,CASE WHEN x.sender_id=p THEN -x.amount_minor::numeric ELSE x.amount_minor::numeric END,x.state,x.version,CASE WHEN x.sender_id=p THEN 'settlement_sent' ELSE 'settlement_received' END INTO d,paid,movement,state,version,purpose FROM sharing.settlement x WHERE x.group_id=g AND x.id=s AND p IN(x.sender_id,x.recipient_id);
  IF d IS NULL THEN RAISE EXCEPTION 'settlement participant source unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 resolved:=(f IS NOT NULL OR state='confirmed') AND NOT EXISTS(
  SELECT b.id FROM sharing.shared_expense b WHERE b.group_id=g AND (b.id=e OR EXISTS(SELECT 1 FROM sharing.settlement_allocation a WHERE a.group_id=g AND a.settlement_id=s AND a.expense_id=b.id)) AND NOT EXISTS(
   SELECT 1 FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id JOIN finance.financial_action a ON a.workspace_id=l.workspace_id AND a.id=l.action_id WHERE l.workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND l.group_id=g AND l.participant_id=p AND l.expense_id=b.id AND r.source_expense_revision_id=b.current_revision_id AND a.current_revision_id=r.action_revision_id));
 v:=jsonb_build_object('groupId',g,'sourceId',coalesce(f,s),'purpose',purpose,'sourceVersion',version,'state',state,'paidMinor',paid::text,'shareMinor',share::text,'cashMinor',movement::text,'spendingMinor',CASE WHEN resolved THEN (-share)::text ELSE '0' END,'groupMinor',CASE WHEN resolved THEN (-movement+share)::text ELSE '0' END,'clearingMinor',CASE WHEN resolved THEN '0' ELSE (-movement)::text END,'canResolve',resolved,'effectiveDate',d::text);
 fingerprint:=encode(sha256(convert_to(v::text,'UTF8')),'hex');
 RETURN v||jsonb_build_object('sourceHash',fingerprint);
END $$;
REVOKE ALL ON FUNCTION finance.group_effect_source(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.group_effect_source(uuid,uuid,uuid,uuid) TO app_domain;

ALTER FUNCTION finance.validate_private_group_revision() RENAME TO validate_private_bill_revision;
CREATE FUNCTION finance.validate_private_group_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE l finance.private_group_link%ROWTYPE; v jsonb;
BEGIN
 IF NEW.expense_id IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO l FROM finance.private_group_link WHERE workspace_id=NEW.workspace_id AND id=NEW.link_id;
 v:=finance.group_effect_source(NEW.group_id,NEW.participant_id,NEW.source_refund_id,NEW.source_settlement_id);
 IF l.id IS NULL OR l.group_id<>NEW.group_id OR l.participant_id<>NEW.participant_id OR l.current_link_revision_id<>NEW.id OR l.action_id<>NEW.action_id OR l.refund_id IS DISTINCT FROM NEW.source_refund_id OR l.settlement_id IS DISTINCT FROM NEW.source_settlement_id OR l.purpose<>(v->>'purpose') OR NEW.source_settlement_version IS DISTINCT FROM (CASE WHEN NEW.source_settlement_id IS NOT NULL THEN (v->>'sourceVersion')::integer ELSE NULL END) OR NEW.paid_minor::numeric<>(v->>'paidMinor')::numeric OR NEW.share_minor::numeric<>(v->>'shareMinor')::numeric OR NEW.accepted_source_hash<>(v->>'sourceHash') OR NEW.consent_json<>jsonb_build_object('approved',true,'sourceHash',v->>'sourceHash') THEN RAISE EXCEPTION 'private effect requires exact current owned source approval' USING ERRCODE='23514'; END IF;
 IF NEW.revision_no>1 AND NOT EXISTS(SELECT 1 FROM finance.private_group_link_revision x WHERE x.workspace_id=NEW.workspace_id AND x.link_id=NEW.link_id AND x.id=NEW.previous_link_revision_id AND x.revision_no=NEW.revision_no-1) THEN RAISE EXCEPTION 'invalid private effect history chain' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
/* The original bill trigger remains attached to its function OID. */
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('finance.validate_private_bill_revision()'::regprocedure);
 EXECUTE regexp_replace(d,'BEGIN','BEGIN IF NEW.expense_id IS NULL THEN RETURN NULL; END IF;');
 d:=pg_get_functiondef('finance.validate_group_adoption_recipe()'::regprocedure);
 EXECUTE regexp_replace(d,'BEGIN','BEGIN IF NEW.action_kind=''group_effect'' THEN RETURN NULL; END IF;');
 d:=pg_get_functiondef('finance.validate_s1_revision_recipe()'::regprocedure);
 EXECUTE regexp_replace(d,'BEGIN','BEGIN IF NEW.action_kind=''group_effect'' THEN RETURN NULL; END IF;');
END $$;
CREATE CONSTRAINT TRIGGER private_effect_source AFTER INSERT ON finance.private_group_link_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_private_group_revision();
REVOKE ALL ON FUNCTION finance.validate_private_group_revision() FROM PUBLIC;

CREATE OR REPLACE FUNCTION finance.guard_private_group_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM 1 FROM sharing.expense_group WHERE id=NEW.group_id FOR UPDATE;
 IF NEW.participant_id IS DISTINCT FROM sharing.actor(NEW.group_id) OR NOT ((NEW.expense_id IS NOT NULL AND sharing.can_read_expense(NEW.group_id,NEW.expense_id)) OR (NEW.refund_id IS NOT NULL AND EXISTS(SELECT 1 FROM sharing.refund r WHERE r.group_id=NEW.group_id AND r.id=NEW.refund_id)) OR (NEW.settlement_id IS NOT NULL AND sharing.can_read_settlement(NEW.group_id,NEW.settlement_id))) THEN RAISE EXCEPTION 'private adoption requires owned source entitlement' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'current_link_revision_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_link_revision_id') THEN RAISE EXCEPTION 'private link identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION finance.validate_group_effect_recipe() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE x finance.private_group_link_revision%ROWTYPE; r finance.action_revision%ROWTYPE; b finance.group_ledger_binding%ROWTYPE; v jsonb; actual_cash numeric; actual_spending numeric; actual_group numeric; actual_clearing numeric; n integer; expected integer;
BEGIN
 SELECT * INTO r FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND id=NEW.id;
 IF r.action_kind<>'group_effect' THEN RETURN NULL; END IF;
 SELECT * INTO x FROM finance.private_group_link_revision WHERE workspace_id=r.workspace_id AND action_revision_id=r.id;
 IF x.id IS NULL OR x.expense_id IS NOT NULL OR r.state<>'posted' OR r.change_kind='void' THEN RAISE EXCEPTION 'group effect requires concrete immutable source evidence' USING ERRCODE='23514'; END IF;
 v:=finance.group_effect_source(x.group_id,x.participant_id,x.source_refund_id,x.source_settlement_id);
 SELECT * INTO b FROM finance.group_ledger_binding WHERE workspace_id=x.workspace_id AND group_id=x.group_id AND participant_id=x.participant_id;
 IF b.id IS NULL OR r.primary_effective_date::text<>v->>'effectiveDate' THEN RAISE EXCEPTION 'group effect requires bound buckets and source date' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.kind IN('cash_asset','card_liability')),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.kind='expense' AND p.expense_class='refund_offset'),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.id IN(b.receivable_ledger_account_id,b.payable_ledger_account_id)),0),coalesce(sum(p.amount_minor::numeric) FILTER(WHERE l.kind='payment_clearing_asset' AND l.code='group:'||x.group_id::text||':clearing'),0),count(*) INTO actual_cash,actual_spending,actual_group,actual_clearing,n FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id;
 expected:=CASE WHEN (v->>'cashMinor')::numeric<>0 THEN 1 ELSE 0 END+CASE WHEN (v->>'spendingMinor')::numeric<>0 THEN 1 ELSE 0 END+CASE WHEN (v->>'groupMinor')::numeric<>0 THEN 1 ELSE 0 END+CASE WHEN (v->>'clearingMinor')::numeric<>0 THEN 1 ELSE 0 END;
 IF actual_cash<>(v->>'cashMinor')::numeric OR actual_spending<>(v->>'spendingMinor')::numeric OR actual_group<>(v->>'groupMinor')::numeric OR actual_clearing<>(v->>'clearingMinor')::numeric OR n<>expected OR (SELECT count(*) FROM finance.journal WHERE workspace_id=r.workspace_id AND action_revision_id=r.id AND role='economic' AND state='posted')<>1 THEN RAISE EXCEPTION 'group cash, spending, position and clearing must reconcile exactly' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.role='economic' JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=r.workspace_id AND p.action_revision_id=r.id AND ((l.kind='cash_asset' AND (p.cash_flow_kind NOT IN('clearing','refund') OR NOT EXISTS(SELECT 1 FROM finance.financial_account a WHERE a.workspace_id=r.workspace_id AND a.ledger_account_id=l.id AND a.opening_cutoff_date<r.primary_effective_date))) OR (l.kind='card_liability' AND (x.source_refund_id IS NULL OR NOT EXISTS(SELECT 1 FROM finance.card_activity a JOIN finance.credit_card c ON c.workspace_id=a.workspace_id AND c.id=a.card_id AND c.liability_ledger_account_id=l.id WHERE a.workspace_id=r.workspace_id AND a.action_revision_id=r.id AND a.activity_kind='refund' AND a.signed_liability_minor::numeric=-(SELECT sum(p0.amount_minor::numeric) FROM finance.posting p0 WHERE p0.workspace_id=r.workspace_id AND p0.action_revision_id=r.id AND p0.ledger_account_id=l.id)))))) THEN RAISE EXCEPTION 'group funding classification or card evidence mismatch' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a JOIN core.command_receipt c ON c.workspace_id=a.workspace_id AND c.id=a.command_receipt_id WHERE a.workspace_id=r.workspace_id AND a.command_receipt_id=r.command_receipt_id AND a.subject_kind='financial_action' AND a.subject_id=r.action_id AND a.subject_version=r.revision_no AND a.after_json @> jsonb_build_object('actionRevisionId',r.id,'actionKind','group_effect','privateGroupLinkRevisionId',x.id,'acceptedSourceHash',x.accepted_source_hash) AND c.state='completed' AND c.retain_until IS NULL) THEN RAISE EXCEPTION 'group effect requires permanent owner audit and receipt' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION finance.validate_group_effect_recipe() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER group_effect_recipe AFTER INSERT OR UPDATE ON finance.action_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance.validate_group_effect_recipe();
