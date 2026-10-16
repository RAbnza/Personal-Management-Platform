DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('sharing.validate_settlement()'::regprocedure);
 IF strpos(d,'CASE WHEN TG_TABLE_NAME=''settlement'' THEN NEW.id ELSE NEW.settlement_id END')=0 THEN RAISE EXCEPTION 'settlement trigger scope anchor missing'; END IF;
 EXECUTE replace(d,'CASE WHEN TG_TABLE_NAME=''settlement'' THEN NEW.id ELSE NEW.settlement_id END','coalesce((to_jsonb(NEW)->>''settlement_id'')::uuid,NEW.id)');
END $$;
