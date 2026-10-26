BEGIN;
-- Preserve applied card authority; correct remaining capacity using the original
-- recognized purchase funding and explicit historical installment evidence.
DO $$DECLARE definition text;needle text;BEGIN
 definition:=pg_get_functiondef('salapiya_p2.plan_p4_cards(uuid,uuid,jsonb,bigint)'::regprocedure);
 needle:='salapiya_p2.php(v,''principal'',true)>purchase.amount_minor';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected installment principal authority';END IF;
 definition:=replace(definition,needle,'salapiya_p2.php(v,''principal'',true)>-(SELECT coalesce(sum(q.amount_minor),0) FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.revision_id=purchase.id AND q.ledger=''card_liability'')');
 needle:='SELECT r.amount INTO available FROM salapiya_p2.p4_schedule(plan.values_json->>''schedule'') r WHERE r.label=v->>''row'';';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected installment remaining authority';END IF;
 EXECUTE replace(definition,needle,'SELECT r.amount-r.paid INTO available FROM salapiya_p2.p4_schedule(plan.values_json->>''schedule'') r WHERE r.label=v->>''row'';');
END $$;
COMMIT;
