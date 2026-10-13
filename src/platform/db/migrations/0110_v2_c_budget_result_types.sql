/* Preserve the exact replay result JSON contract independently of API parsing. */
CREATE OR REPLACE FUNCTION planning.validate_budget() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c core.command_receipt%ROWTYPE; body jsonb; previous jsonb; audit_operation text;
BEGIN
 SELECT * INTO c FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
 body:=planning.budget_snapshot(to_jsonb(NEW));previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE planning.budget_snapshot(to_jsonb(OLD)) END;audit_operation:=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'replace' END;
 IF c.id IS NULL OR c.state<>'completed' OR c.retain_until IS NOT NULL OR c.command_type NOT IN('planning.budget.save','planning.budget.archive','planning.budget.restore') OR NOT COALESCE(c.result_json @> jsonb_build_object('budgetId',NEW.id,'version',NEW.version) AND c.result_json ?& ARRAY['reason','financialRevision'] AND jsonb_typeof(c.result_json->'financialRevision')='string' AND ((TG_OP='INSERT' AND jsonb_typeof(c.result_json->'reason')='null') OR (TG_OP='UPDATE' AND jsonb_typeof(c.result_json->'reason')='string')) AND (c.result_json->>'financialRevision') ~ '^[0-9]+$' AND c.result_json->>'financialRevision'=NEW.write_revision::text,false) OR EXISTS(SELECT 1 FROM finance.action_revision r WHERE r.workspace_id=NEW.workspace_id AND r.command_receipt_id=c.id) THEN RAISE EXCEPTION 'budget requires completed permanent nonfinancial result' USING ERRCODE='23514'; END IF;
 IF (TG_OP='INSERT' AND c.result_json->>'reason' IS NOT NULL) OR (TG_OP='UPDATE' AND NOT COALESCE(char_length(btrim(c.result_json->>'reason')) BETWEEN 1 AND 2000,false)) THEN RAISE EXCEPTION 'budget changes require explicit reason' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=NEW.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind='budget' AND a.subject_id=NEW.id AND a.subject_version=NEW.version AND a.operation=audit_operation AND a.before_json IS NOT DISTINCT FROM previous AND a.after_json=body AND a.recorded_by_user_id=NEW.recorded_by_user_id AND a.actor_kind='user' AND a.request_id IS NOT DISTINCT FROM NEW.request_id AND a.effective_date=NEW.start_date AND a.reason IS NOT DISTINCT FROM c.result_json->>'reason') THEN RAISE EXCEPTION 'budget requires exact attributed audit evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION planning.validate_budget() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION planning.validate_budget() TO app_domain,lifecycle_operator;

