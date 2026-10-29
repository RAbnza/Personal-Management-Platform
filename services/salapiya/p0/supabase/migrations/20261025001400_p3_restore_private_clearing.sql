BEGIN;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p3_refund;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';source salapiya_p2.revision;g jsonb;s jsonb;amount numeric;effect numeric;d text;posts jsonb;BEGIN
 IF cmd->>'kind'<>'shared' OR v->>'sharedMode'<>'unclear' THEN RETURN salapiya_p2.plan_p3_refund(p,cid,cmd,seq);END IF;
 IF cmd-ARRAY['contract','authority','owner','expectedVersion','kind','values']<>'{}' OR cmd->'contract' IS DISTINCT FROM '1' OR cmd->>'authority'<>'local' OR cmd->>'owner' IS DISTINCT FROM p::text OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>20000) OR coalesce(v->>'source','')<>'' THEN PERFORM salapiya_p3.fail('Invalid private clearing contract');END IF;
 SELECT * INTO source FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'paymentSource';
 amount:=salapiya_p2.php(v,'fundingAmount');d:=salapiya_p2.day(v->>'date');PERFORM salapiya_p2.required(v,'reason');
 IF source.id IS NULL OR source.values_json->>'sharedMode'<>'clear' OR source.values_json->>'sharedGroup' IS DISTINCT FROM v->>'sharedGroup' OR source.values_json->>'sharedKey' IS DISTINCT FROM v->>'sharedKey' OR source.values_json->>'fundingAmount' IS DISTINCT FROM v->>'fundingAmount' OR source.values_json->>'direction' IS DISTINCT FROM v->>'direction' OR salapiya_p2.php(v,'shareAmount',true)<>0 OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.source_id=source.id) THEN PERFORM salapiya_p3.fail('Private clearing already restored or changed');END IF;
 SELECT z.document::jsonb INTO g FROM public.p3_group z JOIN public.p2_profile profile ON profile.owner_id=z.owner_id WHERE profile.id=p AND z.group_id=(v->>'sharedGroup')::uuid;
 s:=g->'settlements'->(v->>'sharedKey');
 IF s IS NULL OR s->>'id' IS DISTINCT FROM v->>'sharedRevision' OR s->>'state' NOT IN ('reversed','cancelled','disputed') THEN PERFORM salapiya_p3.fail('Current closed or disputed group source required');END IF;
 effect:=CASE WHEN v->>'direction'='out' THEN amount ELSE -amount END;
 posts:=jsonb_build_array(salapiya_p2.post('shared_clearing',effect,d),salapiya_p2.post(CASE WHEN effect>0 THEN 'shared_payable' ELSE 'shared_receivable' END,-effect,d));
 RETURN jsonb_build_object('account',NULL,'category',NULL,'archiveId',NULL,'revision',jsonb_build_object('id',cid::text,'actionId',cid::text,'kind','adjustment','change','create','date',d,'title',v->>'name','amount',amount::text,'number',1,'previous',NULL,'source',source.id::text,'values',v,'postings',posts));
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p3_refund(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
