CREATE OR REPLACE FUNCTION ops.guard_import_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r core.command_receipt;scope uuid;b ops.import_batch;BEGIN
 scope:=CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 IF TG_OP='DELETE' THEN IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(scope) THEN RETURN OLD;END IF;RAISE EXCEPTION 'import evidence requires approved purge';END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.workspace_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.created_at) THEN RAISE EXCEPTION 'import identity immutable';END IF;
 IF TG_TABLE_NAME='import_batch' THEN
  IF TG_OP='INSERT' THEN SELECT * INTO r FROM core.command_receipt WHERE workspace_id=scope AND id=NEW.command_receipt_id;
  ELSE
   SELECT * INTO r FROM core.command_receipt WHERE workspace_id=scope AND id=NULLIF(current_setting('imports.receipt_id',true),'')::uuid;
   IF ROW(NEW.source_format,NEW.format_version,NEW.file_checksum,NEW.mapping_json,NEW.date_interpretation,NEW.currency,NEW.target_account_id,NEW.cutoff_strategy,NEW.cutoff_date,NEW.preview_hash,NEW.preview_json,NEW.command_receipt_id,NEW.expires_at) IS DISTINCT FROM ROW(OLD.source_format,OLD.format_version,OLD.file_checksum,OLD.mapping_json,OLD.date_interpretation,OLD.currency,OLD.target_account_id,OLD.cutoff_strategy,OLD.cutoff_date,OLD.preview_hash,OLD.preview_json,OLD.command_receipt_id,OLD.expires_at) THEN RAISE EXCEPTION 'reviewed import immutable';END IF;
   IF OLD.state IN ('completed','cancelled') THEN RAISE EXCEPTION 'terminal import immutable';END IF;
   IF OLD.confirmed_preview_hash IS NOT NULL AND ROW(NEW.confirmed_preview_hash,NEW.decisions_json,NEW.confirmed_at) IS DISTINCT FROM ROW(OLD.confirmed_preview_hash,OLD.decisions_json,OLD.confirmed_at) THEN RAISE EXCEPTION 'import confirmation immutable';END IF;
  END IF;
  IF r.id IS NULL OR r.state NOT IN ('claimed','completed') OR r.command_type NOT IN ('imports.stage','imports.confirm','imports.process','imports.cancel') THEN RAISE EXCEPTION 'import command required';END IF;
  IF NEW.preview_json->>'batchId'<>NEW.id::text OR NEW.preview_json->>'fileChecksum'<>encode(NEW.file_checksum,'hex') OR NEW.preview_json->>'previewHash'<>encode(NEW.preview_hash,'hex') THEN RAISE EXCEPTION 'preview binding invalid';END IF;
 ELSE
  SELECT * INTO b FROM ops.import_batch WHERE workspace_id=scope AND id=NEW.batch_id;
  IF TG_OP='UPDATE' THEN
   IF ROW(NEW.batch_id,NEW.row_no,NEW.source_row_hash,NEW.client_command_id,NEW.normalized_json,NEW.validation_errors_json,NEW.duplicate_candidate_action_id) IS DISTINCT FROM ROW(OLD.batch_id,OLD.row_no,OLD.source_row_hash,OLD.client_command_id,OLD.normalized_json,OLD.validation_errors_json,OLD.duplicate_candidate_action_id) THEN RAISE EXCEPTION 'staged row immutable';END IF;
   IF OLD.state IN ('posted','skipped','invalid') THEN RAISE EXCEPTION 'terminal import row immutable';END IF;
  END IF;
  IF b.id IS NULL OR b.state NOT IN ('previewed','confirmed','running','partial') OR NEW.client_command_id IS DISTINCT FROM (b.preview_json->'rows'->(NEW.row_no-1)->>'clientCommandId')::uuid OR NEW.normalized_json IS DISTINCT FROM b.preview_json->'rows'->(NEW.row_no-1)->'normalized' THEN RAISE EXCEPTION 'row preview binding invalid';END IF;
  IF NEW.state='posted' AND NOT EXISTS(SELECT 1 FROM core.command_receipt c JOIN finance.financial_action a ON a.workspace_id=c.workspace_id AND a.original_command_receipt_id=c.id JOIN finance.action_revision r ON r.workspace_id=a.workspace_id AND r.id=a.current_revision_id WHERE c.workspace_id=scope AND c.id=NEW.command_receipt_id AND c.client_command_id=NEW.client_command_id AND c.state='completed' AND a.id=NEW.financial_action_id AND r.state='posted') THEN RAISE EXCEPTION 'posted import financial receipt required';END IF;
 END IF;RETURN NEW;END $$;

CREATE FUNCTION ops.lock_file_scope() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM 1 FROM core.user_profile p JOIN core.workspace w ON w.owner_user_id=p.user_id WHERE p.user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND p.lifecycle='active' AND w.state='active' FOR SHARE OF p,w;IF NOT FOUND THEN RAISE EXCEPTION 'active file scope required' USING ERRCODE='42501';END IF;END $$;
REVOKE ALL ON FUNCTION ops.lock_file_scope() FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.lock_file_scope() TO worker_domain;
DROP TRIGGER file_active ON files.private_attachment;
CREATE FUNCTION files.guard_active_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF current_user='worker_domain' THEN PERFORM ops.lock_file_scope();ELSIF current_user<>'lifecycle_operator' THEN PERFORM 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=NEW.workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active';IF NOT FOUND THEN RAISE EXCEPTION 'active file scope required';END IF;END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION files.guard_active_scope() FROM PUBLIC;
CREATE TRIGGER file_active BEFORE INSERT OR UPDATE ON files.private_attachment FOR EACH ROW EXECUTE FUNCTION files.guard_active_scope();
