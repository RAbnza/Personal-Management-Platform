BEGIN;
CREATE FUNCTION salapiya_p2.p4_day(input text,exclusive boolean DEFAULT false) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 PERFORM salapiya_p2.day(input);
 IF input>(CASE WHEN exclusive THEN '2200-01-01' ELSE '2199-12-31' END) THEN RAISE EXCEPTION 'planning date outside supported range' USING ERRCODE='22023';END IF;RETURN input;
END $$;
CREATE FUNCTION salapiya_p2.p4_reserved(p uuid,goal text DEFAULT NULL,account text DEFAULT NULL,excluded uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(CASE WHEN r.values_json->>'financeType'='reservation' AND (goal IS NULL OR r.values_json->>'goal'=goal) AND (account IS NULL OR r.values_json->>'account'=account) THEN (r.values_json->>'delta')::numeric ELSE 0 END
 +CASE WHEN r.values_json->>'financeType'='savingsReallocation' AND (goal IS NULL OR r.values_json->>'goal'=goal) AND (account IS NULL OR r.values_json->>'account'=account) THEN r.amount_minor ELSE 0 END
 -CASE WHEN r.values_json->>'financeType'='savingsReallocation' AND (goal IS NULL OR r.values_json->>'fromGoal'=goal) AND (account IS NULL OR r.values_json->>'fromAccount'=account) THEN r.amount_minor ELSE 0 END),0)
 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (excluded IS NULL OR r.id<>excluded) $$;
CREATE FUNCTION salapiya_p2.p4_dates(v jsonb,window_start text,window_end text) RETURNS TABLE(day text)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE anchor date;last_day date;cursor date;frequency text:=v->>'frequency';step int;weekdays int[];requested int;month_policy text:=v->>'monthPolicy';end_rule text;count_limit int;emitted int:=0;work int:=0;match boolean;BEGIN
 PERFORM salapiya_p2.p4_day(window_start);PERFORM salapiya_p2.p4_day(window_end);
 anchor:=salapiya_p2.p4_day(v->>'start')::date;last_day:=window_end::date;
 IF last_day<window_start::date OR last_day-window_start::date>365 THEN RAISE EXCEPTION 'generation window outside contract' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=v->>'timezone') THEN RAISE EXCEPTION 'unsupported named timezone' USING ERRCODE='22023';END IF;
 IF coalesce(v->>'interval','') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'invalid recurrence interval' USING ERRCODE='22023';END IF;step:=(v->>'interval')::int;
 IF frequency IS NULL OR frequency NOT IN ('daily','weekly','monthly') OR step>(CASE WHEN frequency='daily' THEN 365 WHEN frequency='weekly' THEN 52 ELSE 120 END) THEN RAISE EXCEPTION 'unsupported recurrence interval' USING ERRCODE='22023';END IF;
 IF frequency='weekly' THEN
  IF coalesce(v->>'weekdays','') !~ '^[1-7](,[1-7]){0,6}$' THEN RAISE EXCEPTION 'invalid selected weekdays' USING ERRCODE='22023';END IF;
  weekdays:=string_to_array(v->>'weekdays',',')::int[];
  IF cardinality(weekdays)<>(SELECT count(DISTINCT d) FROM unnest(weekdays) d) THEN RAISE EXCEPTION 'duplicate weekday' USING ERRCODE='22023';END IF;
 END IF;
 IF frequency='monthly' THEN
  IF coalesce(v->>'monthDay','') !~ '^([1-9]|[12][0-9]|3[01])$' OR month_policy IS NULL OR month_policy NOT IN ('last_valid_day','skip') THEN RAISE EXCEPTION 'invalid month-end policy' USING ERRCODE='22023';END IF;requested:=(v->>'monthDay')::int;
 END IF;
 IF coalesce(v->>'end','')<>'' THEN end_rule:=salapiya_p2.p4_day(v->>'end');IF end_rule<v->>'start' THEN RAISE EXCEPTION 'end before rule start' USING ERRCODE='22023';END IF;END IF;
 IF coalesce(v->>'count','')<>'' THEN
  IF v->>'count' !~ '^[1-9][0-9]{0,4}$' OR (v->>'count')::int>10000 THEN RAISE EXCEPTION 'invalid emitted count' USING ERRCODE='22023';END IF;count_limit:=(v->>'count')::int;
 END IF;
 cursor:=anchor;
 WHILE cursor<=last_day LOOP
  work:=work+1;IF work>100000 THEN RAISE EXCEPTION 'calendar work bound exceeded' USING ERRCODE='22023';END IF;
  day:=to_char(cursor,'YYYY-MM-DD');IF end_rule IS NOT NULL AND day>end_rule THEN EXIT;END IF;match:=false;
  IF frequency='daily' THEN match:=(cursor-anchor)%step=0;
  ELSIF frequency='weekly' THEN match:=((cursor-(anchor-(extract(isodow FROM anchor)::int-1)))/7)%step=0 AND extract(isodow FROM cursor)::int=ANY(weekdays);
  ELSE match:=((extract(year FROM cursor)::int-extract(year FROM anchor)::int)*12+extract(month FROM cursor)::int-extract(month FROM anchor)::int)%step=0
   AND extract(day FROM cursor)::int=CASE WHEN month_policy='last_valid_day' THEN least(requested,extract(day FROM date_trunc('month',cursor)+interval '1 month - 1 day')::int) ELSE requested END;
  END IF;
  IF match THEN emitted:=emitted+1;IF count_limit IS NOT NULL AND emitted>count_limit THEN EXIT;END IF;IF day>=window_start THEN RETURN NEXT;END IF;END IF;
  cursor:=cursor+1;
 END LOOP;
END $$;
CREATE FUNCTION salapiya_p2.p4_occurrence(rule salapiya_p2.revision,logical text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE d text:=encode(sha256(convert_to('salapiya-recurring-1:'||rule.action_id::text||':'||rule.revision_no::text||':'||logical,'UTF8')),'hex');BEGIN
 RETURN substring(d,1,8)||'-'||substring(d,9,4)||'-5'||substring(d,14,3)||'-a'||substring(d,18,3)||'-'||substring(d,21,12);
END $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_debts;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';op text:=cmd->>'kind';old salapiya_p2.revision;goal salapiya_p2.revision;origin salapiya_p2.revision;rule salapiya_p2.revision;actual salapiya_p2.revision;link salapiya_p2.revision;overridden salapiya_p2.revision;
 d text;start_day text;end_day text;asof_day text;total numeric:=0;source uuid;account salapiya_p2.account;from_account salapiya_p2.account;
 current_reserved numeric;all_reserved numeric;increase numeric;capacity numeric;dates_text text;logical text;occurrence text;linked numeric;expected numeric;used numeric;
 kinds text[]:=ARRAY['budget','savingsGoal','reservation','savingsReallocation','recurrence','recurrenceGenerate','occurrenceOverride','recurrenceLink','recurrenceUnlink'];
BEGIN
 IF op IN ('financeCorrection','financeReversal') THEN SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'replace';END IF;
 IF NOT(op=ANY(kinds)) AND NOT(coalesce(old.values_json->>'financeType','')=ANY(kinds)) THEN RETURN salapiya_p2.plan_p4_debts(p,cid,cmd,seq);END IF;
 PERFORM salapiya_p2.p4_command(p,cmd);
 IF old.id IS NOT NULL THEN
  IF old.revision_no::text IS DISTINCT FROM v->>'replaceVersion' OR op='financeReversal' OR old.values_json->>'financeType' NOT IN ('budget','savingsGoal','recurrence') THEN RAISE EXCEPTION 'use explicit planning lifecycle or link reversal' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p2.required(v,'reason');op:=old.values_json->>'financeType';v:=old.values_json||v;
 END IF;
 v:=v||jsonb_build_object('financeType',op,'financeContract','1');d:=salapiya_p2.day(v->>'date');
 CASE op
 WHEN 'budget' THEN
  IF NOT EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND c.id=v->>'category' AND c.kind='expense') THEN RAISE EXCEPTION 'budget category unavailable' USING ERRCODE='22023';END IF;
  total:=salapiya_p2.php(v,'amount',true,false,true);start_day:=salapiya_p2.p4_day(v->>'start');end_day:=salapiya_p2.p4_day(v->>'endExclusive',true);
  IF end_day::date-start_day::date NOT BETWEEN 1 AND 366 OR coalesce(v->>'basis','') NOT IN ('net','gross') OR coalesce(v->>'status','') NOT IN ('active','archived') THEN RAISE EXCEPTION 'invalid budget period or basis' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'=op AND r.values_json->>'category'=v->>'category' AND r.values_json->>'start'<end_day AND start_day<r.values_json->>'endExclusive') THEN RAISE EXCEPTION 'overlapping owned category budget including archived' USING ERRCODE='22023';END IF;
 WHEN 'savingsGoal' THEN
  total:=salapiya_p2.php(v,'amount',false,false,true);IF coalesce(v->>'targetDate','')<>'' THEN PERFORM salapiya_p2.p4_day(v->>'targetDate');END IF;
  IF coalesce(v->>'status','') NOT IN ('active','completed','archived') OR (v->>'status'='archived' AND salapiya_p2.p4_reserved(p,coalesce(old.action_id,cid)::text)<>0) THEN RAISE EXCEPTION 'release reservations before archive' USING ERRCODE='22023';END IF;
 WHEN 'reservation','savingsReallocation' THEN
  goal:=salapiya_p2.p4_source(p,v->>'goal',ARRAY['savingsGoal']);v:=v||jsonb_build_object('goal',goal.action_id::text);
  SELECT * INTO account FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id::text=v->>'account';IF account.id IS NULL THEN RAISE EXCEPTION 'owned cash account required' USING ERRCODE='22023';END IF;
  total:=salapiya_p2.php(v,'amount',op='reservation',false,true);current_reserved:=salapiya_p2.p4_reserved(p,goal.action_id::text,account.id::text);all_reserved:=salapiya_p2.p4_reserved(p,NULL,account.id::text);
  IF op='reservation' THEN increase:=total-current_reserved;v:=v||jsonb_build_object('delta',increase::text);
  ELSE
   origin:=salapiya_p2.p4_source(p,v->>'fromGoal',ARRAY['savingsGoal']);v:=v||jsonb_build_object('fromGoal',origin.action_id::text);
   SELECT * INTO from_account FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id::text=v->>'fromAccount';
   IF from_account.id IS NULL OR (origin.action_id=goal.action_id AND from_account.id=account.id) OR total>salapiya_p2.p4_reserved(p,origin.action_id::text,from_account.id::text) THEN RAISE EXCEPTION 'insufficient distinct source reservation' USING ERRCODE='22023';END IF;
   increase:=CASE WHEN from_account.id=account.id THEN 0 ELSE total END;
  END IF;
  IF (op='reservation' AND total>current_reserved) OR op='savingsReallocation' THEN
   capacity:=greatest(salapiya_p2.balance(p,account.id,d),0);
   IF goal.values_json->>'status'<>'active' OR account.archived OR account.cutoff>d OR all_reserved+increase>capacity THEN RAISE EXCEPTION 'reservation exceeds eligible actual cash' USING ERRCODE='22023';END IF;
  END IF;
 WHEN 'recurrence' THEN
  total:=salapiya_p2.php(v,'amount');IF coalesce(v->>'recurringKind','') NOT IN ('income','bill','subscription') OR coalesce(v->>'status','') NOT IN ('active','archived') THEN RAISE EXCEPTION 'invalid recurring kind/lifecycle' USING ERRCODE='22023';END IF;
  start_day:=salapiya_p2.p4_day(v->>'start');PERFORM * FROM salapiya_p2.p4_dates(v,start_day,start_day);
  IF coalesce(v->>'account','')<>'' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id::text=v->>'account') THEN RAISE EXCEPTION 'recurring account unavailable' USING ERRCODE='22023';END IF;
  IF coalesce(v->>'category','')<>'' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND c.id=v->>'category' AND c.kind=CASE WHEN v->>'recurringKind'='income' THEN 'income' ELSE 'expense' END) THEN RAISE EXCEPTION 'recurring category unavailable' USING ERRCODE='22023';END IF;
  IF old.id IS NOT NULL AND start_day<=to_char(clock_timestamp() AT TIME ZONE (v->>'timezone'),'YYYY-MM-DD') AND v->>'status'<>'archived' THEN RAISE EXCEPTION 'rule replacement requires future boundary' USING ERRCODE='22023';END IF;
 WHEN 'recurrenceUnlink' THEN
  link:=salapiya_p2.p4_source(p,v->>'link',ARRAY['recurrenceLink']);PERFORM salapiya_p2.required(v,'reason');
  RETURN salapiya_p2.p4_finish(p,cid,v,op,link,link.kind,'[]',link.amount_minor,link.source_id,true);
 ELSE
  SELECT * INTO rule FROM salapiya_p2.revision r WHERE r.profile_id=p AND r.id::text=v->>'rule' AND r.values_json->>'financeType'='recurrence';
  IF rule.id IS NULL THEN RAISE EXCEPTION 'owned immutable recurrence required' USING ERRCODE='22023';END IF;
  IF op='recurrenceGenerate' THEN
   IF NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.id=rule.id) OR rule.values_json->>'status'<>'active' THEN RAISE EXCEPTION 'generate current active rule only' USING ERRCODE='22023';END IF;
   SELECT '['||coalesce(string_agg(to_json(r.day)::text,',' ORDER BY r.day),'')||']' INTO dates_text FROM salapiya_p2.p4_dates(rule.values_json,v->>'from',v->>'through') r;
   IF jsonb_array_length(dates_text::jsonb)>500 THEN RAISE EXCEPTION 'generation exceeds 500 dates' USING ERRCODE='22023';END IF;v:=v||jsonb_build_object('dates',dates_text);source:=rule.id;
  ELSE
   logical:=salapiya_p2.p4_day(v->>'logicalDate');
   IF NOT EXISTS(SELECT 1 FROM salapiya_p2.p4_dates(rule.values_json,logical,logical) r WHERE r.day=logical) OR NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.values_json->>'financeType'='recurrenceGenerate' AND r.values_json->>'rule'=rule.id::text AND (r.values_json->>'dates')::jsonb ? logical) THEN RAISE EXCEPTION 'generate logical occurrence first' USING ERRCODE='22023';END IF;
   occurrence:=salapiya_p2.p4_occurrence(rule,logical);v:=v||jsonb_build_object('occurrence',occurrence);
   SELECT r.* INTO overridden FROM salapiya_p2.current_revision r JOIN public.p2_command command ON command.id=r.id WHERE r.profile_id=p AND r.values_json->>'financeType'='occurrenceOverride' AND r.values_json->>'occurrence'=occurrence ORDER BY command.sequence_no DESC LIMIT 1;
   SELECT coalesce(sum(r.amount_minor),0) INTO linked FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.values_json->>'financeType'='recurrenceLink' AND r.values_json->>'occurrence'=occurrence;
   expected:=coalesce(overridden.amount_minor,rule.amount_minor);
   IF coalesce(overridden.values_json->>'state','planned') IN ('skipped','cancelled') THEN RAISE EXCEPTION 'terminal occurrence history retained' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount');
   IF op='occurrenceOverride' THEN
    PERFORM salapiya_p2.p4_day(v->>'due');IF coalesce(v->>'state','') NOT IN ('planned','skipped','cancelled') OR total<linked OR (v->>'state'<>'planned' AND linked<>0) THEN RAISE EXCEPTION 'resolve effective actual links first' USING ERRCODE='22023';END IF;
    PERFORM salapiya_p2.required(v,'reason');source:=coalesce(overridden.id,rule.id);
   ELSIF op='recurrenceLink' THEN
    SELECT * INTO actual FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'actual';
    IF actual.id IS NULL OR (rule.values_json->>'recurringKind'='income' AND actual.kind<>'income') OR (rule.values_json->>'recurringKind'<>'income' AND coalesce(actual.values_json->>'financeType',actual.kind) NOT IN ('expense','cardPurchase')) THEN RAISE EXCEPTION 'eligible current actual income/purchase required' USING ERRCODE='22023';END IF;
    SELECT coalesce(sum(r.amount_minor),0) INTO used FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.values_json->>'financeType'=op AND r.values_json->>'actual'=actual.id::text;
    IF total+linked>expected OR total+used>actual.amount_minor THEN RAISE EXCEPTION 'actual link exceeds remaining capacity' USING ERRCODE='22023';END IF;source:=actual.id;
   ELSE RAISE EXCEPTION 'unsupported recurring command' USING ERRCODE='22023';END IF;
  END IF;
 END CASE;
 RETURN salapiya_p2.p4_finish(p,cid,v,op,old,'adjustment','[]',total,source);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint),salapiya_p2.plan_p4_debts(uuid,uuid,jsonb,bigint),salapiya_p2.p4_day(text,boolean),salapiya_p2.p4_reserved(uuid,text,text,uuid),salapiya_p2.p4_dates(jsonb,text,text),salapiya_p2.p4_occurrence(salapiya_p2.revision,text) FROM PUBLIC,anon,authenticated;
COMMIT;
