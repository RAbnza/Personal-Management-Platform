DO $$ DECLARE d text; anchor text := 'record_data:=ops.remap_owner_json(record,owner_id,scope_id);'; BEGIN
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'restore record validation anchor missing'; END IF;
 d:=replace(d,anchor,anchor||' IF name=''core.command_receipt'' AND record_data->>''command_type''=''portability.retire_notification'' THEN RAISE EXCEPTION ''operational provider evidence cannot be imported''; END IF;');
 EXECUTE d;
END $$;