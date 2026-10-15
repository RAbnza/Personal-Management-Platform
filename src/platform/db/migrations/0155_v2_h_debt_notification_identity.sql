DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('ops.preserve_notification_effects()'::regprocedure);
 IF strpos(d,'''debt_obligation''')=0 THEN RAISE EXCEPTION 'notification debt source anchor missing'; END IF;
 EXECUTE replace(d,'''debt_obligation''','''debt_installment''');
END $$;