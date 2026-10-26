BEGIN;
DO $$DECLARE definition text;needle text:='''cardInterest'')';BEGIN
 definition:=pg_get_functiondef('salapiya_p2.submit(uuid,uuid,jsonb,text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected card command freshness policy';END IF;
 EXECUTE replace(definition,needle,'''cardInterest'',''debtImport'',''borrowing'',''debtPayment'')');
END $$;
COMMIT;
