ALTER TABLE ops.shared_bundle_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.shared_bundle_proof FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ops.shared_bundle_proof FROM PUBLIC,app_domain,auth_adapter,worker_domain,queue_broker,lifecycle_operator;
GRANT SELECT ON ops.shared_bundle_proof TO app_domain;
GRANT SELECT,DELETE ON ops.shared_bundle_proof TO lifecycle_operator;
CREATE POLICY owner_read ON ops.shared_bundle_proof FOR SELECT TO app_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active'));
CREATE POLICY proof_owner ON ops.shared_bundle_proof TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid)) WITH CHECK(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY lifecycle_purge_scope ON ops.shared_bundle_proof TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id));
CREATE TRIGGER immutable_proof BEFORE UPDATE OR DELETE ON ops.shared_bundle_proof FOR EACH ROW EXECUTE FUNCTION finance.enforce_debt_append_only_evidence();
CREATE POLICY shared_proof_export ON ops.export_run FOR SELECT TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid));
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['group_ledger_binding','private_group_link','private_group_link_revision'] LOOP
 EXECUTE format('CREATE POLICY shared_restore_bridge ON finance.%I TO migration_owner USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid)) WITH CHECK(ops.restore_scope_allowed(workspace_id))',n);
END LOOP; END $$;

/* A permanent checksum proves the owner's complete exported group-related
 * private graph. Uploads cannot create proofs. Actual shared tables are never
 * restored. Every bound action/journal/posting/audit must match live evidence. */
CREATE FUNCTION ops.bind_shared_bundle_export(export_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope uuid:=NULLIF(current_setting('app.workspace_id',true),'')::uuid; owner_id uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid; b jsonb; name text; row jsonb; typed jsonb; n bigint; expected bigint; ids uuid[]; predicate text; key text; receipt_ids uuid[];
BEGIN
 SELECT e.bundle_json INTO b FROM ops.export_run e JOIN core.command_receipt c ON c.workspace_id=e.workspace_id AND c.id=e.command_receipt_id JOIN core.workspace w ON w.id=e.workspace_id JOIN core.user_profile u ON u.user_id=w.owner_user_id WHERE e.workspace_id=scope AND e.id=export_id AND e.state='completed' AND c.state='completed' AND c.command_type='portability.export' AND c.xmin::text=pg_current_xact_id()::text AND w.owner_user_id=owner_id AND w.state='active' AND u.lifecycle='active' AND c.result_json->>'checksumSha256'=e.checksum_sha256 AND e.checksum_sha256=e.bundle_json->>'checksumSha256';
 IF b IS NULL OR b->'manifest'->>'sourceWorkspaceId'<>scope::text OR encode(sha256(convert_to(ops.canonical_json(b-'checksumSha256'),'UTF8')),'hex')<>b->>'checksumSha256' THEN RAISE EXCEPTION 'fresh owned export required for shared proof' USING ERRCODE='23514'; END IF;
 SELECT array_agg(action_id) INTO ids FROM finance.private_group_link WHERE workspace_id=scope;
 SELECT array_agg(DISTINCT command_receipt_id) INTO receipt_ids FROM finance.action_revision WHERE workspace_id=scope AND action_id=ANY(ids);
 FOREACH name IN ARRAY ARRAY['finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision','finance.financial_action','finance.action_revision','finance.journal','finance.posting','finance.purchase_detail','finance.card_activity','audit.private_revision','core.command_receipt'] LOOP
  predicate:=CASE WHEN name IN('finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision') THEN 'true' WHEN name='finance.financial_action' THEN 'id=ANY($2)' WHEN name='audit.private_revision' THEN 'subject_kind=''financial_action'' AND subject_id=ANY($2)' WHEN name='core.command_receipt' THEN 'id=ANY($3)' ELSE 'action_id=ANY($2)' END;
  EXECUTE format('SELECT count(*) FROM %s WHERE workspace_id=$1 AND (%s)',name,predicate) INTO expected USING scope,ids,receipt_ids;
  n:=0;
  FOR row IN SELECT r FROM jsonb_array_elements(b->'entities') e CROSS JOIN LATERAL jsonb_array_elements(e->'records') r WHERE e->>'kind'=name LOOP
   row:=ops.remap_owner_json(row,owner_id,scope);
   IF name='core.command_receipt' THEN row:=jsonb_set(row,'{payload_hash}',to_jsonb('\x'||(row->>'payload_hash'))); END IF;
   EXECUTE format('SELECT to_jsonb(p) FROM jsonb_populate_record(NULL::%s,$1) p',name) INTO typed USING row;
   IF name='core.command_receipt' THEN
    IF NOT ((typed->>'id')::uuid=ANY(coalesce(receipt_ids,ARRAY[]::uuid[]))) THEN CONTINUE; END IF;
   ELSIF name='audit.private_revision' THEN
    IF typed->>'subject_kind'<>'financial_action' OR NOT ((typed->>'subject_id')::uuid=ANY(coalesce(ids,ARRAY[]::uuid[]))) THEN CONTINUE; END IF;
   ELSIF name NOT IN('finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision') THEN
    key:=CASE WHEN name='finance.financial_action' THEN 'id' ELSE 'action_id' END;
    IF NOT ((typed->>key)::uuid=ANY(coalesce(ids,ARRAY[]::uuid[]))) THEN CONTINUE; END IF;
   END IF;
   EXECUTE format('SELECT count(*) FROM %s t WHERE workspace_id=$1 AND id=($2->>''id'')::uuid AND to_jsonb(t)=$2',name) INTO n USING scope,typed;
   IF n<>1 THEN RAISE EXCEPTION 'shared export must preserve exact existing private evidence' USING ERRCODE='23514'; END IF;
  END LOOP;
  /* Count the included records independently, so omitted history cannot acquire
   * trusted provenance even when every included row is individually valid. */
  SELECT count(*) INTO n FROM jsonb_array_elements(b->'entities') e CROSS JOIN LATERAL jsonb_array_elements(e->'records') r WHERE e->>'kind'=name AND (CASE WHEN name IN('finance.group_ledger_binding','finance.private_group_link','finance.private_group_link_revision') THEN true WHEN name='core.command_receipt' THEN (r->>'id')::uuid=ANY(receipt_ids) WHEN name='audit.private_revision' THEN r->>'subject_kind'='financial_action' AND (r->>'subject_id')::uuid=ANY(ids) ELSE (r->>CASE WHEN name='finance.financial_action' THEN 'id' ELSE 'action_id' END)::uuid=ANY(ids) END);
  IF n<>expected THEN RAISE EXCEPTION 'complete shared private history required for export proof' USING ERRCODE='23514'; END IF;
 END LOOP;
 INSERT INTO ops.shared_bundle_proof(workspace_id,checksum_sha256) VALUES(scope,b->>'checksumSha256') ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION ops.bind_shared_bundle_export(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.bind_shared_bundle_export(uuid) TO app_domain;

CREATE FUNCTION ops.shared_bundle_trusted(b jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT b->'manifest'->>'sourceWorkspaceId'=current_setting('app.workspace_id',true) AND EXISTS(SELECT 1 FROM ops.shared_bundle_proof p WHERE p.workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND p.checksum_sha256=b->>'checksumSha256')
$$;
REVOKE ALL ON FUNCTION ops.shared_bundle_trusted(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.shared_bundle_trusted(jsonb) TO app_domain;

CREATE FUNCTION ops.lock_shared_restore_groups(run_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM g.id FROM sharing.expense_group g WHERE g.id IN (SELECT b.group_id FROM finance.group_ledger_binding b WHERE b.workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid UNION SELECT (r->>'group_id')::uuid FROM ops.restore_run x CROSS JOIN LATERAL jsonb_array_elements(x.bundle_json->'entities') e CROSS JOIN LATERAL jsonb_array_elements(e->'records') r WHERE x.workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND x.id=run_id AND e->>'kind'='finance.group_ledger_binding') AND EXISTS(SELECT 1 FROM core.workspace w WHERE w.id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid) ORDER BY g.id FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION ops.lock_shared_restore_groups(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.lock_shared_restore_groups(uuid) TO app_domain;

DO $$ DECLARE d text; anchor text; n text; BEGIN
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 anchor:='allowed text[]:=ARRAY[';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'private graph allowlist anchor missing'; END IF;
 d:=replace(d,anchor,anchor||'''finance.group_ledger_binding'',''finance.private_group_link'',''finance.private_group_link_revision'',');
 d:=regexp_replace(d,'\mBEGIN\M','BEGIN PERFORM ops.lock_shared_restore_groups(run_id);');
 anchor:='before_revision:=w.financial_revision;';
 d:=replace(d,anchor,'IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.bundle_json->''entities'') e WHERE e->>''kind''=''finance.group_ledger_binding'' AND jsonb_array_length(e->''records'')>0) AND NOT ops.shared_bundle_trusted(r.bundle_json) THEN RAISE EXCEPTION ''shared private restoration requires an unmodified trusted own-workspace export'' USING ERRCODE=''23514''; END IF; '||anchor);
 EXECUTE d;
 FOREACH n IN ARRAY ARRAY['finance.guard_group_binding()','finance.guard_private_group_link()','finance.validate_private_bill_revision()','finance.validate_private_group_revision()'] LOOP
  d:=pg_get_functiondef(n::regprocedure);
  d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF ops.restore_scope_allowed(NEW.workspace_id) THEN RETURN NEW; END IF;');
  EXECUTE d;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['finance.validate_group_adoption_recipe()','finance.validate_group_effect_recipe()'] LOOP
  d:=pg_get_functiondef(n::regprocedure);
  d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF ops.restore_scope_allowed(NEW.workspace_id) THEN RETURN NULL; END IF;');
  EXECUTE d;
 END LOOP;
END $$;
