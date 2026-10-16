DO $$ DECLARE d text; first_pos integer; last_pos integer; BEGIN
 d:=pg_get_functiondef('ops.bind_shared_bundle_export(uuid)'::regprocedure);
 d:=replace(d,'AND id=($2->>''id'')::uuid AND to_jsonb(t)=$2','AND to_jsonb(t)=$2');
 EXECUTE d;
 d:=replace(d,'ops.bind_shared_bundle_export(export_id uuid)','ops.bind_shared_recovery(run_id uuid, snapshot jsonb)');
 d:=replace(d,'b jsonb; name text;','b jsonb; recovery jsonb; name text;');
 first_pos:=strpos(d,' SELECT e.bundle_json INTO b');
 last_pos:=strpos(d,' SELECT array_agg(action_id)');
 IF first_pos=0 OR last_pos=0 OR last_pos<=first_pos THEN RAISE EXCEPTION 'shared proof export preflight anchor missing'; END IF;
 d:=substr(d,1,first_pos-1)||$replace$
 SELECT r.recovery_json INTO recovery FROM ops.restore_run r JOIN core.workspace w ON w.id=r.workspace_id JOIN core.user_profile u ON u.user_id=w.owner_user_id WHERE r.workspace_id=scope AND r.id=run_id AND r.expires_at>clock_timestamp() AND w.owner_user_id=owner_id AND w.state='active' AND u.lifecycle='active';
 b:=snapshot;
 IF recovery IS NULL OR b->'manifest'->>'sourceWorkspaceId'<>scope::text OR b->'manifest'->>'financialRevision'<>recovery->'workspace'->>'financial_revision' OR encode(sha256(convert_to(ops.canonical_json(b-'checksumSha256'),'UTF8')),'hex')<>b->>'checksumSha256' THEN RAISE EXCEPTION 'owned exact recovery snapshot required' USING ERRCODE='23514'; END IF;
$replace$||substr(d,last_pos);
 d:=replace(d,'SELECT array_agg(action_id) INTO ids FROM finance.private_group_link WHERE workspace_id=scope;','SELECT array_agg((v->>''action_id'')::uuid) INTO ids FROM jsonb_array_elements(recovery->''entities''->''finance.private_group_link'') v;');
 d:=replace(d,'SELECT array_agg(DISTINCT command_receipt_id) INTO receipt_ids FROM finance.action_revision WHERE workspace_id=scope AND action_id=ANY(ids);','SELECT array_agg(DISTINCT (v->>''command_receipt_id'')::uuid) INTO receipt_ids FROM jsonb_array_elements(recovery->''entities''->''finance.action_revision'') v WHERE (v->>''action_id'')::uuid=ANY(ids);');
 d:=replace(d,'SELECT count(*) FROM %s WHERE workspace_id=$1 AND (%s)','SELECT count(*) FROM jsonb_populate_recordset(NULL::%s,$4) t WHERE workspace_id=$1 AND (%s)');
 d:=replace(d,'USING scope,ids,receipt_ids;','USING scope,ids,receipt_ids,recovery->''entities''->name;');
 d:=replace(d,'SELECT count(*) FROM %s t WHERE workspace_id=$1 AND to_jsonb(t)=$2','SELECT count(*) FROM jsonb_populate_recordset(NULL::%s,$3) t WHERE workspace_id=$1 AND to_jsonb(t)=$2');
 d:=replace(d,'USING scope,typed;','USING scope,typed,recovery->''entities''->name;');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION ops.bind_shared_recovery(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.bind_shared_recovery(uuid,jsonb) TO app_domain;
