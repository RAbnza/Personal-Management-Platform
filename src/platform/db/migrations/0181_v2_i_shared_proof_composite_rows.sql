DO $$ DECLARE d text;n text;anchor text:=$q$AND id=($2->>''id'')::uuid AND to_jsonb(t)=$2$q$; BEGIN
 FOREACH n IN ARRAY ARRAY['ops.bind_shared_bundle_export(uuid)','ops.bind_shared_recovery(uuid,jsonb)'] LOOP
  d:=pg_get_functiondef(n::regprocedure);
  IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared composite row comparison anchor missing'; END IF;
  EXECUTE replace(d,anchor,'AND to_jsonb(t)=$2');
 END LOOP;
END $$;
