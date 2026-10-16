CREATE FUNCTION ops.shared_restored_row(kind text,row_data jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;candidate jsonb;typed jsonb;scope uuid:=NULLIF(current_setting('app.workspace_id',true),'')::uuid;
BEGIN
 IF kind NOT IN('finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision','finance.action_revision') OR row_data->>'workspace_id' IS DISTINCT FROM scope::text THEN RETURN false; END IF;
 SELECT r.bundle_json INTO b FROM ops.restore_run r WHERE r.workspace_id=scope AND r.id=NULLIF(current_setting('ops.restore_run_id',true),'')::uuid AND r.state IN('applying','completed') AND r.apply_transaction=pg_current_xact_id()::text AND ops.shared_bundle_trusted(r.bundle_json);
 IF b IS NULL THEN RETURN false; END IF;
 FOR candidate IN SELECT v FROM jsonb_array_elements(b->'entities') e CROSS JOIN LATERAL jsonb_array_elements(e->'records') v WHERE e->>'kind'=kind AND v->>'id'=row_data->>'id' LOOP
  EXECUTE format('SELECT to_jsonb(p) FROM jsonb_populate_record(NULL::%s,$1) p',kind) INTO typed USING ops.remap_owner_json(candidate,NULLIF(current_setting('app.user_id',true),'')::uuid,scope);
  IF typed=row_data THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION ops.shared_restored_row(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.shared_restored_row(text,jsonb) TO app_domain;
DO $$ DECLARE d text;n text;kind text;anchor text:='IF ops.restore_scope_allowed(NEW.workspace_id)'; BEGIN
 FOREACH n IN ARRAY ARRAY['finance.guard_group_binding()','finance.guard_private_group_link()','finance.validate_private_bill_revision()','finance.validate_private_group_revision()','finance.validate_group_adoption_recipe()','finance.validate_group_effect_recipe()'] LOOP
  kind:=CASE WHEN n LIKE '%guard_group_binding%' THEN 'finance.group_ledger_binding' WHEN n LIKE '%guard_private_group_link%' THEN 'finance.private_group_link' WHEN n LIKE '%_recipe%' THEN 'finance.action_revision' ELSE 'finance.private_group_link_revision' END;
  d:=pg_get_functiondef(n::regprocedure);
  IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared restored row guard anchor missing'; END IF;
  EXECUTE replace(d,anchor,format('IF ops.shared_restored_row(%L,to_jsonb(NEW))',kind));
 END LOOP;
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 anchor:=$q$e->>'kind'='finance.group_ledger_binding' AND jsonb_array_length(e->'records')>0$q$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared restoration evidence preflight anchor missing'; END IF;
 EXECUTE replace(d,anchor,$q$(e->>'kind' IN('finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision') AND jsonb_array_length(e->'records')>0 OR e->>'kind'='finance.action_revision' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e->'records') x WHERE x->>'action_kind' IN('group_adoption','group_effect')))$q$);
END $$;
