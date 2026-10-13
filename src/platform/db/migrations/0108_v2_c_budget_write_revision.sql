/* Bind completed receipts to the database-assigned write revision. */
CREATE OR REPLACE FUNCTION planning.budget_snapshot(body jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT (body-ARRAY['created_at','updated_at'])||jsonb_build_object('limit_minor',body->>'limit_minor','write_revision',body->>'write_revision') $$;
CREATE OR REPLACE FUNCTION planning.guard_budget() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; same_category boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'budget history requires approved lifecycle purge' USING ERRCODE='23514';
 END IF;
 PERFORM finance.lock_active_workspace(NEW.workspace_id);
 IF NEW.recorded_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'budget attribution requires current actor' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 IF c.id IS NULL OR c.state<>'claimed' OR c.command_type NOT IN('planning.budget.save','planning.budget.archive','planning.budget.restore') THEN RAISE EXCEPTION 'budget write requires current reviewed receipt' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF c.command_type<>'planning.budget.save' OR NEW.version<>1 OR NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'budget requires initial reviewed definition' USING ERRCODE='23514'; END IF;
  NEW.created_at:=clock_timestamp();
 ELSE
  same_category:=NEW.category_id=OLD.category_id;
  IF ROW(NEW.id,NEW.workspace_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.created_at) OR NEW.version<>OLD.version+1 OR NEW.command_receipt_id=OLD.command_receipt_id THEN RAISE EXCEPTION 'budget identity and revision are protected' USING ERRCODE='23514'; END IF;
  IF c.command_type='planning.budget.save' THEN
   IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'save cannot change budget lifecycle' USING ERRCODE='23514'; END IF;
  ELSE
   IF ROW(NEW.category_id,NEW.start_date,NEW.end_date_exclusive,NEW.limit_minor,NEW.basis,NEW.notes) IS DISTINCT FROM ROW(OLD.category_id,OLD.start_date,OLD.end_date_exclusive,OLD.limit_minor,OLD.basis,OLD.notes) THEN RAISE EXCEPTION 'lifecycle cannot rewrite budget definition' USING ERRCODE='23514'; END IF;
   IF c.command_type='planning.budget.archive' THEN
    IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL THEN RAISE EXCEPTION 'archive requires active budget' USING ERRCODE='23514'; END IF;
    NEW.archived_at:=clock_timestamp();
   ELSIF OLD.archived_at IS NULL OR NEW.archived_at IS NOT NULL THEN RAISE EXCEPTION 'restore requires archived budget' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM core.category WHERE workspace_id=NEW.workspace_id AND id=NEW.category_id AND kind='expense' AND (archived_at IS NULL OR same_category)) THEN RAISE EXCEPTION 'budget requires owned expense category' USING ERRCODE='23514'; END IF;
 /* Updating the serialization row also rejects stale REPEATABLE READ writers.
  * Metadata only: no financial action, journal or account balance is created. */
 UPDATE core.workspace SET financial_revision=financial_revision+1 WHERE id=NEW.workspace_id RETURNING financial_revision INTO NEW.write_revision;
 IF EXISTS(SELECT 1 FROM planning.budget b WHERE b.workspace_id=NEW.workspace_id AND b.category_id=NEW.category_id AND b.id<>NEW.id AND b.start_date<NEW.end_date_exclusive AND b.end_date_exclusive>NEW.start_date) THEN RAISE EXCEPTION 'BUDGET_OVERLAP: category periods must not overlap' USING ERRCODE='23514'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;

/* Independently reject nullable/malformed result evidence at SQL finalization. */
CREATE OR REPLACE FUNCTION planning.validate_budget() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; body jsonb; previous jsonb; audit_operation text;
BEGIN
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 body:=planning.budget_snapshot(to_jsonb(NEW));previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE planning.budget_snapshot(to_jsonb(OLD)) END;audit_operation:=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'replace' END;
 IF c.id IS NULL OR c.state<>'completed' OR c.retain_until IS NOT NULL OR c.command_type NOT IN('planning.budget.save','planning.budget.archive','planning.budget.restore') OR NOT COALESCE(c.result_json @> jsonb_build_object('budgetId',NEW.id,'version',NEW.version) AND c.result_json ?& ARRAY['reason','financialRevision'] AND (c.result_json->>'financialRevision') ~ '^[0-9]+$' AND c.result_json->>'financialRevision'=NEW.write_revision::text,false) OR EXISTS(SELECT 1 FROM finance.action_revision r WHERE r.workspace_id=NEW.workspace_id AND r.command_receipt_id=c.id) THEN RAISE EXCEPTION 'budget requires completed permanent nonfinancial result' USING ERRCODE='23514'; END IF;
 IF (TG_OP='INSERT' AND c.result_json->>'reason' IS NOT NULL) OR (TG_OP='UPDATE' AND NOT COALESCE(char_length(btrim(c.result_json->>'reason')) BETWEEN 1 AND 2000,false)) THEN RAISE EXCEPTION 'budget changes require explicit reason' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind='budget' AND a.subject_id=NEW.id AND a.subject_version=NEW.version AND a.operation=audit_operation AND a.before_json IS NOT DISTINCT FROM previous AND a.after_json=body AND a.recorded_by_user_id=NEW.recorded_by_user_id AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM NEW.request_id AND a.effective_date=NEW.start_date AND a.reason IS NOT DISTINCT FROM c.result_json->>'reason') THEN RAISE EXCEPTION 'budget requires exact attributed audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION planning.validate_budget() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.validate_budget() TO app_domain,lifecycle_operator;

REVOKE ALL ON FUNCTION planning.budget_snapshot(jsonb),planning.guard_budget() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.budget_snapshot(jsonb),planning.guard_budget() TO app_domain,lifecycle_operator;
