DO $$ DECLARE d text;anchor text;BEGIN
 d:=pg_get_functiondef('finance.validate_group_adoption_recipe()'::regprocedure);
 anchor:='(SELECT coalesce(nr.primary_effective_date,pr.primary_effective_date),coalesce(nd.card_posting_date,pd.card_posting_date),CASE WHEN nd.action_revision_id IS NOT NULL THEN nd.card_provider_reference ELSE pd.card_provider_reference END FROM finance.credit_card c';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'card composite metadata anchor missing'; END IF;
 EXECUTE replace(d,anchor,'(SELECT ROW(coalesce(nr.primary_effective_date,pr.primary_effective_date),coalesce(nd.card_posting_date,pd.card_posting_date),CASE WHEN nd.action_revision_id IS NOT NULL THEN nd.card_provider_reference ELSE pd.card_provider_reference END) FROM finance.credit_card c');
 d:=pg_get_functiondef('sharing.validate_settlement()'::regprocedure);
 EXECUTE replace(d,'IF s.advance_minor>0 AND NOT EXISTS','IF (s.advance_minor>0 OR s.amount_minor>greatest(0,due)) AND NOT EXISTS');
 d:=pg_get_functiondef('sharing.guard_settlement_evidence()'::regprocedure);
 d:=replace(d,' OR NEW.created_at<>transaction_timestamp()','');
 d:=replace(d,'IF NEW.created_at<>transaction_timestamp() OR ','IF ');
 d:=regexp_replace(d,'\mBEGIN\M','BEGIN IF TG_OP=''INSERT'' AND TG_TABLE_NAME IN(''settlement'',''settlement_event'') THEN NEW.created_at:=clock_timestamp(); END IF;');
 EXECUTE d;
END $$;
CREATE FUNCTION sharing.record_exit_clock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN NEW.left_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sharing.record_exit_clock() FROM PUBLIC;
CREATE TRIGGER b_exit_clock BEFORE UPDATE ON sharing.membership FOR EACH ROW EXECUTE FUNCTION sharing.record_exit_clock();
