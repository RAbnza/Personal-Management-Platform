BEGIN;
-- Calculation version 2 ports adopt-group-effect.ts's exact bucket-offset
-- policy. Original accepted version-1 recipes/plans remain replayable unchanged.
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p3_incremental;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';plan jsonb;posts jsonb:='[]';entry jsonb;source uuid;
 group_delta numeric:=0;payable numeric;receivable numeric;pd numeric;rd numeric;inserted boolean:=false;BEGIN
 plan:=salapiya_p2.plan_p3_incremental(p,cid,cmd,seq);
 IF cmd->>'kind'<>'shared' OR v->>'sharedAccounting' IS DISTINCT FROM '2' OR v->>'sharedMode' NOT IN ('refund','clear','unclear') THEN RETURN plan;END IF;
 IF v->>'sharedMode'='unclear' THEN
   source:=(v->>'paymentSource')::uuid;
   FOR entry IN SELECT jsonb_build_object('ledger',q.ledger,'amount',(-q.amount_minor::numeric)::text,'date',v->>'date','account',NULL,'category',NULL) FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.revision_id=source ORDER BY q.line LOOP posts:=posts||jsonb_build_array(entry);END LOOP;
 ELSE
   SELECT coalesce(sum(q.amount_minor::numeric) FILTER(WHERE q.ledger='shared_payable'),0),coalesce(sum(q.amount_minor::numeric) FILTER(WHERE q.ledger='shared_receivable'),0)
   INTO payable,receivable FROM salapiya_p2.posting q JOIN salapiya_p2.current_revision r ON r.id=q.revision_id
   WHERE r.profile_id=p AND r.values_json->>'sharedGroup'=v->>'sharedGroup' AND (coalesce(v->>'source','')='' OR r.id::text<>v->>'source');
   SELECT coalesce(sum((x->>'amount')::numeric),0) INTO group_delta FROM jsonb_array_elements(plan->'revision'->'postings') x WHERE x->>'ledger' IN ('shared_payable','shared_receivable');
   pd:=CASE WHEN group_delta>0 THEN least(group_delta,greatest(-payable,0)) WHEN group_delta<0 THEN group_delta+least(-group_delta,greatest(receivable,0)) ELSE 0 END;rd:=group_delta-pd;
   FOR entry IN SELECT value FROM jsonb_array_elements(plan->'revision'->'postings') LOOP
     IF entry->>'ledger' IN ('shared_payable','shared_receivable') THEN
       IF NOT inserted THEN
         IF pd<>0 THEN posts:=posts||jsonb_build_array(salapiya_p2.post('shared_payable',pd,v->>'date'));END IF;
         IF rd<>0 THEN posts:=posts||jsonb_build_array(salapiya_p2.post('shared_receivable',rd,v->>'date'));END IF;
         inserted:=true;
       END IF;
     ELSE posts:=posts||jsonb_build_array(entry);END IF;
   END LOOP;
 END IF;
 RETURN jsonb_set(plan,'{revision,postings}',posts);END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p3_incremental(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
