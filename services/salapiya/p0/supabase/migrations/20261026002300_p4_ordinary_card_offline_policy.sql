BEGIN;
DO $$DECLARE definition text;needle text:='(''account'',''category'',''income'',''expense'',''transfer'')';BEGIN
 definition:=pg_get_functiondef('salapiya_p2.submit(uuid,uuid,jsonb,text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected original command freshness policy';END IF;
 EXECUTE replace(definition,needle,'(''account'',''category'',''income'',''expense'',''transfer'',''creditCard'',''cardAuthorization'',''cardPurchase'',''cardPayment'',''cardFee'',''cardInterest'')');
END $$;
COMMIT;
