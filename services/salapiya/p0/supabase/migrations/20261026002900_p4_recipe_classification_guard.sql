BEGIN;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_import;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';k text:=cmd->>'kind';old salapiya_p2.revision;movement numeric;BEGIN
 IF v ? 'financeContract' AND v->>'financeContract' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'unsupported financial recipe version' USING ERRCODE='22023';END IF;
 IF k IN ('account','category','income','expense','transfer','correction','reversal','refund','reconcile','adjustment','archive') AND NOT(k='expense' AND v->>'funding' IS NOT DISTINCT FROM 'card') AND (v ? 'financeType' OR v ? 'financeContract') THEN RAISE EXCEPTION 'source classification is command owned' USING ERRCODE='22023';END IF;
 IF k='shared' AND v->>'funding'='card' THEN
  SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'source';
  SELECT coalesce(sum(q.amount_minor::numeric),0) INTO movement FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.revision_id=old.id AND q.ledger='card_liability';
  IF movement<>salapiya_p2.php(v,'fundingAmount',true)*(CASE WHEN v->>'sharedMode'='bill' THEN -1 ELSE 1 END) THEN RAISE EXCEPTION 'immutable card liability evidence required' USING ERRCODE='22023';END IF;
 END IF;
 RETURN salapiya_p2.plan_p4_import(p,cid,cmd,seq);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p4_import(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
