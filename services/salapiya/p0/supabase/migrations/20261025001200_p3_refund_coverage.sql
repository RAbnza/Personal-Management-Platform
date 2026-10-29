BEGIN;
-- Keep the reviewed financial planner intact and extend only the independently
-- received refund axis. Incomplete private coverage holds actual money in
-- clearing; it cannot invent consumption recognition or group assets.
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p3_base;
DO $$DECLARE definition text:=pg_get_functiondef('salapiya_p2.plan_p3_base(uuid,uuid,jsonb,bigint)'::regprocedure);BEGIN
 IF position('IF old.id IS NOT NULL AND mode<>''bill'' THEN' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected P3 planner definition; preserve and review';END IF;
 EXECUTE replace(definition,'IF old.id IS NOT NULL AND mode<>''bill'' THEN','IF old.id IS NOT NULL AND mode NOT IN (''bill'',''refund'') THEN');
END $$;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';g jsonb;b jsonb;parent text;f jsonb;covered boolean;plan jsonb;posts jsonb;amount numeric;d text;old salapiya_p2.revision;BEGIN
 IF cmd->>'kind'<>'shared' OR v->>'sharedMode'<>'refund' THEN RETURN salapiya_p2.plan_p3_base(p,cid,cmd,seq);END IF;
 SELECT z.document::jsonb INTO g FROM public.p3_group z JOIN public.p2_profile profile ON profile.owner_id=z.owner_id WHERE profile.id=p AND z.group_id=(v->>'sharedGroup')::uuid;
 SELECT x.key,x.value INTO parent,b FROM jsonb_each(g->'bills') x WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(x.value->'refunds') r WHERE r->>'id'=v->>'sharedKey');
 IF parent IS NULL OR parent IS DISTINCT FROM v->>'billSource' OR b->'revisions'->-1->>'id' IS DISTINCT FROM v->>'billRevision' THEN PERFORM salapiya_p3.fail('Refund parent source changed');END IF;
 covered:=EXISTS(SELECT 1 FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.values_json->>'sharedMode'='bill' AND z.values_json->>'sharedGroup'=v->>'sharedGroup' AND z.values_json->>'sharedKey'=parent AND z.values_json->>'sharedRevision'=v->>'billRevision');
 IF v->>'coverage' IS DISTINCT FROM (CASE WHEN covered THEN 'adopted' ELSE 'clearing' END) THEN PERFORM salapiya_p3.fail('Private refund coverage changed');END IF;
 -- A refund reclassification replaces its own prior classification while
 -- retaining exactly the same real cash, account and immutable action identity.
 IF coalesce(v->>'source','')<>'' THEN
   SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'source';
   IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>'sourceVersion' OR old.values_json->>'sharedMode'<>'refund' OR old.values_json->>'sharedGroup' IS DISTINCT FROM v->>'sharedGroup' OR old.values_json->>'sharedKey' IS DISTINCT FROM v->>'sharedKey' OR old.values_json->>'fundingAmount' IS DISTINCT FROM v->>'fundingAmount' OR old.values_json->>'account' IS DISTINCT FROM v->>'account' OR old.effective_date IS DISTINCT FROM v->>'date' THEN PERFORM salapiya_p3.fail('Refund reclassification retains actual money');END IF;
   PERFORM salapiya_p2.required(v,'reason');
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.source_id=old.id) THEN PERFORM salapiya_p3.fail('Resolve dependent private evidence first');END IF;
 END IF;
 plan:=salapiya_p2.plan_p3_base(p,cid,cmd,seq);
 IF NOT covered THEN
   amount:=salapiya_p2.php(v,'fundingAmount',true);d:=salapiya_p2.day(v->>'date');posts:='[]';
   IF amount<>0 THEN posts:=jsonb_build_array(salapiya_p2.post('cash',amount,d,v->>'account'),salapiya_p2.post('shared_clearing',-amount,d));END IF;
   plan:=jsonb_set(plan,'{revision,postings}',posts);plan:=jsonb_set(plan,'{revision,amount}','"0"');
 END IF;
 RETURN plan;END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p3_base(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
