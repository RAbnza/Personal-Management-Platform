REVOKE UPDATE ON ops.restore_run,ops.restore_id_map FROM app_domain;
CREATE POLICY h_restore_owner ON ops.restore_run TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND p.lifecycle='active')) WITH CHECK(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
CREATE FUNCTION ops.restore_scope_allowed(scope_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$ BEGIN
 IF current_user<>'migration_owner' OR scope_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id',true),'')::uuid THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM ops.restore_run r WHERE r.workspace_id=scope_id AND r.id=NULLIF(current_setting('ops.restore_run_id',true),'')::uuid AND r.state IN ('applying','completed') AND r.apply_transaction=pg_current_xact_id()::text);
END $$;REVOKE ALL ON FUNCTION ops.restore_scope_allowed(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.restore_scope_allowed(uuid) TO app_domain,worker_domain,lifecycle_operator;
CREATE FUNCTION ops.canonical_json(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$ DECLARE result text;BEGIN CASE jsonb_typeof(v)
WHEN 'object' THEN SELECT '{'||COALESCE(string_agg(to_jsonb(key)::text||':'||ops.canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);WHEN 'array' THEN SELECT '['||COALESCE(string_agg(ops.canonical_json(value),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e(value,ordinal);ELSE result:=v::text;END CASE;RETURN result;END $$;
REVOKE ALL ON FUNCTION ops.canonical_json(jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.canonical_json(jsonb) TO app_domain;
CREATE FUNCTION ops.remap_owner_json(v jsonb,owner_id uuid,scope_id uuid) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$ DECLARE result jsonb;BEGIN
IF jsonb_typeof(v)='object' THEN SELECT COALESCE(jsonb_object_agg(key,CASE WHEN key ~ '(^|_)user_id$|^userId$|^recordedByUserId$' AND value='"$owner"'::jsonb THEN to_jsonb(owner_id::text) WHEN key ~ 'workspace_id|^workspaceId$' AND value='"$workspace"'::jsonb THEN to_jsonb(scope_id::text) ELSE ops.remap_owner_json(value,owner_id,scope_id) END),'{}'::jsonb) INTO result FROM jsonb_each(v);RETURN result;
ELSIF jsonb_typeof(v)='array' THEN SELECT COALESCE(jsonb_agg(ops.remap_owner_json(value,owner_id,scope_id) ORDER BY n),'[]'::jsonb) INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e(value,n);RETURN result;ELSE RETURN v;END IF;END $$;REVOKE ALL ON FUNCTION ops.remap_owner_json(jsonb,uuid,uuid) FROM PUBLIC;
CREATE POLICY h_restore_bridge ON audit.private_activity TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON audit.private_revision TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON career.application_event TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON career.application_stage_history TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON career.application_tag TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON career.job_application TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON career.resume_version TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.category TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.command_receipt TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.module_preference TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.onboarding_step TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.tag TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.workspace_preference TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.action_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.application_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.application_event_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.card_statement_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.debt_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.private_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.reconciliation_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.resume_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON files.settlement_attachment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.action_revision TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.action_tag TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.adjustment_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_action_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_activity TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_installment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_installment_application TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_installment_plan TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_installment_revision TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_refund_part TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_statement TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_statement_allocation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_statement_entry TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.card_statement_revision TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.credit_card TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_action_link TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_obligation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_payment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_payment_revision TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_schedule_version TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.debt_settlement TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.fee_component TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.financial_account TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.financial_action TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.journal TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.ledger_account TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.payment_component TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.payment_due_allocation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.payment_reclassification TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.posting TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.purchase_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.receipt_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.reconciliation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.refund_allocation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.refund_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.schedule_allocation_map TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.scheduled_installment TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.settlement_component TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON finance.transfer_detail TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON ops.import_batch TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON ops.import_row TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.budget TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.expected_occurrence TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.goal_reservation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.occurrence_actual_link TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.recurrence_version TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.recurring_obligation TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON planning.savings_goal TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.notification_attempt TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.notification_delivery TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.notification_preference TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.notification_provider_event TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.personal_event TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.reminder_occurrence TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.reminder_rule TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON time.source_reminder_setting TO migration_owner USING(ops.restore_scope_allowed(workspace_id)) WITH CHECK(ops.restore_scope_allowed(workspace_id));
CREATE POLICY h_restore_bridge ON core.workspace TO migration_owner USING(ops.restore_scope_allowed(id)) WITH CHECK(ops.restore_scope_allowed(id));
CREATE POLICY h_restore_map ON ops.restore_id_map TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid) WITH CHECK(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
--> statement-breakpoint
/* The bridge does not disable triggers or constraints. Historical loading may
 * bypass ordinary command/state transition guards only inside this confirmed,
 * owner/lifecycle-locked transaction. Constraint INSERT/UPDATE validators stay
 * active and validate the complete replacement before commit. */
DO $$ DECLARE r record;d text;branch text;scope_expr text;BEGIN
FOR r IN SELECT p.oid,bool_or(t.tgconstraint<>0) constrained FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND t.tgrelid=ANY(ARRAY['audit.private_activity'::regclass,'audit.private_revision'::regclass,'career.application_event'::regclass,'career.application_stage_history'::regclass,'career.application_tag'::regclass,'career.job_application'::regclass,'career.resume_version'::regclass,'core.category'::regclass,'core.command_receipt'::regclass,'core.module_preference'::regclass,'core.onboarding_step'::regclass,'core.tag'::regclass,'core.workspace_preference'::regclass,'files.action_attachment'::regclass,'files.application_attachment'::regclass,'files.application_event_attachment'::regclass,'files.card_statement_attachment'::regclass,'files.debt_attachment'::regclass,'files.private_attachment'::regclass,'files.reconciliation_attachment'::regclass,'files.resume_attachment'::regclass,'files.settlement_attachment'::regclass,'finance.action_revision'::regclass,'finance.action_tag'::regclass,'finance.adjustment_detail'::regclass,'finance.card_action_detail'::regclass,'finance.card_activity'::regclass,'finance.card_installment'::regclass,'finance.card_installment_application'::regclass,'finance.card_installment_plan'::regclass,'finance.card_installment_revision'::regclass,'finance.card_refund_part'::regclass,'finance.card_statement'::regclass,'finance.card_statement_allocation'::regclass,'finance.card_statement_entry'::regclass,'finance.card_statement_revision'::regclass,'finance.credit_card'::regclass,'finance.debt'::regclass,'finance.debt_action_link'::regclass,'finance.debt_obligation'::regclass,'finance.debt_payment'::regclass,'finance.debt_payment_revision'::regclass,'finance.debt_schedule_version'::regclass,'finance.debt_settlement'::regclass,'finance.fee_component'::regclass,'finance.financial_account'::regclass,'finance.financial_action'::regclass,'finance.journal'::regclass,'finance.ledger_account'::regclass,'finance.payment_component'::regclass,'finance.payment_due_allocation'::regclass,'finance.payment_reclassification'::regclass,'finance.posting'::regclass,'finance.purchase_detail'::regclass,'finance.receipt_detail'::regclass,'finance.reconciliation'::regclass,'finance.refund_allocation'::regclass,'finance.refund_detail'::regclass,'finance.schedule_allocation_map'::regclass,'finance.scheduled_installment'::regclass,'finance.settlement_component'::regclass,'finance.transfer_detail'::regclass,'ops.import_batch'::regclass,'ops.import_row'::regclass,'planning.budget'::regclass,'planning.expected_occurrence'::regclass,'planning.goal_reservation'::regclass,'planning.occurrence_actual_link'::regclass,'planning.recurrence_version'::regclass,'planning.recurring_obligation'::regclass,'planning.savings_goal'::regclass,'time.notification_attempt'::regclass,'time.notification_delivery'::regclass,'time.notification_preference'::regclass,'time.notification_provider_event'::regclass,'time.personal_event'::regclass,'time.reminder_occurrence'::regclass,'time.reminder_rule'::regclass,'time.source_reminder_setting'::regclass,'core.workspace'::regclass]) AND p.prorettype='trigger'::regtype GROUP BY p.oid LOOP
 d:=pg_get_functiondef(r.oid);
 IF strpos(d,'ops.restore_scope_allowed')>0 THEN CONTINUE;END IF;
 /* Nonconstraint validators still run; only transition/side-effect routines
  * are skipped. DELETE constraint events concern the retired graph. */
 IF NOT r.constrained AND (SELECT proname FROM pg_proc WHERE oid=r.oid) LIKE 'validate_%' THEN CONTINUE;END IF;
 scope_expr:='COALESCE((CASE WHEN TG_OP=''DELETE'' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>''workspace_id'',CASE WHEN TG_TABLE_SCHEMA=''core'' AND TG_TABLE_NAME=''workspace'' THEN (CASE WHEN TG_OP=''DELETE'' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>''id'' END)::uuid';
 branch:='BEGIN'||E'\n IF ops.restore_scope_allowed('||scope_expr||')'||CASE WHEN r.constrained THEN ' AND TG_OP=''DELETE''' ELSE '' END||' THEN IF TG_OP=''DELETE'' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;';
 IF d !~ '\mBEGIN\M' THEN RAISE EXCEPTION 'reviewed restore trigger anchor unavailable';END IF;
 EXECUTE regexp_replace(d,'\mBEGIN\M',branch);
END LOOP;END $$;
--> statement-breakpoint
CREATE FUNCTION ops.apply_private_restore(run_id uuid,approved_hash bytea,receipt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r ops.restore_run;w core.workspace;owner_id uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid;scope_id uuid:=NULLIF(current_setting('app.workspace_id',true),'')::uuid;allowed text[]:=ARRAY['audit.private_activity','audit.private_revision','career.application_event','career.application_stage_history','career.application_tag','career.job_application','career.resume_version','core.category','core.command_receipt','core.module_preference','core.onboarding_step','core.tag','core.workspace_preference','files.action_attachment','files.application_attachment','files.application_event_attachment','files.card_statement_attachment','files.debt_attachment','files.private_attachment','files.reconciliation_attachment','files.resume_attachment','files.settlement_attachment','finance.action_revision','finance.action_tag','finance.adjustment_detail','finance.card_action_detail','finance.card_activity','finance.card_installment','finance.card_installment_application','finance.card_installment_plan','finance.card_installment_revision','finance.card_refund_part','finance.card_statement','finance.card_statement_allocation','finance.card_statement_entry','finance.card_statement_revision','finance.credit_card','finance.debt','finance.debt_action_link','finance.debt_obligation','finance.debt_payment','finance.debt_payment_revision','finance.debt_schedule_version','finance.debt_settlement','finance.fee_component','finance.financial_account','finance.financial_action','finance.journal','finance.ledger_account','finance.payment_component','finance.payment_due_allocation','finance.payment_reclassification','finance.posting','finance.purchase_detail','finance.receipt_detail','finance.reconciliation','finance.refund_allocation','finance.refund_detail','finance.schedule_allocation_map','finance.scheduled_installment','finance.settlement_component','finance.transfer_detail','ops.import_batch','ops.import_row','planning.budget','planning.expected_occurrence','planning.goal_reservation','planning.occurrence_actual_link','planning.recurrence_version','planning.recurring_obligation','planning.savings_goal','time.notification_attempt','time.notification_delivery','time.notification_preference','time.notification_provider_event','time.personal_event','time.reminder_occurrence','time.reminder_rule','time.source_reminder_setting'];pending text[];remaining text[];name text;entity jsonb;record jsonb;records jsonb;rows_count bigint:=0;col record;cols text;values_sql text;record_data jsonb;recovery jsonb:='{}'::jsonb;before_revision bigint;loaded bigint:=0;progress boolean;
BEGIN
 PERFORM 1 FROM core.user_profile WHERE user_id=owner_id AND lifecycle='active' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'active owner required' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM core.workspace WHERE id=scope_id AND owner_user_id=owner_id AND state='active' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'active workspace required' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM ops.restore_run WHERE id=run_id AND workspace_id=scope_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'previewed' OR r.expires_at<clock_timestamp() OR r.preview_hash IS DISTINCT FROM approved_hash OR r.expected_financial_revision<>w.financial_revision OR jsonb_array_length(r.preview_json->'blockers')<>0 OR NOT EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.id=receipt_id AND c.workspace_id=scope_id AND c.command_type='portability.restore' AND c.state='claimed') THEN RAISE EXCEPTION 'current owned restore confirmation required' USING ERRCODE='23514';END IF;
 IF encode(sha256(convert_to(ops.canonical_json(r.bundle_json-'checksumSha256'),'UTF8')),'hex')<>r.bundle_json->>'checksumSha256' THEN RAISE EXCEPTION 'bundle checksum invalid';END IF;
 IF jsonb_array_length(r.bundle_json->'entities')<>cardinality(allowed) OR (SELECT count(DISTINCT e->>'kind') FROM jsonb_array_elements(r.bundle_json->'entities') e)<>cardinality(allowed) OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.bundle_json->'entities') e WHERE NOT(e->>'kind'=ANY(allowed))) THEN RAISE EXCEPTION 'complete graph required';END IF;
 IF EXISTS(SELECT 1 FROM files.private_attachment WHERE status<>'deleted') OR EXISTS(SELECT 1 FROM time.notification_delivery WHERE status='attempted') THEN RAISE EXCEPTION 'file recovery or external delivery unresolved';END IF;
 before_revision:=w.financial_revision;
 BEGIN
 UPDATE ops.restore_run SET state='applying',confirmed_at=clock_timestamp(),started_at=clock_timestamp(),apply_transaction=pg_current_xact_id()::text WHERE id=run_id;
 PERFORM set_config('ops.restore_run_id',run_id::text,true);
 UPDATE core.workspace SET state='restoring' WHERE id=scope_id;
 SET CONSTRAINTS ALL DEFERRED;
 FOREACH name IN ARRAY allowed LOOP
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM %s t WHERE workspace_id=$1',name) INTO records USING scope_id;
  rows_count:=rows_count+jsonb_array_length(records);IF rows_count>10000 THEN RAISE EXCEPTION 'recovery row bound';END IF;
  recovery:=recovery||jsonb_build_object(name,records);
 END LOOP;
 IF octet_length(recovery::text)>10485760 THEN RAISE EXCEPTION 'recovery byte bound';END IF;
 UPDATE ops.restore_run SET recovery_json=jsonb_build_object('workspace',to_jsonb(w),'entities',recovery) WHERE id=run_id;
 pending:=array_remove(allowed,'core.command_receipt');
 WHILE cardinality(pending)>0 LOOP remaining:=ARRAY[]::text[];progress:=false;FOREACH name IN ARRAY pending LOOP BEGIN
 /* Keep audit evidence for operational receipts retained outside the graph. */
 IF name='audit.private_revision' THEN EXECUTE 'DELETE FROM audit.private_revision WHERE workspace_id=$1 AND command_receipt_id NOT IN (SELECT command_receipt_id FROM ops.restore_run WHERE workspace_id=$1 UNION SELECT command_receipt_id FROM ops.export_run WHERE workspace_id=$1)' USING scope_id;
 ELSE EXECUTE format('DELETE FROM %s WHERE workspace_id=$1',name) USING scope_id;END IF;progress:=true;
 EXCEPTION WHEN foreign_key_violation THEN remaining:=array_append(remaining,name);END;END LOOP;IF NOT progress THEN RAISE EXCEPTION 'replacement dependency unresolved';END IF;pending:=remaining;END LOOP;
 pending:=allowed;
 WHILE cardinality(pending)>0 LOOP remaining:=ARRAY[]::text[];progress:=false;FOREACH name IN ARRAY pending LOOP BEGIN
  SELECT e INTO entity FROM jsonb_array_elements(r.bundle_json->'entities') e WHERE e->>'kind'=name;
  records:=entity->'records';
  FOR record IN SELECT v FROM jsonb_array_elements(records) v LOOP
   IF record->>'workspace_id'<>'$workspace' THEN RAISE EXCEPTION 'foreign workspace rejected';END IF;
   record_data:=ops.remap_owner_json(record,owner_id,scope_id);
   IF name='time.notification_preference' THEN CONTINUE;END IF;
   IF name='time.notification_delivery' AND record_data->>'status' IN ('scheduled','failed','attempted') THEN record_data:=jsonb_set(record_data,'{status}',to_jsonb(CASE WHEN record_data->>'status'='attempted' THEN 'uncertain' ELSE 'cancelled' END));END IF;
   IF name='ops.import_batch' AND record_data->>'state' NOT IN ('completed','cancelled') THEN record_data:=jsonb_set(record_data,'{state}','"cancelled"'::jsonb);END IF;
   IF name='files.private_attachment' THEN record_data:=record_data||jsonb_build_object('object_key','evidence/'||scope_id||'/'||(record->>'id'),'bucket_key','evidence','object_version',NULL,'scan_claim_id',NULL,'scan_lease_until',NULL,'status','deleted','deleted_at',clock_timestamp());END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(record_data) k WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=name::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped)) THEN RAISE EXCEPTION 'unknown portable column';END IF;
   cols:=NULL;values_sql:=NULL;
   FOR col IN SELECT attname,format_type(atttypid,atttypmod) typ FROM pg_attribute WHERE attrelid=name::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum LOOP
    IF NOT record_data ? col.attname THEN RAISE EXCEPTION 'portable column missing';END IF;
    IF col.typ='uuid' AND col.attname ~ '(^|_)user_id$' AND record_data->col.attname<>'null'::jsonb AND record_data->>col.attname<>owner_id::text THEN RAISE EXCEPTION 'foreign auth identity';END IF;
    IF col.typ IN ('bigint','numeric') AND jsonb_typeof(record_data->col.attname) NOT IN ('string','null') THEN RAISE EXCEPTION 'exact financial string required';END IF;
    IF col.typ='bytea' AND record_data->col.attname<>'null'::jsonb THEN record_data:=jsonb_set(record_data,ARRAY[col.attname],to_jsonb('\x'||(record_data->>col.attname)));END IF;
    cols:=concat_ws(',',cols,quote_ident(col.attname));values_sql:=concat_ws(',',values_sql,'p.'||quote_ident(col.attname));
   END LOOP;
   IF name='core.command_receipt' AND EXISTS(SELECT 1 FROM core.command_receipt c WHERE c.id=(record->>'id')::uuid AND c.workspace_id=scope_id) THEN CONTINUE;END IF;
   IF name='audit.private_revision' AND EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.id=(record->>'id')::uuid AND a.workspace_id=scope_id) THEN CONTINUE;END IF;
   EXECUTE format('INSERT INTO %s(%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) p',name,cols,values_sql,name) USING record_data;
   loaded:=loaded+1;
   IF record ? 'id' THEN INSERT INTO ops.restore_id_map(workspace_id,restore_run_id,entity_kind,source_id,target_id) VALUES(scope_id,run_id,name,(record->>'id')::uuid,(record->>'id')::uuid) ON CONFLICT DO NOTHING;END IF;
  END LOOP;progress:=true;
 EXCEPTION WHEN foreign_key_violation THEN remaining:=array_append(remaining,name);END;END LOOP;IF NOT progress THEN RAISE EXCEPTION 'restoration dependency unresolved';END IF;pending:=remaining;END LOOP;
 IF EXISTS(SELECT 1 FROM finance.journal j LEFT JOIN finance.posting p ON p.workspace_id=j.workspace_id AND p.journal_id=j.id WHERE j.workspace_id=scope_id GROUP BY j.id HAVING count(p.id)<2 OR sum(p.amount_minor::numeric)<>0) THEN RAISE EXCEPTION 'unbalanced portable journal';END IF;
 UPDATE core.workspace SET state='active',financial_revision=greatest(before_revision,(r.bundle_json->'manifest'->>'financialRevision')::bigint)+1,timezone=r.bundle_json->'manifest'->>'timezone',week_start=(r.bundle_json->'manifest'->>'weekStart')::smallint,version=version+1,updated_at=clock_timestamp() WHERE id=scope_id;
 UPDATE ops.restore_run SET state='completed',completed_at=clock_timestamp() WHERE id=run_id;
 RETURN jsonb_build_object('runId',run_id,'restored',true,'sourceRows',(r.bundle_json->'manifest'->>'rowCount')::int,'notificationConsentReset',true,'recoveryRetained',true);
 EXCEPTION WHEN OTHERS THEN UPDATE ops.restore_run SET state='failed',last_error_code='RESTORE_VALIDATION_FAILED',recovery_json=CASE WHEN recovery='{}'::jsonb THEN NULL ELSE jsonb_build_object('workspace',to_jsonb(w),'entities',recovery) END WHERE id=run_id;RETURN jsonb_build_object('runId',run_id,'restored',false,'code','RESTORE_VALIDATION_FAILED');END;
END $$;
REVOKE ALL ON FUNCTION ops.apply_private_restore(uuid,bytea,uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.apply_private_restore(uuid,bytea,uuid) TO app_domain;
