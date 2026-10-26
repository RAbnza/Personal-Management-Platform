BEGIN;
CREATE FUNCTION salapiya_p2.p4_command(p uuid,cmd jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';BEGIN
 IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR cmd-ARRAY['contract','authority','owner','expectedVersion','kind','values']<>'{}'::jsonb
 OR NOT(cmd ?& ARRAY['contract','authority','owner','expectedVersion','kind','values']) OR cmd->'contract' IS DISTINCT FROM '1'::jsonb
 OR cmd->>'authority' IS DISTINCT FROM 'local' OR cmd->>'owner' IS DISTINCT FROM p::text OR jsonb_typeof(cmd->'expectedVersion') IS DISTINCT FROM 'number'
 OR (cmd->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,14})$' OR jsonb_typeof(v) IS DISTINCT FROM 'object'
 OR (SELECT count(*) FROM jsonb_each(v))>512 OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>20000)
 THEN RAISE EXCEPTION 'invalid financial contract' USING ERRCODE='22023';END IF;
END $$;
CREATE FUNCTION salapiya_p2.p4_finish(p uuid,cid uuid,v jsonb,op text,old salapiya_p2.revision,kind text,posts jsonb,total numeric,source uuid,reverse boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb;d text:=salapiya_p2.day(v->>'date');title text:=salapiya_p2.required(v,'name');aid uuid;day record;running numeric;BEGIN
 IF reverse THEN d:=old.effective_date;title:='Reversal · '||old.title;kind:=old.kind;total:=old.amount_minor;source:=old.source_id;posts:='[]';END IF;
 SELECT coalesce(jsonb_agg(e),'[]') INTO posts FROM jsonb_array_elements(posts) e WHERE (e->>'amount')::numeric<>0;
 FOR x IN SELECT value FROM jsonb_array_elements(posts) LOOP
  IF abs((x->>'amount')::numeric)>100000000000 THEN RAISE EXCEPTION 'component outside range' USING ERRCODE='22023';END IF;
  IF x->>'ledger'='expense' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.category k WHERE k.profile_id=p AND k.id=x->>'category' AND k.kind='expense') THEN RAISE EXCEPTION 'expense category unavailable' USING ERRCODE='22023';END IF;
  IF x->>'ledger'='cash' THEN
   aid:=(x->>'account')::uuid;
   IF NOT EXISTS(SELECT 1 FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id=aid AND NOT a.archived AND a.cutoff<d) THEN RAISE EXCEPTION 'account unavailable, archived or before cutoff' USING ERRCODE='22023';END IF;
   FOR day IN SELECT DISTINCT effective_date FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.account_id=aid AND q.effective_date>=d UNION SELECT d LOOP
    SELECT salapiya_p2.balance(p,aid,day.effective_date,old.id)+coalesce(sum((j->>'amount')::numeric),0) INTO running FROM jsonb_array_elements(posts) j WHERE j->>'account'=aid::text;
    IF running<0 AND v->>'acknowledge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'negative balance requires acknowledgement' USING ERRCODE='22023';END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF (SELECT coalesce(sum((j->>'amount')::numeric),0) FROM jsonb_array_elements(posts) j)<>0 THEN RAISE EXCEPTION 'unbalanced financial evidence' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('account',NULL,'category',NULL,'archiveId',NULL,'revision',jsonb_build_object('id',cid::text,'actionId',coalesce(old.action_id,cid)::text,
 'kind',kind,'change',CASE WHEN reverse THEN 'reverse' WHEN old.id IS NULL THEN 'create' ELSE 'replace' END,'date',d,'title',title,'amount',total::text,
 'number',coalesce(old.revision_no,0)+1,'previous',old.id::text,'source',source::text,'values',v,'postings',posts));
END $$;
CREATE FUNCTION salapiya_p2.p4_debt_allocations(input text) RETURNS TABLE(label text,amount numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE line text;lines text[];cells text[];seen text[]:='{}';BEGIN
 IF btrim(coalesce(input,''))='' THEN RETURN;END IF;lines:=string_to_array(btrim(input),E'\n');
 IF cardinality(lines)>120 THEN RAISE EXCEPTION 'allocation bound exceeded' USING ERRCODE='22023';END IF;
 FOREACH line IN ARRAY lines LOOP cells:=string_to_array(line,',');
 IF cardinality(cells)<>2 OR length(btrim(cells[1]))=0 OR btrim(cells[1])=ANY(seen) THEN RAISE EXCEPTION 'invalid due allocation' USING ERRCODE='22023';END IF;
 label:=btrim(cells[1]);seen:=array_append(seen,label);amount:=salapiya_p2.php(jsonb_build_object('amount',btrim(cells[2])),'amount');RETURN NEXT;END LOOP;
END $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p4_shared_card;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';op text:=cmd->>'kind';old salapiya_p2.revision;debt salapiya_p2.revision;payment salapiya_p2.revision;schedule salapiya_p2.revision;
 posts jsonb:='[]';d text;total numeric:=0;source uuid;kind text:='adjustment';reverse boolean:=false;
 liability numeric;clearing numeric;reduction numeric;interest numeric;fee numeric;external numeric;unresolved numeric;withheld numeric;financed numeric;waiver numeric;contractual numeric;unapplied numeric;allocated numeric;available numeric;used numeric;row record;
BEGIN
 IF op IN ('financeCorrection','financeReversal') THEN SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'replace';END IF;
 IF op NOT IN ('debtImport','borrowing','debtPayment','debtClassification','debtSchedule','debtPayoff') AND coalesce(old.values_json->>'financeType','') NOT IN ('debtImport','borrowing','debtPayment','debtClassification','debtSchedule','debtPayoff')
 THEN RETURN salapiya_p2.plan_p4_shared_card(p,cid,cmd,seq);END IF;
 PERFORM salapiya_p2.p4_command(p,cmd);
 IF old.id IS NOT NULL THEN
  IF old.revision_no::text IS DISTINCT FROM v->>'replaceVersion' THEN RAISE EXCEPTION 'source version changed or unavailable' USING ERRCODE='22023';END IF;PERFORM salapiya_p2.required(v,'reason');
  IF NOT(op='financeCorrection' AND old.values_json->>'financeType'='debtSchedule') AND EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id<>old.id AND
   (r.source_id=old.id OR r.values_json->>'payment'=old.id::text OR r.values_json->>'scheduleSource'=old.id::text OR (old.values_json->>'financeType' IN ('debtImport','borrowing') AND r.values_json->>'debt'=old.action_id::text)))
  THEN RAISE EXCEPTION 'resolve dependent financial evidence first' USING ERRCODE='22023';END IF;
  reverse:=op='financeReversal';op:=old.values_json->>'financeType';v:=old.values_json||v;
 END IF;
 v:=v||jsonb_build_object('financeType',op,'financeContract','1');d:=salapiya_p2.day(v->>'date');
 IF reverse THEN RETURN salapiya_p2.p4_finish(p,cid,v,op,old,kind,posts,total,source,true);END IF;
 IF op IN ('debtImport','borrowing') THEN
  PERFORM salapiya_p2.required(v,'lender',200);
  IF v->>'debtType' IS NULL OR v->>'debtType' NOT IN ('personal_loan','installment_loan','bnpl','flexible_manual') THEN RAISE EXCEPTION 'unsupported debt type' USING ERRCODE='22023';END IF;
  IF coalesce(v->>'principal','')<>'' THEN PERFORM salapiya_p2.php(v,'principal');END IF;
  v:=v||jsonb_build_object('debt',coalesce(old.action_id,cid)::text);total:=salapiya_p2.php(v,'amount');
  IF op='debtImport' THEN posts:=jsonb_build_array(salapiya_p2.post('debt_liability',-total,d),salapiya_p2.post('equity',total,d));
  ELSE
   withheld:=salapiya_p2.php(v,'withheld',true);financed:=salapiya_p2.php(v,'financedFee',true);
   IF withheld>=total OR total+financed>100000000000 THEN RAISE EXCEPTION 'invalid proceeds or financed fee' USING ERRCODE='22023';END IF;
   posts:=jsonb_build_array(salapiya_p2.post('debt_liability',-(total+financed),d));
   IF v->>'fundingUse'='purchase' THEN
    IF withheld<>0 THEN RAISE EXCEPTION 'separate proceeds required' USING ERRCODE='22023';END IF;
    posts:=posts||jsonb_build_array(salapiya_p2.post('expense',total,d,NULL,v->>'category'));
   ELSIF v->>'fundingUse'='cash' THEN posts:=posts||jsonb_build_array(salapiya_p2.post('cash',total-withheld,d,v->>'account'));
   ELSE RAISE EXCEPTION 'choose borrowing use' USING ERRCODE='22023';END IF;
   posts:=posts||jsonb_build_array(salapiya_p2.post('expense',withheld+financed,d,NULL,v->>'feeCategory'));
  END IF;
 ELSE
  debt:=salapiya_p2.p4_source(p,v->>'debt',ARRAY['debtImport','borrowing']);v:=v||jsonb_build_object('debt',debt.action_id::text);
  IF d<debt.effective_date OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'='debtPayoff' AND r.values_json->>'debt'=debt.action_id::text)
  THEN RAISE EXCEPTION 'debt closed or activity before opening' USING ERRCODE='22023';END IF;
  SELECT -coalesce(sum(q.amount_minor::numeric) FILTER(WHERE q.ledger='debt_liability'),0),coalesce(sum(q.amount_minor::numeric) FILTER(WHERE q.ledger='debt_clearing'),0)
  INTO liability,clearing FROM salapiya_p2.posting q JOIN salapiya_p2.current_revision r ON r.id=q.revision_id WHERE r.profile_id=p AND r.values_json->>'debt'=debt.action_id::text AND (old.id IS NULL OR r.id<>old.id);
  CASE op
  WHEN 'debtPayment' THEN
   total:=salapiya_p2.php(v,'amount');external:=salapiya_p2.php(v,'externalFee',true);reduction:=salapiya_p2.php(v,'reduction',true);interest:=salapiya_p2.php(v,'interest',true);fee:=salapiya_p2.php(v,'fee',true);unresolved:=salapiya_p2.php(v,'clearing',true);
   IF external+reduction+interest+fee+unresolved<>total OR reduction>liability THEN RAISE EXCEPTION 'payment components mismatch' USING ERRCODE='22023';END IF;
   IF v->>'certainty'='confirmed_total' THEN IF unresolved<>0 OR interest<>0 OR fee<>0 THEN RAISE EXCEPTION 'confirmed total has new charges' USING ERRCODE='22023';END IF;
   ELSIF v->>'certainty' IS NULL OR v->>'certainty' NOT IN ('known_components','unresolved') THEN RAISE EXCEPTION 'classification evidence required' USING ERRCODE='22023';END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',-total,d,v->>'account'),salapiya_p2.post('debt_liability',reduction,d),salapiya_p2.post('debt_clearing',unresolved,d),salapiya_p2.post('expense',interest,d,NULL,v->>'interestCategory'),salapiya_p2.post('expense',fee+external,d,NULL,v->>'feeCategory'));
   contractual:=total-external;unapplied:=salapiya_p2.php(v,'unapplied',true);
   SELECT coalesce(sum(r.amount),0) INTO allocated FROM salapiya_p2.p4_debt_allocations(v->>'allocations') r;
   IF allocated+unapplied<>contractual THEN RAISE EXCEPTION 'contractual allocation mismatch' USING ERRCODE='22023';END IF;
   IF allocated>0 THEN
    schedule:=salapiya_p2.p4_source(p,v->>'scheduleSource',ARRAY['debtSchedule']);
    IF schedule.values_json->>'debt'<>debt.action_id::text THEN RAISE EXCEPTION 'foreign schedule' USING ERRCODE='22023';END IF;
    FOR row IN SELECT * FROM salapiya_p2.p4_debt_allocations(v->>'allocations') LOOP
     SELECT r.amount-r.paid INTO available FROM salapiya_p2.p4_schedule(schedule.values_json->>'schedule') r WHERE r.label=row.label;
     SELECT coalesce(sum(a.amount),0) INTO used FROM salapiya_p2.current_revision r JOIN salapiya_p2.revision previous ON previous.id::text=r.values_json->>'scheduleSource' AND previous.profile_id=p CROSS JOIN LATERAL salapiya_p2.p4_debt_allocations(r.values_json->>'allocations') a WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'='debtPayment' AND previous.action_id=schedule.action_id AND a.label=row.label;
     IF available IS NULL OR row.amount+used>available THEN RAISE EXCEPTION 'allocation exceeds due capacity' USING ERRCODE='22023';END IF;
    END LOOP;
   END IF;
  WHEN 'debtClassification' THEN
   payment:=salapiya_p2.p4_source(p,v->>'payment',ARRAY['debtPayment']);
   IF payment.values_json->>'debt'<>debt.action_id::text OR payment.effective_date>d THEN RAISE EXCEPTION 'foreign or future payment' USING ERRCODE='22023';END IF;
   reduction:=salapiya_p2.php(v,'reduction',true);interest:=salapiya_p2.php(v,'interest',true);fee:=salapiya_p2.php(v,'fee',true);total:=reduction+interest+fee;
   IF total=0 OR reduction>liability OR total>clearing OR total+salapiya_p2.p4_used(p,op,'payment',payment.id::text,old.id)>salapiya_p2.php(payment.values_json,'clearing',true) THEN RAISE EXCEPTION 'classification exceeds clearing' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reason');source:=payment.id;posts:=jsonb_build_array(salapiya_p2.post('debt_clearing',-total,d),salapiya_p2.post('debt_liability',reduction,d),salapiya_p2.post('expense',interest,d,NULL,v->>'interestCategory'),salapiya_p2.post('expense',fee,d,NULL,v->>'feeCategory'));
  WHEN 'debtSchedule' THEN
   SELECT sum(r.amount) INTO total FROM salapiya_p2.p4_schedule(salapiya_p2.required(v,'schedule',20000)) r;
   IF old.id IS NOT NULL THEN
    FOR row IN SELECT * FROM salapiya_p2.p4_schedule(old.values_json->>'schedule') LOOP
     SELECT coalesce(sum(a.amount),0) INTO used FROM salapiya_p2.current_revision r JOIN salapiya_p2.revision previous ON previous.id::text=r.values_json->>'scheduleSource' AND previous.profile_id=p CROSS JOIN LATERAL salapiya_p2.p4_debt_allocations(r.values_json->>'allocations') a WHERE r.profile_id=p AND r.values_json->>'financeType'='debtPayment' AND previous.action_id=old.action_id AND a.label=row.label;
     SELECT r.amount INTO available FROM salapiya_p2.p4_schedule(v->>'schedule') r WHERE r.label=row.label;
     IF (available IS NULL AND row.paid+used>0) OR (available IS NOT NULL AND (available<row.paid+used OR (SELECT r.paid FROM salapiya_p2.p4_schedule(v->>'schedule') r WHERE r.label=row.label)<>row.paid)) THEN RAISE EXCEPTION 'schedule must preserve paid evidence and allocations' USING ERRCODE='22023';END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM salapiya_p2.p4_schedule(v->>'schedule') r WHERE r.paid<>0 AND NOT EXISTS(SELECT 1 FROM salapiya_p2.p4_schedule(old.values_json->>'schedule') former WHERE former.label=r.label)) THEN RAISE EXCEPTION 'new obligation cannot invent historical payment' USING ERRCODE='22023';END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'=op AND r.values_json->>'debt'=debt.action_id::text)
   OR (debt.values_json->>'financeType'<>'debtImport' AND EXISTS(SELECT 1 FROM salapiya_p2.p4_schedule(v->>'schedule') r WHERE r.paid<>0)) OR v->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'invalid schedule evidence' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reference');
  WHEN 'debtPayoff' THEN
   total:=salapiya_p2.php(v,'amount',true);reduction:=salapiya_p2.php(v,'reduction',true);interest:=salapiya_p2.php(v,'interest',true);fee:=salapiya_p2.php(v,'fee',true);waiver:=salapiya_p2.php(v,'waiver',true);PERFORM salapiya_p2.php(v,'avoided',true);
   IF clearing<>0 OR total<>reduction+interest+fee OR reduction+waiver<>liability OR v->>'verified' IS DISTINCT FROM 'true' OR salapiya_p2.php(v,'providerPayoff',true)<>total THEN RAISE EXCEPTION 'payoff evidence does not reconcile' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reference');PERFORM salapiya_p2.required(v,'reason');
   IF waiver<>0 AND (v->>'waiverBasis' IS DISTINCT FROM 'imported_unknown' OR debt.values_json->>'financeType'<>'debtImport') THEN RAISE EXCEPTION 'recognized waiver source required' USING ERRCODE='22023';END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',-total,d,v->>'account'),salapiya_p2.post('debt_liability',reduction+waiver,d),salapiya_p2.post('expense',interest,d,NULL,v->>'interestCategory'),salapiya_p2.post('expense',fee,d,NULL,v->>'feeCategory'),salapiya_p2.post('equity',-waiver,d));
  ELSE RAISE EXCEPTION 'unsupported debt operation' USING ERRCODE='22023';END CASE;
 END IF;
 RETURN salapiya_p2.p4_finish(p,cid,v,op,old,kind,posts,total,source);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint),salapiya_p2.plan_p4_shared_card(uuid,uuid,jsonb,bigint),salapiya_p2.p4_command(uuid,jsonb),
 salapiya_p2.p4_finish(uuid,uuid,jsonb,text,salapiya_p2.revision,text,jsonb,numeric,uuid,boolean),salapiya_p2.p4_debt_allocations(text) FROM PUBLIC,anon,authenticated;
COMMIT;
