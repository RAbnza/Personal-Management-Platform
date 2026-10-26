BEGIN;
-- Explicit component evidence is opt-in and versioned. Historic recipes that
-- did not declare this extension retain unknown classification on replay.
CREATE FUNCTION salapiya_p2.p4_principal_range(p uuid,debt salapiya_p2.revision,through text,excluded uuid DEFAULT NULL)
RETURNS TABLE(lower_bound numeric,upper_bound numeric) LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE initial numeric;known numeric:=0;unknown numeric:=0;r salapiya_p2.revision;principal numeric;reduction numeric;sources numeric;BEGIN
 IF debt.values_json->>'financeType'='borrowing' THEN initial:=debt.amount_minor;
 ELSIF debt.values_json->>'debtComponentContract'='1' AND coalesce(debt.values_json->>'outstandingPrincipal','')<>'' THEN initial:=salapiya_p2.php(debt.values_json,'outstandingPrincipal',true);
 ELSE RETURN;END IF;
 IF debt.effective_date>through THEN lower_bound:=0;upper_bound:=0;RETURN NEXT;RETURN;END IF;
 FOR r IN SELECT x.* FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND (excluded IS NULL OR x.id<>excluded) AND x.values_json->>'debt'=debt.action_id::text AND x.effective_date<=through LOOP
  IF r.values_json->>'financeType'='debtPayoff' THEN lower_bound:=0;upper_bound:=0;RETURN NEXT;RETURN;END IF;
  IF r.values_json->>'financeType' IN ('debtPayment','debtClassification') THEN
   reduction:=salapiya_p2.php(r.values_json,'reduction',true);principal:=0;sources:=0;
   IF r.values_json->>'debtComponentContract'='1' THEN
    IF coalesce(r.values_json->>'principalReduction','')<>'' THEN principal:=salapiya_p2.php(r.values_json,'principalReduction',true);END IF;
    SELECT coalesce(sum(a.amount),0) INTO sources FROM salapiya_p2.p4_debt_allocations(r.values_json->>'reductionSources') a;
   END IF;
   known:=known+principal;unknown:=unknown+reduction-principal-sources;
  END IF;
  IF r.values_json->>'financeType'='debtAdjustment' AND r.values_json->>'adjustmentKind' IN ('recognized_waiver','rounding_waiver') AND r.values_json->>'waiverBasis'='imported_unknown' THEN unknown:=unknown+r.amount_minor;END IF;
 END LOOP;
 lower_bound:=greatest(0,initial-known-unknown);upper_bound:=greatest(0,initial-known);RETURN NEXT;
END $$;
CREATE FUNCTION salapiya_p2.p4_charge_remaining(p uuid,charge salapiya_p2.revision,excluded uuid DEFAULT NULL) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE remaining numeric:=charge.amount_minor;r salapiya_p2.revision;principal numeric;reduction numeric;sources numeric;applied numeric;BEGIN
 FOR r IN SELECT x.* FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND (excluded IS NULL OR x.id<>excluded) AND x.values_json->>'debt'=charge.values_json->>'debt' LOOP
  IF r.values_json->>'financeType' IN ('debtPayment','debtClassification','debtPayoff') THEN
   reduction:=salapiya_p2.php(r.values_json,'reduction',true);principal:=0;sources:=0;applied:=0;
   IF r.values_json->>'debtComponentContract'='1' THEN
    IF coalesce(r.values_json->>'principalReduction','')<>'' THEN principal:=salapiya_p2.php(r.values_json,'principalReduction',true);END IF;
    SELECT coalesce(sum(a.amount),0),coalesce(sum(a.amount) FILTER(WHERE a.label=charge.id::text),0) INTO sources,applied FROM salapiya_p2.p4_debt_allocations(r.values_json->>'reductionSources') a;
   END IF;
   IF r.effective_date>=charge.effective_date AND reduction>principal+sources THEN RETURN NULL;END IF;
   remaining:=remaining-applied;
  END IF;
  IF r.values_json->>'financeType'='debtAdjustment' AND r.values_json->>'adjustmentKind' IN ('recognized_waiver','rounding_waiver') AND r.values_json->>'chargeSource'=charge.id::text THEN remaining:=remaining-r.amount_minor;END IF;
 END LOOP;RETURN remaining;
END $$;
CREATE FUNCTION salapiya_p2.p4_validate_reduction(p uuid,v jsonb,old_id uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE debt salapiya_p2.revision;charge salapiya_p2.revision;principal numeric:=0;assigned numeric;reduction numeric;capacity numeric;row record;BEGIN
 IF v->>'debtComponentContract' IS DISTINCT FROM '1' OR (coalesce(v->>'principalReduction','')='' AND coalesce(v->>'reductionSources','')='') THEN RETURN;END IF;
 debt:=salapiya_p2.p4_source(p,v->>'debt',ARRAY['debtImport','borrowing']);
 IF coalesce(v->>'principalReduction','')<>'' THEN principal:=salapiya_p2.php(v,'principalReduction',true);END IF;
 reduction:=salapiya_p2.php(v,'reduction',true);SELECT coalesce(sum(a.amount),0) INTO assigned FROM salapiya_p2.p4_debt_allocations(v->>'reductionSources') a;
 IF principal+assigned<>reduction THEN RAISE EXCEPTION 'explicit reduction components must equal liability reduction' USING ERRCODE='22023';END IF;
 SELECT r.lower_bound INTO capacity FROM salapiya_p2.p4_principal_range(p,debt,'9999-12-31',old_id) r;
 IF principal>0 AND (capacity IS NULL OR principal>capacity) THEN RAISE EXCEPTION 'principal reduction lacks independently supported capacity' USING ERRCODE='22023';END IF;
 FOR row IN SELECT * FROM salapiya_p2.p4_debt_allocations(v->>'reductionSources') LOOP
  charge:=salapiya_p2.p4_source(p,row.label,ARRAY['debtAdjustment']);capacity:=salapiya_p2.p4_charge_remaining(p,charge,old_id);
  IF charge.values_json->>'debt'<>debt.action_id::text OR charge.effective_date>v->>'date' OR coalesce(charge.values_json->>'adjustmentKind','') NOT IN ('recognized_charge','rounding_charge') OR capacity IS NULL OR row.amount>capacity THEN RAISE EXCEPTION 'recognized charge reduction exceeds source capacity' USING ERRCODE='22023';END IF;
 END LOOP;
END $$;
CREATE FUNCTION salapiya_p2.p4_check_debt_projection(p uuid,r jsonb,reversing boolean) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v jsonb:=r->'values';debt text:=v->>'debt';old_id uuid:=(r->>'previous')::uuid;day record;liability numeric:=0;clearing numeric:=0;closed boolean;BEGIN
 IF debt IS NULL OR (v->>'financeType' IS DISTINCT FROM 'debtAdjustment' AND v->>'debtComponentContract' IS DISTINCT FROM '1' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.values_json->>'debt'=debt AND (x.values_json->>'debtComponentContract'='1' OR x.values_json->>'financeType'='debtAdjustment'))) THEN RETURN;END IF;
 FOR day IN SELECT date,sum(amount) FILTER(WHERE ledger='debt_liability') AS liability,sum(amount) FILTER(WHERE ledger='debt_clearing') AS clearing FROM (
  SELECT q.effective_date AS date,q.ledger,q.amount_minor::numeric AS amount FROM salapiya_p2.current_revision x JOIN salapiya_p2.posting q ON q.revision_id=x.id WHERE x.profile_id=p AND (old_id IS NULL OR x.id<>old_id) AND x.values_json->>'debt'=debt AND q.ledger IN ('debt_liability','debt_clearing')
  UNION ALL SELECT a->>'date',a->>'ledger',(a->>'amount')::numeric FROM jsonb_array_elements(r->'postings') a WHERE a->>'ledger' IN ('debt_liability','debt_clearing')) all_posts GROUP BY date ORDER BY date LOOP
  liability:=liability+coalesce(day.liability,0);clearing:=clearing+coalesce(day.clearing,0);
  IF liability>0 OR clearing<0 THEN RAISE EXCEPTION 'debt projection over-reduces recognized liability or clearing at an economic date' USING ERRCODE='22023';END IF;
 END LOOP;
 closed:=(v->>'financeType'='debtPayoff' AND NOT reversing) OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND (old_id IS NULL OR x.id<>old_id) AND x.values_json->>'financeType'='debtPayoff' AND x.values_json->>'debt'=debt);
 IF closed AND (liability<>0 OR clearing<>0) THEN RAISE EXCEPTION 'retained payoff must remain exactly reconciled' USING ERRCODE='22023';END IF;
END $$;
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_files;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';op text:=cmd->>'kind';old salapiya_p2.revision;debt salapiya_p2.revision;charge salapiya_p2.revision;result jsonb;r jsonb;posts jsonb:='[]';d text;total numeric;liability numeric;capacity numeric;source uuid;BEGIN
 IF op IN ('financeCorrection','financeReversal') THEN SELECT * INTO old FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.id::text=v->>'replace';END IF;
 IF op='debtAdjustment' OR old.values_json->>'financeType'='debtAdjustment' THEN
  PERFORM salapiya_p2.p4_command(p,cmd);
  IF old.id IS NOT NULL THEN
   IF old.revision_no::text IS DISTINCT FROM v->>'replaceVersion' THEN RAISE EXCEPTION 'source version changed' USING ERRCODE='22023';END IF;PERFORM salapiya_p2.required(v,'reason');
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND x.id<>old.id AND coalesce(x.values_json->>'financeType','')<>'financialFile' AND (x.source_id=old.id OR x.values_json->>'chargeSource'=old.id::text OR (x.values_json->>'debtComponentContract'='1' AND EXISTS(SELECT 1 FROM salapiya_p2.p4_debt_allocations(x.values_json->>'reductionSources') a WHERE a.label=old.id::text)))) THEN RAISE EXCEPTION 'resolve dependent charge evidence first' USING ERRCODE='22023';END IF;
   v:=old.values_json||v;
  END IF;
  v:=v||jsonb_build_object('financeType','debtAdjustment','financeContract','1');d:=salapiya_p2.day(v->>'date');
  IF op='financeReversal' THEN result:=salapiya_p2.p4_finish(p,cid,v,'debtAdjustment',old,'adjustment','[]',old.amount_minor,old.source_id,true);
  ELSE
   debt:=salapiya_p2.p4_source(p,v->>'debt',ARRAY['debtImport','borrowing']);v:=v||jsonb_build_object('debt',debt.action_id::text);source:=debt.id;
   IF d<debt.effective_date OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision x WHERE x.profile_id=p AND (old.id IS NULL OR x.id<>old.id) AND x.values_json->>'financeType'='debtPayoff' AND x.values_json->>'debt'=debt.action_id::text) THEN RAISE EXCEPTION 'debt closed or before opening' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount');PERFORM salapiya_p2.required(v,'reason');PERFORM salapiya_p2.required(v,'reference');IF v->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'provider adjustment confirmation required' USING ERRCODE='22023';END IF;
   IF v->>'adjustmentKind' IN ('recognized_charge','rounding_charge') THEN
    IF coalesce(v->>'chargeType','') NOT IN ('interest','fee','penalty') THEN RAISE EXCEPTION 'recognized charge classification required' USING ERRCODE='22023';END IF;
    posts:=jsonb_build_array(salapiya_p2.post('debt_liability',-total,d),salapiya_p2.post('expense',total,d,NULL,v->>'category'));
   ELSIF v->>'adjustmentKind' IN ('recognized_waiver','rounding_waiver') THEN
    SELECT -coalesce(sum(q.amount_minor::numeric),0) INTO liability FROM salapiya_p2.current_revision x JOIN salapiya_p2.posting q ON q.revision_id=x.id WHERE x.profile_id=p AND (old.id IS NULL OR x.id<>old.id) AND x.values_json->>'debt'=debt.action_id::text AND q.ledger='debt_liability';
    IF total>liability THEN RAISE EXCEPTION 'waiver exceeds recognized liability' USING ERRCODE='22023';END IF;
    IF v->>'waiverBasis'='imported_unknown' AND debt.values_json->>'financeType'='debtImport' THEN posts:=jsonb_build_array(salapiya_p2.post('equity',-total,d));
    ELSIF v->>'waiverBasis'='recognized_charge' THEN
     charge:=salapiya_p2.p4_source(p,v->>'chargeSource',ARRAY['debtAdjustment']);capacity:=salapiya_p2.p4_charge_remaining(p,charge,old.id);
     IF charge.values_json->>'debt'<>debt.action_id::text OR charge.effective_date>d OR coalesce(charge.values_json->>'adjustmentKind','') NOT IN ('recognized_charge','rounding_charge') OR capacity IS NULL OR total>capacity THEN RAISE EXCEPTION 'waiver requires supported unpaid original charge' USING ERRCODE='22023';END IF;
     posts:=jsonb_build_array(salapiya_p2.post('expense',-total,d,NULL,charge.values_json->>'category'));source:=charge.id;
    ELSE RAISE EXCEPTION 'supported original waiver basis required' USING ERRCODE='22023';END IF;
    posts:=posts||jsonb_build_array(salapiya_p2.post('debt_liability',total,d));
   ELSIF v->>'adjustmentKind'<>'avoided_future' OR v->>'adjustmentKind' IS NULL THEN RAISE EXCEPTION 'explicit adjustment treatment required' USING ERRCODE='22023';END IF;
   result:=salapiya_p2.p4_finish(p,cid,v,'debtAdjustment',old,'adjustment',posts,total,source);
  END IF;
 ELSE result:=salapiya_p2.plan_p4_files(p,cid,cmd,seq);END IF;
 r:=result->'revision';IF r IS NULL OR r='null' THEN RETURN result;END IF;v:=r->'values';
 IF v->>'debtComponentContract' IS NOT NULL AND v->>'debtComponentContract'<>'1' THEN RAISE EXCEPTION 'unsupported debt component contract' USING ERRCODE='22023';END IF;
 IF v->>'financeType'='debtImport' AND v->>'debtComponentContract'='1' AND coalesce(v->>'outstandingPrincipal','')<>'' AND salapiya_p2.php(v,'outstandingPrincipal',true)>(r->>'amount')::numeric THEN RAISE EXCEPTION 'outstanding principal exceeds recognized imported liability' USING ERRCODE='22023';END IF;
 IF v->>'financeType' IN ('debtPayment','debtClassification','debtPayoff') AND r->>'change'<>'reverse' THEN PERFORM salapiya_p2.p4_validate_reduction(p,v,(r->>'previous')::uuid);END IF;
 PERFORM salapiya_p2.p4_check_debt_projection(p,r,r->>'change'='reverse');RETURN result;
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.p4_principal_range(uuid,salapiya_p2.revision,text,uuid),salapiya_p2.p4_charge_remaining(uuid,salapiya_p2.revision,uuid),salapiya_p2.p4_validate_reduction(uuid,jsonb,uuid),salapiya_p2.p4_check_debt_projection(uuid,jsonb,boolean),salapiya_p2.plan_p4_files(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
