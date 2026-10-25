BEGIN;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p3_clearing;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';old salapiya_p2.revision;g jsonb;prior jsonb;next jsonb;plan jsonb;derived jsonb;BEGIN
 IF cmd->>'kind'<>'shared' OR v->>'sharedMode'<>'payment' OR coalesce(v->>'source','')='' THEN RETURN salapiya_p2.plan_p3_clearing(p,cid,cmd,seq);END IF;
 SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'source';
 IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>'sourceVersion' OR old.values_json->>'sharedMode'<>'payment' OR old.values_json->>'sharedGroup' IS DISTINCT FROM v->>'sharedGroup' OR old.values_json->>'sharedKey'=v->>'sharedKey' OR old.values_json->>'fundingAmount' IS DISTINCT FROM v->>'fundingAmount' OR old.values_json->>'direction' IS DISTINCT FROM v->>'direction' OR old.values_json->>'account' IS DISTINCT FROM v->>'account' OR old.effective_date IS DISTINCT FROM v->>'date' THEN PERFORM salapiya_p3.fail('Reassignment must retain exact actual money');END IF;
 PERFORM salapiya_p2.required(v,'reason');
 IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision d WHERE d.profile_id=p AND d.source_id=old.id AND (d.values_json->>'sharedMode'<>'clear' OR NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision u WHERE u.profile_id=p AND u.source_id=d.id AND u.values_json->>'sharedMode'='unclear'))) THEN PERFORM salapiya_p3.fail('Restore dependent clearing before reusing actual money');END IF;
 SELECT z.document::jsonb INTO g FROM public.p3_group z JOIN public.p2_profile profile ON profile.owner_id=z.owner_id WHERE profile.id=p AND z.group_id=(v->>'sharedGroup')::uuid;
 prior:=g->'settlements'->(old.values_json->>'sharedKey');next:=g->'settlements'->(v->>'sharedKey');
 IF prior IS NULL OR next IS NULL OR prior->>'state' NOT IN ('cancelled','reversed') OR next->>'state' NOT IN ('pending','confirmed') OR
 (prior->>'sender',prior->>'recipient',prior->>'date',prior->>'amount') IS DISTINCT FROM (next->>'sender',next->>'recipient',next->>'date',next->>'amount') THEN PERFORM salapiya_p3.fail('Closed-report reassignment requires identical parties, date and amount');END IF;
 -- The original create planner validates current group identity and exact
 -- funding. It must not treat retained existing cash as a second withdrawal.
 -- The wrapper has already proved unchanged money and restored dependencies.
 derived:=jsonb_set(cmd,'{values}',(v-ARRAY['source','sourceVersion'])||jsonb_build_object('acknowledge','true'));
 plan:=salapiya_p2.plan_p3_clearing(p,cid,derived,seq);
 plan:=jsonb_set(plan,'{revision,values}',v);
 plan:=jsonb_set(plan,'{revision,actionId}',to_jsonb(old.action_id::text));
 plan:=jsonb_set(plan,'{revision,number}',to_jsonb(old.revision_no+1));
 plan:=jsonb_set(plan,'{revision,previous}',to_jsonb(old.id::text));
 plan:=jsonb_set(plan,'{revision,change}','"replace"');
 RETURN plan;END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p3_clearing(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
