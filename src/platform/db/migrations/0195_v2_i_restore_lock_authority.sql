/* A rejected uploaded bundle may contain arbitrary external group IDs. It
 * must not acquire a foreign group's mutex before restore preflight rejects it.
 * Historical visible groups retain the existing group-before-workspace order. */
DO $$ DECLARE d text;anchor text:=' ORDER BY g.id FOR UPDATE;';BEGIN
 d:=pg_get_functiondef('ops.lock_shared_restore_groups(uuid)'::regprocedure);
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'shared restore lock scope anchor missing';END IF;
 EXECUTE replace(d,anchor,' AND sharing.visible(g.id)'||anchor);
END $$;
