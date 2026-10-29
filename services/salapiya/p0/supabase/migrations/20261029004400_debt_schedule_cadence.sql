BEGIN;
-- Optional descriptive cadence on a debt schedule (frequency, firstDue,
-- intervalDays, installmentAmount, splitMode). Mirrors validateDebtCadence in the native
-- planner. Explicit schedule rows remain the authority; legacy schedules
-- without cadence keys stay valid. No stored data is changed.
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_debt_cadence_base;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;r jsonb;v jsonb;freq text;first_due text;days text;amount text;split text;first_row text;n integer;BEGIN
 result:=salapiya_p2.plan_debt_cadence_base(p,cid,cmd,seq);r:=result->'revision';v:=r->'values';
 IF r IS NULL OR r='null' OR r->>'change'='reverse' OR v->>'financeType' IS DISTINCT FROM 'debtSchedule' THEN RETURN result;END IF;
 freq:=coalesce(btrim(v->>'frequency'),'');first_due:=coalesce(btrim(v->>'firstDue'),'');
 days:=coalesce(btrim(v->>'intervalDays'),'');amount:=coalesce(btrim(v->>'installmentAmount'),'');split:=coalesce(btrim(v->>'splitMode'),'');
 IF freq='' THEN
  IF first_due<>'' OR days<>'' OR amount<>'' OR split<>'' THEN RAISE EXCEPTION 'choose a payment frequency for the schedule cadence' USING ERRCODE='22023';END IF;
  RETURN result;
 END IF;
 IF freq NOT IN ('weekly','monthly','yearly','custom') THEN RAISE EXCEPTION 'unsupported schedule frequency' USING ERRCODE='22023';END IF;
 IF first_due='' THEN RAISE EXCEPTION 'first due date required' USING ERRCODE='22023';END IF;
 SELECT min(s.due) INTO first_row FROM salapiya_p2.p4_schedule(v->>'schedule') s;
 IF salapiya_p2.day(first_due) IS DISTINCT FROM first_row THEN RAISE EXCEPTION 'first due date must match the first scheduled installment' USING ERRCODE='22023';END IF;
 IF freq='custom' THEN
  IF days !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'custom interval must be whole days' USING ERRCODE='22023';END IF;
  n:=days::integer;
  IF n NOT BETWEEN 1 AND 3660 THEN RAISE EXCEPTION 'custom interval must be 1 to 3660 days' USING ERRCODE='22023';END IF;
 ELSIF days<>'' THEN RAISE EXCEPTION 'interval days apply only to a custom frequency' USING ERRCODE='22023';END IF;
 IF amount<>'' THEN PERFORM salapiya_p2.php(v,'installmentAmount');END IF;
 IF split<>'' AND split NOT IN ('equal','divide','varied') THEN RAISE EXCEPTION 'unsupported payment split' USING ERRCODE='22023';END IF;
 IF split='varied' AND amount<>'' THEN RAISE EXCEPTION 'different amounts have no single installment amount' USING ERRCODE='22023';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_debt_cadence_base(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
