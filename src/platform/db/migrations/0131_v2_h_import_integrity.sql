CREATE FUNCTION ops.guard_import_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
  IF NEW.state='posted' AND NOT EXISTS(SELECT 1 FROM core.command_receipt c JOIN finance.financial_action a ON a.workspace_id=c.workspace_id AND a.command_receipt_id=c.id JOIN finance.action_revision r ON r.workspace_id=a.workspace_id AND r.id=a.current_revision_id WHERE c.workspace_id=scope AND c.id=NEW.command_receipt_id AND c.client_command_id=NEW.client_command_id AND c.state='completed' AND a.id=NEW.financial_action_id AND r.state='posted') THEN RAISE EXCEPTION 'posted import financial receipt required';END IF;
 END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION ops.guard_import_evidence() FROM PUBLIC;
CREATE TRIGGER import_batch_guard BEFORE INSERT OR UPDATE OR DELETE ON ops.import_batch FOR EACH ROW EXECUTE FUNCTION ops.guard_import_evidence();
CREATE TRIGGER import_row_guard BEFORE INSERT OR UPDATE OR DELETE ON ops.import_row FOR EACH ROW EXECUTE FUNCTION ops.guard_import_evidence();
CREATE TRIGGER import_batch_active BEFORE INSERT OR UPDATE ON ops.import_batch FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
CREATE TRIGGER import_row_active BEFORE INSERT OR UPDATE ON ops.import_row FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
--> statement-breakpoint
CREATE FUNCTION ops.cash_rebase_allowed(account_id uuid,old_cutoff date,new_cutoff date) RETURNS boolean LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT EXISTS(SELECT 1 FROM ops.import_batch b JOIN core.command_receipt c ON c.workspace_id=b.workspace_id AND c.id=NULLIF(current_setting('imports.receipt_id',true),'')::uuid WHERE b.id=NULLIF(current_setting('finance.rebase_batch_id',true),'')::uuid AND b.workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND b.target_account_id=account_id AND b.state='running' AND b.cutoff_strategy='rebase_history' AND b.confirmed_preview_hash=b.preview_hash AND b.cutoff_date=old_cutoff AND (b.preview_json->'assumptions'->>'earlierOpeningDate')::date=new_cutoff AND new_cutoff<old_cutoff AND c.command_type='imports.process' AND c.state='completed' AND c.result_json->>'batchId'=b.id::text)
$$;
CREATE FUNCTION ops.authorize_cash_rebase(batch_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b ops.import_batch;f finance.financial_account;baseline numeric;net numeric;BEGIN
 SELECT * INTO b FROM ops.import_batch WHERE id=batch_id FOR UPDATE;SELECT * INTO f FROM finance.financial_account WHERE id=b.target_account_id FOR UPDATE;
 IF b.id IS NULL OR b.cutoff_strategy<>'rebase_history' OR b.state<>'running' OR b.confirmed_preview_hash IS DISTINCT FROM b.preview_hash OR f.opening_cutoff_date IS DISTINCT FROM b.cutoff_date OR f.opening_action_id IS NULL THEN RAISE EXCEPTION 'confirmed rebase required';END IF;
 SELECT COALESCE(sum(p.amount_minor::numeric),0) INTO baseline FROM finance.posting p JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.current_revision_id=p.action_revision_id JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id WHERE a.id=f.opening_action_id AND p.ledger_account_id=f.ledger_account_id AND j.role='economic';
 SELECT COALESCE(sum((CASE WHEN r.normalized_json->>'kind'='income' THEN 1 ELSE -1 END)*(r.normalized_json->>'amountMinor')::numeric),0) INTO net FROM ops.import_row r JOIN jsonb_array_elements(b.decisions_json->'decisions') d ON (d->>'rowNo')::int=r.row_no WHERE r.batch_id=b.id AND d->>'choice'='import' AND (r.normalized_json->>'effectiveDate')::date<=b.cutoff_date AND jsonb_array_length(r.validation_errors_json)=0;
 IF baseline<>(b.preview_json->>'openingMinor')::numeric OR (b.preview_json->'assumptions'->>'earlierOpeningMinor')::numeric+net<>baseline THEN RAISE EXCEPTION 'rebase coverage equation failed';END IF;
 PERFORM set_config('finance.rebase_batch_id',b.id::text,true);
 IF NOT ops.cash_rebase_allowed(f.id,f.opening_cutoff_date,(b.preview_json->'assumptions'->>'earlierOpeningDate')::date) THEN RAISE EXCEPTION 'rebase authority unavailable';END IF;
END $$;
REVOKE ALL ON FUNCTION ops.cash_rebase_allowed(uuid,date,date),ops.authorize_cash_rebase(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION ops.cash_rebase_allowed(uuid,date,date),ops.authorize_cash_rebase(uuid) TO app_domain;
DO $$ DECLARE d text;anchor text:='  IF NEW.opening_cutoff_date IS DISTINCT FROM OLD.opening_cutoff_date THEN';BEGIN d:=pg_get_functiondef('finance.enforce_financial_account_history_binding()'::regprocedure);IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'baseline guard anchor unavailable';END IF;d:=replace(d,anchor,anchor||E'\n    IF ops.cash_rebase_allowed(NEW.id,OLD.opening_cutoff_date,NEW.opening_cutoff_date) THEN RETURN NEW; END IF;');EXECUTE d;END $$;
