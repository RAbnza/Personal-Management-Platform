DO $$ DECLARE d text;anchor text;BEGIN
 d:=pg_get_functiondef('ops.bind_shared_bundle_export(uuid)'::regprocedure);
 anchor:=$q$EXECUTE format('SELECT count(*) FROM %s t WHERE workspace_id=$1 AND to_jsonb(t)=$2',name) INTO n USING scope,typed;$q$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared provenance row lookup anchor missing'; END IF;
 EXECUTE replace(d,anchor,$q$key:=CASE WHEN typed ? 'id' THEN 'id' ELSE 'action_revision_id' END;
   EXECUTE format('SELECT count(*) FROM %s t WHERE workspace_id=$1 AND %I=($2->>%L)::uuid AND to_jsonb(t)=$2',name,key,key) INTO n USING scope,typed;$q$);
 d:=pg_get_functiondef('ops.bind_shared_recovery(uuid,jsonb)'::regprocedure);
 d:=replace(d,'recovery jsonb; name text;','recovery jsonb; known_rows jsonb; name text;');
 anchor:='  predicate:=CASE WHEN name IN';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared recovery table normalization anchor missing'; END IF;
 d:=replace(d,anchor,$q$  EXECUTE format('SELECT coalesce(jsonb_object_agg(coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''action_revision_id''),to_jsonb(t)),''{}''::jsonb) FROM jsonb_populate_recordset(NULL::%s,$1) t',name) INTO known_rows USING recovery->'entities'->name;
$q$||anchor);
 anchor:=$q$EXECUTE format('SELECT count(*) FROM %s t WHERE workspace_id=$1 AND to_jsonb(t)=$2',name) INTO n USING scope,typed,recovery->'entities'->name;$q$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared recovery row comparison anchor missing'; END IF;
 d:=replace(d,anchor,$q$key:=coalesce(typed->>'id',typed->>'action_revision_id'); n:=CASE WHEN known_rows->key=typed THEN 1 ELSE 0 END;$q$);
 EXECUTE d;
END $$;
