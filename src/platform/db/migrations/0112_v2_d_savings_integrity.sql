/* Conceptual savings reservations never recognize money. */
DO $$ DECLARE relation text; BEGIN FOREACH relation IN ARRAY ARRAY['savings_goal','goal_reservation'] LOOP
 EXECUTE format('REVOKE ALL ON planning.%I FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator',relation);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON planning.%I TO app_domain',relation);
 EXECUTE format('GRANT SELECT,DELETE ON planning.%I TO lifecycle_operator',relation);
 EXECUTE format('ALTER TABLE planning.%I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE planning.%I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY savings_owner ON planning.%I TO app_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')) WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',relation);
 EXECUTE format('CREATE POLICY lifecycle_purge_scope ON planning.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',relation);
END LOOP; END $$;
--> statement-breakpoint
/* Same finalized signed posting grain as readAccountBalanceAt; current local
 * cutoff, never expected activity or an editable balance. */
CREATE VIEW planning.goal_cash_v WITH(security_invoker=true) AS
WITH balances AS (
 SELECT p.workspace_id,p.ledger_account_id,sum(p.amount_minor::numeric) balance
 FROM finance.posting p JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
 JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
 JOIN core.workspace w ON w.id=p.workspace_id
 WHERE j.effective_date<=(transaction_timestamp() AT TIME ZONE w.timezone)::date
 GROUP BY p.workspace_id,p.ledger_account_id
), reserved AS (
 SELECT workspace_id,financial_account_id,sum(reserved_minor::numeric) amount FROM planning.goal_reservation GROUP BY workspace_id,financial_account_id
)
SELECT a.workspace_id,a.id financial_account_id,a.name,a.account_type,a.currency,a.version account_version,
 a.archived_at IS NOT NULL OR l.archived_at IS NOT NULL archived,
 (a.archived_at IS NULL AND l.archived_at IS NULL AND l.kind='cash_asset' AND a.currency=w.currency AND l.currency=w.currency AND a.opening_cutoff_date<=(transaction_timestamp() AT TIME ZONE w.timezone)::date) eligible,
 COALESCE(b.balance,0) balance_minor,COALESCE(r.amount,0) reserved_minor,
 CASE WHEN a.archived_at IS NULL AND l.archived_at IS NULL AND l.kind='cash_asset' AND a.currency=w.currency AND l.currency=w.currency AND a.opening_cutoff_date<=(transaction_timestamp() AT TIME ZONE w.timezone)::date THEN GREATEST(COALESCE(b.balance,0),0) ELSE 0 END capacity_minor
FROM finance.financial_account a JOIN finance.ledger_account l ON l.workspace_id=a.workspace_id AND l.id=a.ledger_account_id JOIN core.workspace w ON w.id=a.workspace_id
LEFT JOIN balances b ON b.workspace_id=a.workspace_id AND b.ledger_account_id=a.ledger_account_id LEFT JOIN reserved r ON r.workspace_id=a.workspace_id AND r.financial_account_id=a.id;
REVOKE ALL ON planning.goal_cash_v FROM PUBLIC,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT ON planning.goal_cash_v TO app_domain;
--> statement-breakpoint
CREATE FUNCTION planning.savings_snapshot(body jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (body-ARRAY['created_at','updated_at'])||jsonb_build_object('write_revision',body->>'write_revision')||CASE WHEN body ? 'target_minor' THEN jsonb_build_object('target_minor',body->>'target_minor') ELSE jsonb_build_object('reserved_minor',body->>'reserved_minor') END
$$;
CREATE FUNCTION planning.goal_command_result(ws uuid,receipt uuid,primary_goal uuid,reason text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('goalId',primary_goal,'reason',reason,'financialRevision',GREATEST(
 COALESCE((SELECT max(write_revision) FROM planning.savings_goal WHERE workspace_id=ws AND command_receipt_id=receipt),0),
 COALESCE((SELECT max(write_revision) FROM planning.goal_reservation WHERE workspace_id=ws AND command_receipt_id=receipt),0))::text,
 'goals',COALESCE((SELECT jsonb_agg(jsonb_build_object('goalId',id,'version',version,'financialRevision',write_revision::text) ORDER BY id) FROM planning.savings_goal WHERE workspace_id=ws AND command_receipt_id=receipt),'[]'::jsonb),
 'reservations',COALESCE((SELECT jsonb_agg(jsonb_build_object('reservationId',id,'version',version,'financialRevision',write_revision::text) ORDER BY id) FROM planning.goal_reservation WHERE workspace_id=ws AND command_receipt_id=receipt),'[]'::jsonb))
$$;
CREATE FUNCTION planning.guard_savings() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; increasing boolean; state text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'savings history requires approved lifecycle purge' USING ERRCODE='23514';
 END IF;
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 IF NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'savings requires current actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 IF c.id IS NULL OR c.state<>'claimed' OR c.command_type NOT IN('planning.goal.save','planning.goal.complete','planning.goal.archive','planning.goal.reopen','planning.goal.reserve','planning.goal.reallocate') THEN RAISE EXCEPTION 'savings requires claimed reviewed receipt' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 THEN RAISE EXCEPTION 'savings requires initial version' USING ERRCODE='23514'; END IF;
  NEW.created_at:=clock_timestamp();
 ELSE
  IF ROW(NEW.id,NEW.workspace_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.created_at) OR NEW.version<>OLD.version+1 OR NEW.command_receipt_id=OLD.command_receipt_id THEN RAISE EXCEPTION 'savings identity and revision protected' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='savings_goal' THEN
  IF TG_OP='INSERT' THEN
   IF c.command_type<>'planning.goal.save' OR NEW.status<>'active' THEN RAISE EXCEPTION 'goal requires initial active definition' USING ERRCODE='23514'; END IF;
  ELSE
   IF c.command_type='planning.goal.save' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'save cannot change goal lifecycle' USING ERRCODE='23514'; END IF;
   ELSE
    IF ROW(NEW.name,NEW.target_minor,NEW.target_date,NEW.notes) IS DISTINCT FROM ROW(OLD.name,OLD.target_minor,OLD.target_date,OLD.notes) THEN RAISE EXCEPTION 'goal command cannot rewrite definition' USING ERRCODE='23514'; END IF;
    IF c.command_type='planning.goal.complete' THEN
     IF OLD.status<>'active' OR NEW.status<>'completed' THEN RAISE EXCEPTION 'completion requires active goal' USING ERRCODE='23514'; END IF;
    ELSIF c.command_type='planning.goal.archive' THEN
     IF OLD.status='archived' OR NEW.status<>'archived' THEN RAISE EXCEPTION 'archive requires unarchived goal' USING ERRCODE='23514'; END IF;
    ELSIF c.command_type='planning.goal.reopen' THEN
     IF OLD.status='active' OR NEW.status<>'active' THEN RAISE EXCEPTION 'reopen requires inactive goal' USING ERRCODE='23514'; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'reservation cannot change lifecycle' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 ELSE
  IF c.command_type NOT IN('planning.goal.reserve','planning.goal.reallocate') OR (TG_OP='UPDATE' AND ROW(NEW.goal_id,NEW.financial_account_id) IS DISTINCT FROM ROW(OLD.goal_id,OLD.financial_account_id)) THEN RAISE EXCEPTION 'reservation identity and command protected' USING ERRCODE='23514'; END IF;
  increasing:=CASE WHEN TG_OP='INSERT' THEN NEW.reserved_minor>0 ELSE NEW.reserved_minor>OLD.reserved_minor END;
  IF (TG_OP='INSERT' AND NEW.reserved_minor<=0) OR (TG_OP='UPDATE' AND NEW.reserved_minor=OLD.reserved_minor) THEN RAISE EXCEPTION 'reservation requires actual management change' USING ERRCODE='23514'; END IF;
  SELECT status INTO state FROM planning.savings_goal WHERE workspace_id=NEW.workspace_id AND id=NEW.goal_id;
  IF state IS NULL OR (increasing AND state<>'active') THEN RAISE EXCEPTION 'increase requires active owned goal' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=NEW.workspace_id RETURNING financial_revision INTO NEW.write_revision;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION planning.validate_savings() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; body jsonb; previous jsonb; primary_goal uuid; pool planning.goal_cash_v%ROWTYPE; changed_goal uuid; today date;
BEGIN
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 IF c.id IS NULL OR c.state<>'completed' OR c.retain_until IS NOT NULL OR NOT COALESCE(jsonb_typeof(c.result_json->'goalId')='string' AND jsonb_typeof(c.result_json->'financialRevision')='string' AND jsonb_typeof(c.result_json->'goals')='array' AND jsonb_typeof(c.result_json->'reservations')='array' AND c.result_json ? 'reason',false) OR EXISTS(SELECT 1 FROM finance.action_revision WHERE workspace_id=NEW.workspace_id AND command_receipt_id=c.id) THEN RAISE EXCEPTION 'savings requires complete permanent nonfinancial result' USING ERRCODE='23514'; END IF;
 primary_goal:=(c.result_json->>'goalId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM planning.savings_goal WHERE workspace_id=NEW.workspace_id AND id=primary_goal AND command_receipt_id=c.id) OR c.result_json IS DISTINCT FROM planning.goal_command_result(NEW.workspace_id,c.id,primary_goal,c.result_json->>'reason') THEN RAISE EXCEPTION 'savings result must match complete changed graph exactly' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='savings_goal' AND TG_OP='INSERT' THEN
  IF jsonb_typeof(c.result_json->'reason') IS DISTINCT FROM 'null' THEN RAISE EXCEPTION 'new goal reason must be null' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT COALESCE(jsonb_typeof(c.result_json->'reason')='string' AND char_length(btrim(c.result_json->>'reason')) BETWEEN 1 AND 2000,false) THEN RAISE EXCEPTION 'savings change requires explicit reason' USING ERRCODE='23514'; END IF;
 END IF;
 body:=planning.savings_snapshot(to_jsonb(NEW)); previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE planning.savings_snapshot(to_jsonb(OLD)) END;
 SELECT (transaction_timestamp() AT TIME ZONE timezone)::date INTO today FROM core.workspace WHERE id=NEW.workspace_id;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind=TG_TABLE_NAME AND a.subject_id=NEW.id AND a.subject_version=NEW.version AND a.operation=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'replace' END AND a.before_json IS NOT DISTINCT FROM previous AND a.after_json=body AND a.reason IS NOT DISTINCT FROM c.result_json->>'reason' AND a.effective_date=today AND a.recorded_by_user_id=NEW.recorded_by_user_id AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM NEW.request_id) THEN RAISE EXCEPTION 'savings requires exact attributed audit evidence' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='savings_goal' THEN
  IF NEW.status='archived' AND EXISTS(SELECT 1 FROM planning.goal_reservation WHERE workspace_id=NEW.workspace_id AND goal_id=NEW.id AND reserved_minor>0) THEN RAISE EXCEPTION 'release reservations explicitly before archival' USING ERRCODE='23514'; END IF;
  IF c.command_type IN('planning.goal.reserve','planning.goal.reallocate') AND NOT EXISTS(SELECT 1 FROM planning.goal_reservation WHERE workspace_id=NEW.workspace_id AND goal_id=NEW.id AND command_receipt_id=c.id) THEN RAISE EXCEPTION 'reservation command requires changed reservation evidence' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM planning.savings_goal WHERE workspace_id=NEW.workspace_id AND id=NEW.goal_id AND command_receipt_id=c.id) THEN RAISE EXCEPTION 'reservation requires current audited goal revision' USING ERRCODE='23514'; END IF;
  IF (CASE WHEN TG_OP='INSERT' THEN NEW.reserved_minor>0 ELSE NEW.reserved_minor>OLD.reserved_minor END) THEN
   SELECT * INTO pool FROM planning.goal_cash_v WHERE workspace_id=NEW.workspace_id AND financial_account_id=NEW.financial_account_id;
   IF pool.financial_account_id IS NULL OR NOT pool.eligible OR pool.reserved_minor>pool.capacity_minor THEN RAISE EXCEPTION 'SAVINGS_CAPACITY: increased reservations exceed eligible account cash' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE relation text; BEGIN FOREACH relation IN ARRAY ARRAY['savings_goal','goal_reservation'] LOOP
 EXECUTE format('CREATE TRIGGER savings_write BEFORE INSERT OR UPDATE OR DELETE ON planning.%I FOR EACH ROW EXECUTE FUNCTION planning.guard_savings()',relation);
 EXECUTE format('CREATE CONSTRAINT TRIGGER savings_finalization AFTER INSERT OR UPDATE ON planning.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION planning.validate_savings()',relation);
END LOOP; END $$;
/* Existing account root locks serialize eligibility changes; advance read
 * metadata so old REPEATABLE READ writers and client reviews cannot reuse it. */
CREATE FUNCTION planning.guard_savings_account_metadata() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['version','updated_at','opening_action_id','notes','institution_name']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','updated_at','opening_action_id','notes','institution_name']) THEN
  PERFORM finance.lock_active_workspace(NEW.workspace_id);
  UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=NEW.workspace_id;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER savings_account_metadata BEFORE UPDATE OF name,archived_at,account_type,currency,opening_cutoff_date,ledger_account_id ON finance.financial_account FOR EACH ROW EXECUTE FUNCTION planning.guard_savings_account_metadata();
CREATE TRIGGER savings_ledger_metadata BEFORE UPDATE OF name,archived_at,kind,currency ON finance.ledger_account FOR EACH ROW EXECUTE FUNCTION planning.guard_savings_account_metadata();
REVOKE ALL ON FUNCTION planning.savings_snapshot(jsonb),planning.goal_command_result(uuid,uuid,uuid,text),planning.guard_savings(),planning.validate_savings(),planning.guard_savings_account_metadata() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.savings_snapshot(jsonb),planning.goal_command_result(uuid,uuid,uuid,text),planning.guard_savings(),planning.validate_savings() TO app_domain,lifecycle_operator;
GRANT EXECUTE ON FUNCTION planning.guard_savings_account_metadata() TO app_domain;
