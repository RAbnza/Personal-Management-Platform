DO $$ DECLARE d text; anchor text := 'IF EXISTS(SELECT 1 FROM files.private_attachment WHERE status<>''deleted'') OR EXISTS(SELECT 1 FROM time.notification_delivery WHERE status=''attempted'')'; BEGIN
 d:=pg_get_functiondef('ops.apply_private_restore(uuid,bytea,uuid)'::regprocedure);
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'restore preflight scope anchor missing'; END IF;
 d:=replace(d,anchor,'IF EXISTS(SELECT 1 FROM files.private_attachment WHERE workspace_id=scope_id AND status<>''deleted'') OR EXISTS(SELECT 1 FROM time.notification_delivery WHERE workspace_id=scope_id AND status=''attempted'')');
 EXECUTE d;
END $$;