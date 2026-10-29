BEGIN;
CREATE FUNCTION salapiya_p2.p4_json_text(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text;BEGIN
 IF jsonb_typeof(v)='object' THEN SELECT '{'||coalesce(string_agg(to_json(e.key)::text||':'||salapiya_p2.p4_json_text(e.value),',' ORDER BY e.key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v) e;RETURN result;
 ELSIF jsonb_typeof(v)='array' THEN SELECT '['||coalesce(string_agg(salapiya_p2.p4_json_text(e.value),',' ORDER BY e.ordinality),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e;RETURN result;
 ELSE RETURN v::text;END IF;
END $$;
CREATE FUNCTION salapiya_p2.p4_import_id(p uuid,batch uuid,row_key text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b bytea:=substring(sha256(convert_to('pmp/import/v1/'||p::text||'/'||batch::text||'/'||row_key,'UTF8')),1,16);BEGIN
 b:=set_byte(b,6,(get_byte(b,6)&15)|80);b:=set_byte(b,8,(get_byte(b,8)&63)|128);RETURN encode(b,'hex')::uuid::text;
END $$;
CREATE FUNCTION salapiya_p2.p4_import_stamp(p uuid,account uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT encode(sha256(convert_to(a.cutoff||'|'||coalesce((SELECT string_agg(r.id::text,'|' ORDER BY r.id::text COLLATE "C") FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND ((r.kind='opening' AND r.action_id=account) OR EXISTS(SELECT 1 FROM salapiya_p2.posting q WHERE q.revision_id=r.id AND q.account_id=account))),''),'UTF8')),'hex') FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id=account $$;
CREATE FUNCTION salapiya_p2.p4_import_head(p uuid,id text) RETURNS salapiya_p2.revision LANGUAGE sql STABLE SET search_path='' AS $$ SELECT salapiya_p2.p4_source(p,id,ARRAY['cashImport']) $$;
CREATE FUNCTION salapiya_p2.p4_normalize_cash(cells jsonb,header jsonb,a jsonb,cutoff text,today text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row jsonb:='{}';errors jsonb:='[]';d text;k text;classification text;n numeric;name text;reference text;raw text;mapping jsonb:=a->'mapping';index integer;BEGIN
 BEGIN
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'date';raw:=cells->>index;
  IF a->>'dateInterpretation'='YYYY-MM-DD' THEN d:=salapiya_p2.day(raw);
  ELSE
   IF raw !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN RAISE EXCEPTION 'invalid date';END IF;
   d:=salapiya_p2.day(substring(raw,7,4)||'-'||CASE WHEN a->>'dateInterpretation'='DD/MM/YYYY' THEN substring(raw,4,2) ELSE substring(raw,1,2) END||'-'||CASE WHEN a->>'dateInterpretation'='DD/MM/YYYY' THEN substring(raw,1,2) ELSE substring(raw,4,2) END);
  END IF;
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'kind';k:=cells->>index;
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'classification';classification:=cells->>index;
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'amountMinor';raw:=cells->>index;
  IF raw !~ '^[1-9][0-9]*$' OR length(raw)>12 OR raw::numeric>100000000000 THEN RAISE EXCEPTION 'invalid exact amount';END IF;n:=raw::numeric;
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'description';name:=btrim(cells->>index);
  SELECT e.ordinality::int-1 INTO index FROM jsonb_array_elements_text(header) WITH ORDINALITY e WHERE e.value=mapping->>'reference';reference:=btrim(cells->>index);
  IF k NOT IN ('income','expense') OR k IS NULL OR (k='expense' AND classification IS DISTINCT FROM 'expense') OR (k='income' AND coalesce(classification,'') NOT IN ('earned','gift','reward','other')) OR length(name) NOT BETWEEN 1 AND 2000 OR length(reference)>200 THEN RAISE EXCEPTION 'invalid classification or text';END IF;
  row:=jsonb_build_object('date',d,'kind',k,'amountMinor',n::text,'classification',classification,'name',name,'reference',reference);
  IF d<=cutoff THEN errors:=errors||'"Date must follow the confirmed opening cutoff."'::jsonb;END IF;
  IF d>today THEN errors:=errors||'"Future cash history is unsupported."'::jsonb;END IF;
  row:=row||jsonb_build_object('fingerprint',encode(sha256(convert_to(salapiya_p2.p4_json_text(jsonb_build_array(d,k,n::text,classification,name,nullif(reference,''))),'UTF8')),'hex'));
 EXCEPTION WHEN OTHERS THEN errors:=errors||'"Mapping or row values are invalid."'::jsonb;
 END;
 RETURN row||jsonb_build_object('errors',errors);
END $$;
CREATE FUNCTION salapiya_p2.p4_import_next(p uuid,decision salapiya_p2.revision) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE preview salapiya_p2.revision;head salapiya_p2.revision;a jsonb;result jsonb:='[]';i int;row jsonb;rebasing boolean;BEGIN
 preview:=salapiya_p2.p4_source(p,decision.values_json->>'preview',ARRAY['cashImportPreview']);head:=salapiya_p2.p4_import_head(p,preview.values_json->>'batch');a:=(head.values_json->>'assumptions')::jsonb;
 rebasing:=a->>'cutoffStrategy'='rebase_history' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.revision r WHERE r.profile_id=p AND r.id::text=salapiya_p2.p4_import_id(p,head.id,'rebase'));
 FOR i IN 0..(decision.values_json->>'rowCount')::int-1 LOOP
  row:=(preview.values_json->>('row'||i))::jsonb;
  IF (decision.values_json->>('row'||i))::jsonb->'include'='true' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.revision r WHERE r.profile_id=p AND r.id::text=salapiya_p2.p4_import_id(p,head.id,(i+1)::text))
  AND (NOT rebasing OR row->>'date'<=preview.values_json->>'cutoff') THEN
   result:=result||to_jsonb(i);IF NOT rebasing AND jsonb_array_length(result)=50 THEN EXIT;END IF;
  END IF;
 END LOOP;RETURN result;
END $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_reviewed;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';op text:=cmd->>'kind';d text;head salapiya_p2.revision;preview salapiya_p2.revision;decision salapiya_p2.revision;old salapiya_p2.revision;process salapiya_p2.revision;existing salapiya_p2.revision;
 a jsonb;header jsonb;mapping jsonb;cells jsonb;row jsonb;choice jsonb;warnings jsonb;posts jsonb:='[]';numbers jsonb;expected jsonb;selected jsonb:='[]';staged jsonb:='{}';cutoff_update jsonb;
 account salapiya_p2.account;count int;offset_no int;chunk_count int;i int;n int;entry record;source uuid;total numeric:=0;net numeric:=0;balance numeric;day record;started boolean;rebasing boolean;
 seen text[]:='{}';refs text[]:='{}';identical boolean;stamp text;opening salapiya_p2.revision;kind text:='adjustment';r jsonb;plan jsonb;
BEGIN
 IF op NOT IN ('cashImport','cashImportChunk','cashImportPreview','cashImportDecision','cashImportProcess','cashImportCancel','cashOpeningRebase') THEN
  IF v ? 'importProcess' THEN PERFORM salapiya_p2.p4_validate_import_child(p,cid,cmd);END IF;
  RETURN salapiya_p2.plan_p4_reviewed(p,cid,cmd,seq);
 END IF;
 IF op='cashImportChunk' THEN
  IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR cmd-ARRAY['contract','authority','owner','expectedVersion','kind','values']<>'{}' OR cmd->'contract' IS DISTINCT FROM '1' OR cmd->>'authority' IS DISTINCT FROM 'local' OR cmd->>'owner' IS DISTINCT FROM p::text OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_each(v))>512 OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>40000) THEN RAISE EXCEPTION 'invalid CSV chunk contract' USING ERRCODE='22023';END IF;
 ELSE PERFORM salapiya_p2.p4_command(p,cmd);END IF;
 d:=salapiya_p2.day(v->>'date');PERFORM salapiya_p2.required(v,'name');v:=v||jsonb_build_object('financeType',op,'financeContract','1');
 IF op='cashImport' THEN
  a:=(v->>'assumptions')::jsonb;header:=(v->>'header')::jsonb;mapping:=a->'mapping';
  IF a-ARRAY['sourceFormat','formatVersion','currency','account','mapping','dateInterpretation','cutoffStrategy','earlierDate','earlierMinor']<>'{}' OR a->>'sourceFormat' IS DISTINCT FROM 'pmp-cash-activity' OR a->'formatVersion' IS DISTINCT FROM '1' OR a->>'currency' IS DISTINCT FROM 'PHP' OR coalesce(a->>'dateInterpretation','') NOT IN ('YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY') OR coalesce(a->>'cutoffStrategy','') NOT IN ('after_opening','rebase_history') THEN RAISE EXCEPTION 'unsupported reviewed cash format' USING ERRCODE='22023';END IF;
  SELECT * INTO account FROM salapiya_p2.account x WHERE x.profile_id=p AND x.id::text=a->>'account';IF account.id IS NULL OR account.archived THEN RAISE EXCEPTION 'active owned cash account required' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(header) e WHERE length(btrim(e.value))=0 OR length(e.value)>200 OR e.value ~ '[[:cntrl:]]') OR jsonb_array_length(header)<>6 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(header))<>6 OR (SELECT count(*) FROM jsonb_each(mapping))<>6 OR NOT(mapping ?& ARRAY['date','kind','amountMinor','classification','description','reference']) OR (SELECT count(DISTINCT value) FROM jsonb_each_text(mapping))<>6 OR EXISTS(SELECT 1 FROM jsonb_each_text(mapping) e WHERE NOT(header ? e.value)) THEN RAISE EXCEPTION 'map all six distinct columns' USING ERRCODE='22023';END IF;
  count:=(v->>'rowCount')::int;IF count NOT BETWEEN 1 AND 500 OR coalesce(v->>'checksum','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid cash file bounds or hash' USING ERRCODE='22023';END IF;
  IF a->>'cutoffStrategy'='rebase_history' THEN
   IF salapiya_p2.day(a->>'earlierDate')>=account.cutoff OR coalesce(a->>'earlierMinor','') !~ '^(0|[1-9][0-9]*)$' OR length(a->>'earlierMinor')>12 OR (a->>'earlierMinor')::numeric>100000000000 THEN RAISE EXCEPTION 'invalid earlier opening baseline' USING ERRCODE='22023';END IF;
  ELSIF a->>'earlierDate' IS NOT NULL OR a->>'earlierMinor' IS NOT NULL THEN RAISE EXCEPTION 'after-opening import cannot change baseline' USING ERRCODE='22023';END IF;
  v:=v||jsonb_build_object('cutoff',account.cutoff);
 ELSIF op='cashImportChunk' THEN
  head:=salapiya_p2.p4_import_head(p,v->>'batch');source:=head.id;offset_no:=(v->>'offset')::int;count:=(v->>'rowCount')::int;
  IF offset_no<0 OR count NOT BETWEEN 1 AND 16 OR offset_no+count>(head.values_json->>'rowCount')::int OR cid::text<>salapiya_p2.p4_import_id(p,head.id,'stage/'||offset_no::text) OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'=op AND x.values_json->>'batch'=head.id::text AND x.values_json->>'offset'=v->>'offset') THEN RAISE EXCEPTION 'invalid original staged chunk' USING ERRCODE='22023';END IF;
  FOR i IN 0..count-1 LOOP cells:=(v->>('row'||i))::jsonb;IF jsonb_array_length(cells)<>6 OR EXISTS(SELECT 1 FROM jsonb_array_elements(cells) x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION 'six string CSV cells required' USING ERRCODE='22023';END IF;END LOOP;
 ELSIF op='cashImportPreview' THEN
  head:=salapiya_p2.p4_import_head(p,v->>'batch');source:=head.id;a:=(head.values_json->>'assumptions')::jsonb;header:=(head.values_json->>'header')::jsonb;count:=(head.values_json->>'rowCount')::int;
  SELECT * INTO account FROM salapiya_p2.account x WHERE x.profile_id=p AND x.id::text=a->>'account';IF account.archived OR account.cutoff IS DISTINCT FROM head.values_json->>'cutoff' THEN RAISE EXCEPTION 'opening changed; review new CSV batch' USING ERRCODE='22023';END IF;
  FOR entry IN SELECT * FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'='cashImportChunk' AND x.values_json->>'batch'=head.id::text LOOP
   FOR i IN 0..(entry.values_json->>'rowCount')::int-1 LOOP n:=(entry.values_json->>'offset')::int+i;IF staged ? n::text THEN RAISE EXCEPTION 'overlapping staged CSV rows' USING ERRCODE='22023';END IF;staged:=staged||jsonb_build_object(n::text,(entry.values_json->>('row'||i))::jsonb);END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_each(staged))<>count OR EXISTS(SELECT 1 FROM generate_series(0,count-1) missing(n) WHERE NOT(staged ? missing.n::text)) THEN RAISE EXCEPTION 'CSV staging incomplete' USING ERRCODE='22023';END IF;
  FOR existing IN SELECT * FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.kind IN ('expense','income') AND x.values_json->>'account'=account.id::text AND x.values_json->>'funding' IS DISTINCT FROM 'card' LOOP
   seen:=array_append(seen,encode(sha256(convert_to(salapiya_p2.p4_json_text(jsonb_build_array(existing.effective_date,existing.kind,existing.amount_minor::text,CASE WHEN existing.kind='expense' THEN 'expense' ELSE existing.values_json->>'incomeClass' END,existing.title,nullif(existing.values_json->>'reference',''))),'UTF8')),'hex'));
   IF coalesce(existing.values_json->>'reference','')<>'' THEN refs:=array_append(refs,existing.values_json->>'reference');END IF;
  END LOOP;
  identical:=EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'='cashImport' AND x.id<>head.id AND x.values_json->>'checksum'=head.values_json->>'checksum');
  FOR i IN 0..count-1 LOOP
   cells:=staged->i::text;row:=salapiya_p2.p4_normalize_cash(cells,header,a,CASE WHEN a->>'cutoffStrategy'='rebase_history' THEN a->>'earlierDate' ELSE account.cutoff END,d);warnings:='[]';
   IF row ? 'fingerprint' THEN
    IF row->>'fingerprint'=ANY(seen) THEN warnings:=warnings||'"Matching cash activity"'::jsonb;END IF;seen:=array_append(seen,row->>'fingerprint');
    IF row->>'reference'<>'' THEN IF row->>'reference'=ANY(refs) THEN warnings:=warnings||'"Matching reference"'::jsonb;END IF;refs:=array_append(refs,row->>'reference');END IF;
   END IF;
   IF identical THEN warnings:=warnings||'"Identical file checksum"'::jsonb;END IF;
   row:=row||jsonb_build_object('warnings',warnings,'rowCommand',salapiya_p2.p4_import_id(p,head.id,(i+1)::text),'sourceRowHash',encode(sha256(convert_to(salapiya_p2.p4_json_text(cells),'UTF8')),'hex'));
   v:=v||jsonb_build_object('row'||i,salapiya_p2.p4_json_text(row));
  END LOOP;
  SELECT * INTO opening FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.kind='opening' AND x.action_id=account.id;
  v:=v||jsonb_build_object('rowCount',count::text,'sourceStamp',salapiya_p2.p4_import_stamp(p,account.id),'cutoff',account.cutoff,'openingMinor',opening.amount_minor::text,'openingSource',opening.id::text);
 ELSE
  IF op<>'cashImportDecision' THEN decision:=salapiya_p2.p4_source(p,v->>'decision',ARRAY['cashImportDecision']);END IF;
  preview:=salapiya_p2.p4_source(p,coalesce(decision.values_json->>'preview',v->>'preview'),ARRAY['cashImportPreview']);head:=salapiya_p2.p4_import_head(p,preview.values_json->>'batch');a:=(head.values_json->>'assumptions')::jsonb;count:=(preview.values_json->>'rowCount')::int;
  SELECT * INTO account FROM salapiya_p2.account x WHERE x.profile_id=p AND x.id::text=a->>'account';source:=coalesce(decision.id,preview.id);
  IF op='cashImportDecision' THEN
   IF salapiya_p2.p4_import_stamp(p,account.id) IS DISTINCT FROM preview.values_json->>'sourceStamp' OR v->>'rowCount' IS DISTINCT FROM preview.values_json->>'rowCount' OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'=op AND x.values_json->>'preview'=preview.id::text) THEN RAISE EXCEPTION 'review complete current immutable preview' USING ERRCODE='22023';END IF;
   FOR i IN 0..count-1 LOOP
    row:=(preview.values_json->>('row'||i))::jsonb;choice:=(v->>('row'||i))::jsonb;
    IF choice-ARRAY['include','acknowledgeDuplicates','category']<>'{}' OR jsonb_typeof(choice->'include') IS DISTINCT FROM 'boolean' OR jsonb_typeof(choice->'acknowledgeDuplicates') IS DISTINCT FROM 'boolean' OR jsonb_typeof(choice->'category') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'explicit row decisions required' USING ERRCODE='22023';END IF;
    IF choice->'include'='true' THEN
     IF jsonb_array_length(row->'errors')>0 OR (jsonb_array_length(row->'warnings')>0 AND choice->'acknowledgeDuplicates'<>'true') OR NOT EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND c.id=choice->>'category' AND c.kind=CASE WHEN row->>'kind'='income' THEN 'income' ELSE 'expense' END) THEN RAISE EXCEPTION 'invalid row or unacknowledged duplicate' USING ERRCODE='22023';END IF;
    END IF;
   END LOOP;
   IF coalesce(v->>'acknowledge','') NOT IN ('true','false') THEN RAISE EXCEPTION 'disclose negative balance consent' USING ERRCODE='22023';END IF;
  ELSIF op='cashImportCancel' THEN
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'=op AND x.values_json->>'decision'=decision.id::text) THEN RAISE EXCEPTION 'already cancelled' USING ERRCODE='22023';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'='cashImportCancel' AND x.values_json->>'decision'=decision.id::text) THEN RAISE EXCEPTION 'cancelled import retains prior committed rows' USING ERRCODE='22023';END IF;
   FOR i IN 0..count-1 LOOP IF (decision.values_json->>('row'||i))::jsonb->'include'='true' THEN selected:=selected||to_jsonb(i);END IF;END LOOP;
   IF op='cashOpeningRebase' THEN
    process:=salapiya_p2.p4_source(p,v->>'importProcess',ARRAY['cashImportProcess']);
    IF process.values_json->>'decision'<>decision.id::text OR a->>'cutoffStrategy'<>'rebase_history' OR cid::text<>salapiya_p2.p4_import_id(p,head.id,'rebase') THEN RAISE EXCEPTION 'authorized atomic import transition required' USING ERRCODE='22023';END IF;
    SELECT * INTO old FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.kind='opening' AND x.action_id=account.id;
    IF old.id::text IS DISTINCT FROM preview.values_json->>'openingSource' OR account.cutoff IS DISTINCT FROM preview.values_json->>'cutoff' THEN RAISE EXCEPTION 'opening evidence changed' USING ERRCODE='22023';END IF;
    total:=(a->>'earlierMinor')::numeric;net:=0;
    FOR entry IN SELECT value::text::int AS n FROM jsonb_array_elements(selected) LOOP row:=(preview.values_json->>('row'||entry.n))::jsonb;IF row->>'date'<=account.cutoff THEN net:=net+(CASE WHEN row->>'kind'='income' THEN 1 ELSE -1 END)*(row->>'amountMinor')::numeric;END IF;END LOOP;
    IF total+net<>old.amount_minor THEN RAISE EXCEPTION 'historical opening coverage equation mismatch' USING ERRCODE='22023';END IF;
    cutoff_update:=jsonb_build_object('account',account.id::text,'from',account.cutoff,'to',a->>'earlierDate');source:=process.id;kind:='opening';
    IF total<>0 THEN posts:=jsonb_build_array(salapiya_p2.post('cash',total,a->>'earlierDate',account.id::text),salapiya_p2.post('equity',-total,a->>'earlierDate'));END IF;
   ELSIF op='cashImportProcess' THEN
    numbers:=(v->>'rowNumbers')::jsonb;expected:=salapiya_p2.p4_import_next(p,decision);IF numbers IS DISTINCT FROM expected THEN RAISE EXCEPTION 'review next original import chunk' USING ERRCODE='22023';END IF;
    started:=EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'financeType'=op AND x.values_json->>'decision'=decision.id::text);
    IF NOT started AND salapiya_p2.p4_import_stamp(p,account.id) IS DISTINCT FROM preview.values_json->>'sourceStamp' THEN RAISE EXCEPTION 'initial import preview stale' USING ERRCODE='22023';END IF;
    rebasing:=a->>'cutoffStrategy'='rebase_history' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.revision x WHERE x.profile_id=p AND x.id::text=salapiya_p2.p4_import_id(p,head.id,'rebase'));
    IF rebasing THEN
     net:=0;FOR entry IN SELECT value::text::int AS n FROM jsonb_array_elements(selected) LOOP row:=(preview.values_json->>('row'||entry.n))::jsonb;IF row->>'date'<=account.cutoff THEN net:=net+(CASE WHEN row->>'kind'='income' THEN 1 ELSE -1 END)*(row->>'amountMinor')::numeric;END IF;END LOOP;
     IF (a->>'earlierMinor')::numeric+net<>(preview.values_json->>'openingMinor')::numeric THEN RAISE EXCEPTION 'historical opening coverage equation mismatch' USING ERRCODE='22023';END IF;
    ELSIF jsonb_array_length(numbers)=0 THEN RAISE EXCEPTION 'selected rows already committed' USING ERRCODE='22023';END IF;
    FOR day IN SELECT DISTINCT q.effective_date AS label FROM salapiya_p2.posting q JOIN salapiya_p2.current_revision x ON x.id=q.revision_id WHERE x.profile_id=p AND q.account_id=account.id
     UNION SELECT (preview.values_json->>('row'||(e.value::text::int)))::jsonb->>'date' FROM jsonb_array_elements(numbers) e LOOP
     balance:=salapiya_p2.balance(p,account.id,day.label);
     IF rebasing THEN IF preview.values_json->>'cutoff'<=day.label THEN balance:=balance-(preview.values_json->>'openingMinor')::numeric;END IF;IF a->>'earlierDate'<=day.label THEN balance:=balance+(a->>'earlierMinor')::numeric;END IF;END IF;
     FOR entry IN SELECT value::text::int AS n FROM jsonb_array_elements(numbers) LOOP row:=(preview.values_json->>('row'||entry.n))::jsonb;IF row->>'date'<=day.label THEN balance:=balance+(CASE WHEN row->>'kind'='income' THEN 1 ELSE -1 END)*(row->>'amountMinor')::numeric;END IF;END LOOP;
     IF balance<0 AND decision.values_json->>'acknowledge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'import would produce negative cash' USING ERRCODE='22023';END IF;
    END LOOP;
   ELSE RAISE EXCEPTION 'unsupported cash import command' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
 SELECT coalesce(jsonb_agg(e),'[]') INTO posts FROM jsonb_array_elements(posts) e WHERE (e->>'amount')::numeric<>0;
 r:=jsonb_build_object('id',cid::text,'actionId',coalesce(old.action_id,cid)::text,'kind',kind,'change',CASE WHEN old.id IS NULL THEN 'create' ELSE 'replace' END,
 'date',coalesce(cutoff_update->>'to',d),'title',v->>'name','amount',total::text,'number',coalesce(old.revision_no,0)+1,'previous',old.id::text,'source',source::text,'values',v,'postings',posts);
 plan:=jsonb_build_object('account',NULL,'category',NULL,'archiveId',NULL,'revision',r);IF cutoff_update IS NOT NULL THEN plan:=plan||jsonb_build_object('cutoffUpdate',cutoff_update);END IF;RETURN plan;
END $$;

CREATE FUNCTION salapiya_p2.p4_import_children(p uuid,root uuid) RETURNS TABLE(id uuid,kind text,values_json jsonb) LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE process salapiya_p2.revision;decision salapiya_p2.revision;preview salapiya_p2.revision;head salapiya_p2.revision;a jsonb;row jsonb;choice jsonb;entry record;BEGIN
 process:=salapiya_p2.p4_source(p,root::text,ARRAY['cashImportProcess']);decision:=salapiya_p2.p4_source(p,process.values_json->>'decision',ARRAY['cashImportDecision']);preview:=salapiya_p2.p4_source(p,decision.values_json->>'preview',ARRAY['cashImportPreview']);head:=salapiya_p2.p4_import_head(p,preview.values_json->>'batch');a:=(head.values_json->>'assumptions')::jsonb;
 IF a->>'cutoffStrategy'='rebase_history' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.revision r WHERE r.profile_id=p AND r.id::text=salapiya_p2.p4_import_id(p,head.id,'rebase')) THEN
  id:=salapiya_p2.p4_import_id(p,head.id,'rebase')::uuid;kind:='cashOpeningRebase';values_json:=jsonb_build_object('name','Confirmed historical opening rebase','date',process.values_json->>'date','decision',decision.id::text,'importProcess',root::text,'account',a->>'account');RETURN NEXT;
 END IF;
 FOR entry IN SELECT value::text::int AS n FROM jsonb_array_elements((process.values_json->>'rowNumbers')::jsonb) LOOP
  row:=(preview.values_json->>('row'||entry.n))::jsonb;choice:=(decision.values_json->>('row'||entry.n))::jsonb;
  id:=salapiya_p2.p4_import_id(p,head.id,(entry.n+1)::text)::uuid;kind:=row->>'kind';
  values_json:=jsonb_build_object('name',row->>'name','date',row->>'date','amount',to_char((row->>'amountMinor')::numeric/100,'FM999999999999999999999999990.00'),'account',a->>'account','category',choice->>'category','reference',row->>'reference','acknowledge','true','importProcess',root::text,'importBatch',head.id::text,'importRow',(entry.n+1)::text,'importFingerprint',row->>'fingerprint','importFile',head.values_json->>'checksum');
  IF kind='income' THEN values_json:=values_json||jsonb_build_object('incomeClass',row->>'classification');END IF;RETURN NEXT;
 END LOOP;
END $$;
CREATE FUNCTION salapiya_p2.p4_validate_import_child(p uuid,cid uuid,cmd jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE expected record;BEGIN
 SELECT * INTO expected FROM salapiya_p2.p4_import_children(p,(cmd->'values'->>'importProcess')::uuid) e WHERE e.id=cid AND e.kind=cmd->>'kind';
 IF NOT FOUND OR expected.values_json IS DISTINCT FROM cmd->'values' THEN RAISE EXCEPTION 'import provenance differs from reviewed original row' USING ERRCODE='22023';END IF;
END $$;
DO $$DECLARE definition text;needle text:='a:=planned->''account''; c:=planned->''category''; r:=planned->''revision'';';BEGIN
 definition:=pg_get_functiondef('salapiya_p2.submit(uuid,uuid,jsonb,text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected original journal application boundary';END IF;
 EXECUTE replace(definition,needle,'IF planned ? ''cutoffUpdate'' THEN UPDATE salapiya_p2.account SET cutoff=planned->''cutoffUpdate''->>''to'' WHERE profile_id=p AND id=(planned->''cutoffUpdate''->>''account'')::uuid;END IF;'||needle);
END $$;
CREATE FUNCTION salapiya_p2.p4_process_import(actor uuid,cid uuid,envelope jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prior salapiya_p2.receipt;result jsonb;p uuid:=(envelope->>'profile_id')::uuid;child record;revision bigint;cmd jsonb;child_envelope jsonb;message text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));SELECT * INTO prior FROM salapiya_p2.receipt r WHERE r.owner_id=actor AND r.id=cid;
 IF FOUND THEN IF prior.envelope<>envelope THEN RAISE EXCEPTION 'command payload mismatch' USING ERRCODE='22023';END IF;RETURN prior.result;END IF;
 BEGIN
  result:=salapiya_p2.submit(actor,cid,envelope);IF result->>'outcome'<>'accepted' THEN RETURN result;END IF;
  FOR child IN SELECT * FROM salapiya_p2.p4_import_children(p,cid) LOOP
   SELECT x.revision INTO revision FROM public.p2_profile x WHERE x.id=p AND x.owner_id=actor;
   cmd:=jsonb_build_object('contract',1,'authority','local','owner',p::text,'expectedVersion',revision,'kind',child.kind,'values',child.values_json);
   child_envelope:=jsonb_build_object('contract',2,'profile_id',p::text,'payload',salapiya_p2.canonical_payload(cmd),'base_revision',revision);
   IF salapiya_p2.submit(actor,child.id,child_envelope)->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'atomic import child rejected' USING ERRCODE='22023';END IF;
  END LOOP;
  RETURN result;
 EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range OR unique_violation OR foreign_key_violation OR check_violation THEN
  result:=jsonb_build_object('id',cid::text,'owner_id',actor::text,'profile_id',p::text,'outcome','rejected','reason','Atomic import failed; prior committed chunks are retained. Review the original batch.');
 END;
 INSERT INTO salapiya_p2.receipt VALUES(actor,cid,envelope,result);RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.p2_submit_command(command_id uuid,command_payload text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();envelope jsonb;BEGIN
 IF command_payload IS NULL OR octet_length(command_payload)>1048576 THEN RAISE EXCEPTION 'invalid command size' USING ERRCODE='22023';END IF;envelope:=command_payload::jsonb;
 IF envelope->>'payload' IS DISTINCT FROM salapiya_p2.canonical_payload((envelope->>'payload')::jsonb) THEN RAISE EXCEPTION 'noncanonical financial payload' USING ERRCODE='22023';END IF;
 IF (envelope->>'payload')::jsonb->>'kind'='cashImportProcess' THEN RETURN salapiya_p2.p4_process_import(actor,command_id,envelope);END IF;
 RETURN salapiya_p2.submit(actor,command_id,envelope);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.p4_json_text(jsonb),salapiya_p2.p4_import_id(uuid,uuid,text),salapiya_p2.p4_import_stamp(uuid,uuid),salapiya_p2.p4_import_head(uuid,text),salapiya_p2.p4_normalize_cash(jsonb,jsonb,jsonb,text,text),salapiya_p2.p4_import_next(uuid,salapiya_p2.revision),salapiya_p2.plan_p4_reviewed(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint),salapiya_p2.p4_import_children(uuid,uuid),salapiya_p2.p4_validate_import_child(uuid,uuid,jsonb),salapiya_p2.p4_process_import(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
