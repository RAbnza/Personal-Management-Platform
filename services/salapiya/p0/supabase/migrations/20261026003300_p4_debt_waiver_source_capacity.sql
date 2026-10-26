BEGIN;
CREATE FUNCTION salapiya_p2.p4_charge_amount(r salapiya_p2.revision) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN r.values_json->>'financeType'='borrowing' THEN salapiya_p2.php(r.values_json,'financedFee',true) ELSE r.amount_minor END $$;
CREATE FUNCTION salapiya_p2.p4_is_charge(r salapiya_p2.revision) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN r.values_json->>'financeType'='borrowing' THEN salapiya_p2.php(r.values_json,'financedFee',true)>0 ELSE r.values_json->>'financeType'='debtAdjustment' AND r.values_json->>'adjustmentKind' IN ('recognized_charge','rounding_charge') END $$;
CREATE FUNCTION salapiya_p2.p4_opening_waiver_capacity(p uuid,debt salapiya_p2.revision,excluded uuid DEFAULT NULL) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE remaining numeric:=debt.amount_minor;r salapiya_p2.revision;assigned numeric;BEGIN
 FOR r IN SELECT x.* FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND (excluded IS NULL OR x.id<>excluded) AND x.values_json->>'debt'=debt.action_id::text LOOP
  IF r.values_json->>'financeType' IN ('debtPayment','debtClassification','debtPayoff') THEN
   assigned:=0;IF r.values_json->>'debtComponentContract'='1' THEN SELECT coalesce(sum(a.amount),0) INTO assigned FROM salapiya_p2.p4_debt_allocations(r.values_json->>'reductionSources') a;END IF;
   remaining:=remaining-salapiya_p2.php(r.values_json,'reduction',true)+assigned;
   IF r.values_json->>'financeType'='debtPayoff' AND r.values_json->>'waiverBasis'='imported_unknown' THEN remaining:=remaining-salapiya_p2.php(r.values_json,'waiver',true);END IF;
  END IF;
  IF r.values_json->>'financeType'='debtAdjustment' AND r.values_json->>'adjustmentKind' IN ('recognized_waiver','rounding_waiver') AND r.values_json->>'waiverBasis'='imported_unknown' THEN remaining:=remaining-r.amount_minor;END IF;
 END LOOP;RETURN greatest(remaining,0);
END $$;
-- Financed fees have a recognized original expense and unpaid liability;
-- withheld fees already paid in cash are not a supported liability-waiver source.
DO $$DECLARE definition text;needle text;f text;BEGIN
 definition:=pg_get_functiondef('salapiya_p2.p4_charge_remaining(uuid,salapiya_p2.revision,uuid)'::regprocedure);needle:='remaining numeric:=charge.amount_minor';
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected charge capacity definition';END IF;
 EXECUTE replace(definition,needle,'remaining numeric:=salapiya_p2.p4_charge_amount(charge)');
 FOREACH f IN ARRAY ARRAY['salapiya_p2.plan(uuid,uuid,jsonb,bigint)','salapiya_p2.p4_validate_reduction(uuid,jsonb,uuid)'] LOOP
  definition:=pg_get_functiondef(f::regprocedure);needle:='ARRAY[''debtAdjustment'']';
  IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected charge source authority';END IF;
  definition:=replace(definition,needle,'ARRAY[''debtAdjustment'',''borrowing'']');
  needle:='coalesce(charge.values_json->>''adjustmentKind'','''') NOT IN (''recognized_charge'',''rounding_charge'')';
  IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected recognized charge predicate';END IF;
  definition:=replace(definition,needle,'NOT salapiya_p2.p4_is_charge(charge)');
  IF f LIKE '%plan(%' THEN
   needle:='charge.values_json->>''category''';
   IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected original expense category';END IF;
   definition:=replace(definition,needle,'CASE WHEN charge.values_json->>''financeType''=''borrowing'' THEN charge.values_json->>''feeCategory'' ELSE charge.values_json->>''category'' END');
  END IF;EXECUTE definition;
 END LOOP;
END $$;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_debt_sources;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;r jsonb;v jsonb;waiver numeric;debt salapiya_p2.revision;BEGIN
 result:=salapiya_p2.plan_p4_debt_sources(p,cid,cmd,seq);r:=result->'revision';v:=r->'values';
 IF r IS NULL OR r='null' OR r->>'change'='reverse' OR v->>'waiverBasis' IS DISTINCT FROM 'imported_unknown' THEN RETURN result;END IF;
 IF v->>'financeType'='debtPayoff' THEN waiver:=salapiya_p2.php(v,'waiver',true);
 ELSIF v->>'financeType'='debtAdjustment' AND v->>'adjustmentKind' IN ('recognized_waiver','rounding_waiver') THEN waiver:=(r->>'amount')::numeric;ELSE RETURN result;END IF;
 debt:=salapiya_p2.p4_source(p,v->>'debt',ARRAY['debtImport']);
 IF waiver>salapiya_p2.p4_opening_waiver_capacity(p,debt,(r->>'previous')::uuid) THEN RAISE EXCEPTION 'opening-basis waiver exceeds supported imported opening capacity; use recognized charge evidence' USING ERRCODE='22023';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.p4_charge_amount(salapiya_p2.revision),salapiya_p2.p4_is_charge(salapiya_p2.revision),salapiya_p2.p4_opening_waiver_capacity(uuid,salapiya_p2.revision,uuid),salapiya_p2.plan_p4_debt_sources(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
