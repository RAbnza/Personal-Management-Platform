/* Retained-source decisions require their own immutable approval audit and
 * permanent receipt in trusted private exports and recovery snapshots. */
DO $$ DECLARE d text; name text; old text; replacement text; BEGIN
 FOREACH name IN ARRAY ARRAY['ops.bind_shared_bundle_export(uuid)','ops.bind_shared_recovery(uuid,jsonb)'] LOOP
  d:=pg_get_functiondef(name::regprocedure);
  d:=replace(d,'receipt_ids uuid[];','receipt_ids uuid[]; review_ids uuid[];');
  IF name='ops.bind_shared_bundle_export(uuid)' THEN
   old:='SELECT array_agg(DISTINCT command_receipt_id) INTO receipt_ids FROM finance.action_revision WHERE workspace_id=scope AND action_id=ANY(ids);';
   replacement:=$q$SELECT array_agg(id) INTO review_ids FROM finance.private_group_review WHERE workspace_id=scope;
 SELECT array_agg(DISTINCT command_receipt_id) INTO receipt_ids FROM (SELECT command_receipt_id FROM finance.action_revision WHERE workspace_id=scope AND action_id=ANY(ids) UNION SELECT command_receipt_id FROM finance.private_group_review WHERE workspace_id=scope) approvals;$q$;
  ELSE
   old:=$q$SELECT array_agg(DISTINCT (v->>'command_receipt_id')::uuid) INTO receipt_ids FROM jsonb_array_elements(recovery->'entities'->'finance.action_revision') v WHERE (v->>'action_id')::uuid=ANY(ids);$q$;
   replacement:=$q$SELECT array_agg((v->>'id')::uuid) INTO review_ids FROM jsonb_array_elements(recovery->'entities'->'finance.private_group_review') v;
 SELECT array_agg(DISTINCT receipt_id) INTO receipt_ids FROM (SELECT (v->>'command_receipt_id')::uuid receipt_id FROM jsonb_array_elements(recovery->'entities'->'finance.action_revision') v WHERE (v->>'action_id')::uuid=ANY(ids) UNION SELECT (v->>'command_receipt_id')::uuid FROM jsonb_array_elements(recovery->'entities'->'finance.private_group_review') v) approvals;$q$;
   d:=replace(d,'jsonb_populate_recordset(NULL::%s,$4) t WHERE workspace_id=$1','jsonb_populate_recordset(NULL::%s,$5) t WHERE workspace_id=$1');
   d:=replace(d,'USING scope,ids,receipt_ids,recovery','USING scope,ids,receipt_ids,review_ids,recovery');
  END IF;
  IF strpos(d,old)=0 THEN RAISE EXCEPTION 'private approval provenance anchor missing'; END IF;
  d:=replace(d,old,replacement);
  d:=replace(d,$q$'subject_kind=''financial_action'' AND subject_id=ANY($2)'$q$,$q$'(subject_kind=''financial_action'' AND subject_id=ANY($2)) OR (subject_kind=''private_group_review'' AND subject_id=ANY($4))'$q$);
  d:=replace(d,'USING scope,ids,receipt_ids;','USING scope,ids,receipt_ids,review_ids;');
  old:=$q$IF typed->>'subject_kind'<>'financial_action' OR NOT ((typed->>'subject_id')::uuid=ANY(coalesce(ids,ARRAY[]::uuid[]))) THEN CONTINUE; END IF;$q$;
  IF strpos(d,old)=0 THEN RAISE EXCEPTION 'private approval audit filter anchor missing'; END IF;
  d:=replace(d,old,$q$IF NOT ((typed->>'subject_kind'='financial_action' AND (typed->>'subject_id')::uuid=ANY(coalesce(ids,ARRAY[]::uuid[]))) OR (typed->>'subject_kind'='private_group_review' AND (typed->>'subject_id')::uuid=ANY(coalesce(review_ids,ARRAY[]::uuid[])))) THEN CONTINUE; END IF;$q$);
  old:=$q$r->>'subject_kind'='financial_action' AND (r->>'subject_id')::uuid=ANY(ids)$q$;
  IF strpos(d,old)=0 THEN RAISE EXCEPTION 'private approval completeness anchor missing'; END IF;
  d:=replace(d,old,$q$(r->>'subject_kind'='financial_action' AND (r->>'subject_id')::uuid=ANY(ids)) OR (r->>'subject_kind'='private_group_review' AND (r->>'subject_id')::uuid=ANY(review_ids))$q$);
  EXECUTE d;
 END LOOP;
END $$;
