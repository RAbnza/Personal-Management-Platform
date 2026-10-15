CREATE OR REPLACE FUNCTION ops.authorize_cash_rebase(batch_id uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b ops.import_batch;f finance.financial_account;baseline numeric;net numeric;BEGIN
 SELECT * INTO b FROM ops.import_batch WHERE id=batch_id FOR UPDATE;SELECT * INTO f FROM finance.financial_account WHERE id=b.target_account_id FOR UPDATE;
 IF b.id IS NULL OR b.cutoff_strategy<>'rebase_history' OR b.state<>'running' OR b.confirmed_preview_hash IS DISTINCT FROM b.preview_hash OR f.opening_cutoff_date IS DISTINCT FROM b.cutoff_date THEN RAISE EXCEPTION 'confirmed rebase required';END IF;
 SELECT COALESCE(sum(p.amount_minor::numeric),0) INTO baseline FROM finance.posting p JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.current_revision_id=p.action_revision_id JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id WHERE a.id=f.opening_action_id AND p.ledger_account_id=f.ledger_account_id AND j.role='economic';
 SELECT COALESCE(sum((CASE WHEN r.normalized_json->>'kind'='income' THEN 1 ELSE -1 END)*(r.normalized_json->>'amountMinor')::numeric),0) INTO net FROM ops.import_row r JOIN jsonb_array_elements(b.decisions_json->'decisions') d ON (d->>'rowNo')::int=r.row_no WHERE r.batch_id=b.id AND d->>'choice'='import' AND (r.normalized_json->>'effectiveDate')::date<=b.cutoff_date AND jsonb_array_length(r.validation_errors_json)=0;
 IF baseline<>(b.preview_json->>'openingMinor')::numeric OR (b.preview_json->'assumptions'->>'earlierOpeningMinor')::numeric+net<>baseline THEN RAISE EXCEPTION 'rebase coverage equation failed';END IF;
 PERFORM set_config('finance.rebase_batch_id',b.id::text,true);
 IF NOT ops.cash_rebase_allowed(f.id,f.opening_cutoff_date,(b.preview_json->'assumptions'->>'earlierOpeningDate')::date) THEN RAISE EXCEPTION 'rebase authority unavailable';END IF;
END $$;
