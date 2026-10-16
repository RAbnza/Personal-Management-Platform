DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('finance.guard_private_group_link()'::regprocedure);
 IF strpos(d,'sharing.settlement old JOIN')=0 THEN RAISE EXCEPTION 'closed settlement alias anchor missing'; END IF;
 d:=replace(d,'sharing.settlement old JOIN','sharing.settlement prior_settlement JOIN');
 EXECUTE replace(d,'old.','prior_settlement.');
END $$;
