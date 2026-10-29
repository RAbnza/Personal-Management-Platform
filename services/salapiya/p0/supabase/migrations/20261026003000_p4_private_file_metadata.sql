BEGIN;
-- Attachments refer to immutable historical financial sources, so metadata
-- does not veto a legitimate new financial revision. Source FKs remain intact.
DO $$DECLARE f record;definition text;original text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='salapiya_p2' AND p.proname LIKE 'plan%' LOOP
  definition:=pg_get_functiondef(f.oid);original:=definition;
  definition:=replace(definition,'WHERE r.profile_id=p AND s.action_id=replaced.action_id','WHERE r.profile_id=p AND coalesce(r.values_json->>''financeType'','''')<>''financialFile'' AND s.action_id=replaced.action_id');
  definition:=replace(definition,'r.source_id=old.id','(r.source_id=old.id AND coalesce(r.values_json->>''financeType'','''')<>''financialFile'')');
  definition:=replace(definition,'z.source_id=old.id','(z.source_id=old.id AND coalesce(z.values_json->>''financeType'','''')<>''financialFile'')');
  IF definition<>original THEN EXECUTE definition;END IF;
 END LOOP;
END $$;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_recipes;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';k text:=cmd->>'kind';source salapiya_p2.revision;d text;title text;size numeric;count bigint;reserved numeric;BEGIN
 IF k NOT IN ('financialFile','fileDetach') THEN RETURN salapiya_p2.plan_p4_recipes(p,cid,cmd,seq);END IF;
 PERFORM salapiya_p2.p4_command(p,cmd);d:=salapiya_p2.day(v->>'date');title:=salapiya_p2.required(v,'name',200);
 IF k='financialFile' THEN
  IF coalesce(v->>'mime','') NOT IN ('application/pdf','image/jpeg','image/png') OR coalesce(v->>'checksum','') !~ '^[a-f0-9]{64}$' OR coalesce(v->>'size','') !~ '^[1-9][0-9]{0,7}$' OR title ~ '[\\/:[:cntrl:]]' THEN RAISE EXCEPTION 'invalid bounded supporting-file metadata' USING ERRCODE='22023';END IF;
  size:=(v->>'size')::numeric;IF size>10485760 THEN RAISE EXCEPTION 'supporting-file size exceeds 10 MiB' USING ERRCODE='22023';END IF;
  SELECT * INTO source FROM salapiya_p2.revision r WHERE r.profile_id=p AND r.id::text=v->>'sourceRevision';
  IF source.id IS NULL OR coalesce(source.values_json->>'financeType',source.kind) IN ('financialFile','fileDetach','cashImport','cashImportChunk','cashImportPreview','cashImportDecision','cashImportProcess','cashImportCancel') THEN RAISE EXCEPTION 'owned concrete financial source required' USING ERRCODE='22023';END IF;
  SELECT count(*),coalesce(sum((r.values_json->>'size')::numeric),0) INTO count,reserved FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.values_json->>'financeType'='financialFile' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'='fileDetach' AND x.values_json->>'file'=r.id::text);
  IF count>=1000 OR reserved+size>1073741824 THEN RAISE EXCEPTION 'supporting-file metadata quota exceeded' USING ERRCODE='22023';END IF;
  v:=v||jsonb_build_object('cloudState','unavailable_unscanned','byteCoverage','device-local-only','sourceKind',coalesce(source.values_json->>'financeType',source.kind));
 ELSE
  source:=salapiya_p2.p4_source(p,v->>'file',ARRAY['financialFile']);PERFORM salapiya_p2.required(v,'reason');
  IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'='fileDetach' AND x.values_json->>'file'=source.id::text) THEN RAISE EXCEPTION 'attachment link already archived' USING ERRCODE='22023';END IF;
 END IF;
 v:=v||jsonb_build_object('financeType',k,'financeContract','1');
 RETURN salapiya_p2.p4_finish(p,cid,v,k,NULL,'adjustment','[]',0,source.id);
END $$;
DO $$DECLARE definition text;needle text:='''debtPayment'')';BEGIN
 definition:=pg_get_functiondef('salapiya_p2.submit(uuid,uuid,jsonb,text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected ordinary private command policy';END IF;
 EXECUTE replace(definition,needle,'''debtPayment'',''financialFile'',''fileDetach'')');
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p4_recipes(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
