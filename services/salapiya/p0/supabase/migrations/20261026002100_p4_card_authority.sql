-- P4 cards extend the established P2 command/receipt/journal and private stream.
-- No new client table grants, replicated balances, or trusted posting inputs.
BEGIN;
ALTER TABLE salapiya_p2.posting DROP CONSTRAINT posting_ledger_check;
ALTER TABLE salapiya_p2.posting DROP CONSTRAINT posting_check;
ALTER TABLE salapiya_p2.posting ADD CONSTRAINT posting_ledger_check CHECK(ledger IN
 ('cash','expense','income','equity','shared_receivable','shared_payable','shared_clearing','card_liability','debt_liability','debt_clearing'));
ALTER TABLE salapiya_p2.posting ADD CONSTRAINT posting_check CHECK(
 (ledger='cash' AND account_id IS NOT NULL AND category_id IS NULL) OR
 (ledger IN ('expense','income') AND account_id IS NULL AND category_id IS NOT NULL) OR
 (ledger IN ('equity','shared_receivable','shared_payable','shared_clearing','card_liability','debt_liability','debt_clearing') AND account_id IS NULL AND category_id IS NULL));

CREATE FUNCTION salapiya_p2.p4_source(p uuid, source text, kinds text[])
RETURNS salapiya_p2.revision LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r salapiya_p2.revision; BEGIN
 SELECT * INTO r FROM salapiya_p2.current_revision x WHERE x.profile_id=p
 AND (x.id::text=source OR x.action_id::text=source) AND coalesce(x.values_json->>'financeType',x.kind)=ANY(kinds);
 IF NOT FOUND THEN RAISE EXCEPTION 'current owned financial source unavailable' USING ERRCODE='22023';END IF;
 RETURN r;
END $$;

CREATE FUNCTION salapiya_p2.p4_schedule(input text)
RETURNS TABLE(label text,due text,amount numeric,paid numeric) LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lines text[];line text;cells text[];seen text[]:='{}';previous text;BEGIN
 lines:=string_to_array(btrim(input),E'\n');
 IF lines IS NULL OR cardinality(lines) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid provider schedule' USING ERRCODE='22023';END IF;
 FOREACH line IN ARRAY lines LOOP
  cells:=string_to_array(line,',');
  IF cardinality(cells) NOT BETWEEN 3 AND 4 OR length(btrim(cells[1])) NOT BETWEEN 1 AND 100 OR btrim(cells[1])=ANY(seen)
  THEN RAISE EXCEPTION 'invalid provider schedule row' USING ERRCODE='22023';END IF;
  label:=btrim(cells[1]);seen:=array_append(seen,label);due:=salapiya_p2.day(btrim(cells[2]));
  IF previous IS NOT NULL AND due<previous THEN RAISE EXCEPTION 'unordered schedule' USING ERRCODE='22023';END IF;previous:=due;
  amount:=salapiya_p2.php(jsonb_build_object('n',btrim(cells[3])),'n');
  paid:=CASE WHEN cardinality(cells)=4 THEN salapiya_p2.php(jsonb_build_object('n',btrim(cells[4])),'n',true) ELSE 0 END;
  IF paid>amount THEN RAISE EXCEPTION 'historical payment exceeds installment' USING ERRCODE='22023';END IF;
  RETURN NEXT;
 END LOOP;
END $$;

CREATE FUNCTION salapiya_p2.p4_used(p uuid,k text,refkey text,refid text,excluded uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(x.amount_minor),0) FROM salapiya_p2.current_revision x WHERE x.profile_id=p
 AND x.values_json->>'financeType'=k AND x.values_json->>refkey=refid AND (excluded IS NULL OR x.id<>excluded) $$;

ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_before_p4;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values';op text:=cmd->>'kind';old salapiya_p2.revision;card salapiya_p2.revision;
 purchase salapiya_p2.revision;statement salapiya_p2.revision;payment salapiya_p2.revision;plan salapiya_p2.revision;auth salapiya_p2.revision;
 posts jsonb:='[]';kind text:='adjustment';d text;title text;total numeric:=0;source uuid;
 start_day text;end_day text;issued text;due text;posted text;minimum numeric;used numeric;available numeric;part numeric;allocated numeric;cnt int;i int;
 x jsonb;row record;aid uuid;day record;running numeric;reverse boolean:=false;
BEGIN
 IF op='expense' AND v->>'funding'='card' THEN op:='cardPurchase';END IF;
 IF op NOT IN ('creditCard','cardAuthorization','cardPurchase','cardPayment','cardFee','cardInterest','cardRefund','statement','statementLink','cardAllocation','installment','installmentApplication','financeCorrection','financeReversal') THEN
  IF op IN ('correction','reversal','refund') AND EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'source' AND r.values_json ? 'financeType')
  THEN RAISE EXCEPTION 'use financial source workflow' USING ERRCODE='22023';END IF;
  RETURN salapiya_p2.plan_before_p4(p,cid,cmd,seq);
 END IF;
 IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR cmd-ARRAY['contract','authority','owner','expectedVersion','kind','values']<>'{}'::jsonb
 OR NOT(cmd ?& ARRAY['contract','authority','owner','expectedVersion','kind','values'])
 OR cmd->'contract' IS DISTINCT FROM '1'::jsonb OR cmd->>'authority' IS DISTINCT FROM 'local' OR cmd->>'owner' IS DISTINCT FROM p::text
 OR jsonb_typeof(cmd->'expectedVersion') IS DISTINCT FROM 'number' OR (cmd->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,14})$'
 OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_each(v))>512
 OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>20000)
 THEN RAISE EXCEPTION 'invalid financial contract' USING ERRCODE='22023';END IF;
 IF op IN ('financeCorrection','financeReversal') THEN
  SELECT * INTO old FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=v->>'replace';
  IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>'replaceVersion' OR NOT(old.values_json ? 'financeType') OR old.values_json ? 'sharedGroup'
  THEN RAISE EXCEPTION 'source version changed or unavailable' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p2.required(v,'reason');
  IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id<>old.id AND
   (r.source_id=old.id OR EXISTS(SELECT 1 FROM unnest(ARRAY['purchase','payment','statement','plan','activity','authorization']) key WHERE r.values_json->>key=old.id::text)
   OR (old.values_json->>'financeType'='creditCard' AND r.values_json->>'card'=old.action_id::text)))
  THEN RAISE EXCEPTION 'resolve dependent financial evidence first' USING ERRCODE='22023';END IF;
  reverse:=op='financeReversal';op:=old.values_json->>'financeType';v:=old.values_json||v;
 END IF;
 v:=v||jsonb_build_object('financeType',op,'financeContract','1');
 d:=salapiya_p2.day(v->>'date');title:=salapiya_p2.required(v,'name');
 IF reverse THEN
  d:=old.effective_date;title:='Reversal · '||old.title;kind:=old.kind;total:=old.amount_minor;source:=old.source_id;
 ELSIF op='creditCard' THEN
  PERFORM salapiya_p2.required(v,'issuer',200);
  IF coalesce(v->>'limit','')<>'' THEN PERFORM salapiya_p2.php(v,'limit',true,false,true);END IF;
  IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'='creditCard' AND lower(r.title)=lower(v->>'name'))
  THEN RAISE EXCEPTION 'duplicate card name' USING ERRCODE='22023';END IF;
  v:=v||jsonb_build_object('card',coalesce(old.action_id,cid)::text);total:=salapiya_p2.php(v,'amount',true,true);
  posts:=jsonb_build_array(salapiya_p2.post('card_liability',-total,d),salapiya_p2.post('equity',total,d));
 ELSE
  card:=salapiya_p2.p4_source(p,v->>'card',ARRAY['creditCard']);v:=v||jsonb_build_object('card',card.action_id::text);
  IF d<card.effective_date THEN RAISE EXCEPTION 'activity before card opening' USING ERRCODE='22023';END IF;
  CASE op
  WHEN 'cardAuthorization' THEN total:=salapiya_p2.php(v,'amount');PERFORM salapiya_p2.required(v,'reference');
  WHEN 'cardPurchase','cardFee','cardInterest' THEN
   posted:=salapiya_p2.day(v->>'postingDate');IF posted<d THEN RAISE EXCEPTION 'posting before transaction' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount');kind:='expense';posts:=jsonb_build_array(salapiya_p2.post('card_liability',-total,d));
   IF v->>'split'='true' THEN
    cnt:=CASE WHEN v->>'splitCount' ~ '^[0-9]{1,3}$' THEN (v->>'splitCount')::int ELSE 2 END;
    IF cnt NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'invalid split count' USING ERRCODE='22023';END IF;
    part:=salapiya_p2.php(v,'splitAmount');allocated:=part;posts:=posts||jsonb_build_array(salapiya_p2.post('expense',part,d,NULL,v->>'category'));
    FOR i IN 2..cnt-1 LOOP part:=salapiya_p2.php(v,'split'||i||'Amount');allocated:=allocated+part;
     posts:=posts||jsonb_build_array(salapiya_p2.post('expense',part,d,NULL,v->>('split'||i||'Category')));END LOOP;
    IF allocated>=total THEN RAISE EXCEPTION 'invalid split total' USING ERRCODE='22023';END IF;
    posts:=posts||jsonb_build_array(salapiya_p2.post('expense',total-allocated,d,NULL,v->>'splitCategory'));
   ELSE posts:=posts||jsonb_build_array(salapiya_p2.post('expense',total,d,NULL,v->>'category'));END IF;
   IF coalesce(v->>'authorization','')<>'' THEN
    auth:=salapiya_p2.p4_source(p,v->>'authorization',ARRAY['cardAuthorization']);
    IF auth.values_json->>'card'<>card.action_id::text OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'authorization'=auth.id::text)
    THEN RAISE EXCEPTION 'authorization unavailable' USING ERRCODE='22023';END IF;source:=auth.id;
   END IF;
  WHEN 'cardPayment' THEN total:=salapiya_p2.php(v,'amount');posts:=jsonb_build_array(salapiya_p2.post('cash',-total,d,v->>'account'),salapiya_p2.post('card_liability',total,d));
  WHEN 'cardRefund' THEN
   purchase:=salapiya_p2.p4_source(p,v->>'purchase',ARRAY['cardPurchase']);
   IF purchase.values_json->>'card'<>card.action_id::text OR purchase.effective_date>d THEN RAISE EXCEPTION 'incompatible refund source' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount');
   SELECT coalesce(sum(q.amount_minor::numeric),0) INTO available FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.revision_id=purchase.id AND q.ledger='expense' AND q.category_id=v->>'category';
   IF purchase.values_json ? 'sharedGroup' THEN available:=salapiya_p2.php(purchase.values_json,'fundingAmount',true);END IF;
   SELECT coalesce(sum(CASE WHEN r.values_json ? 'fundingAmount' THEN salapiya_p2.php(r.values_json,'fundingAmount',true) ELSE r.amount_minor END),0) INTO used FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'='cardRefund' AND r.values_json->>'purchase'=purchase.id::text AND (purchase.values_json ? 'sharedGroup' OR r.values_json->>'category'=v->>'category');
   IF total+used>available THEN RAISE EXCEPTION 'refund exceeds category portion' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reason');kind:='refund';source:=purchase.id;
   posts:=jsonb_build_array(salapiya_p2.post('card_liability',total,d),CASE WHEN purchase.values_json ? 'sharedGroup' THEN salapiya_p2.post('shared_clearing',-total,d) ELSE salapiya_p2.post('expense',-total,d,NULL,v->>'category') END);
  WHEN 'statement' THEN
   start_day:=salapiya_p2.day(v->>'start');end_day:=salapiya_p2.day(v->>'end');issued:=salapiya_p2.day(v->>'issued');due:=salapiya_p2.day(v->>'due');
   IF start_day>end_day OR end_day>issued OR issued>due THEN RAISE EXCEPTION 'invalid statement dates' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount',true,true);
   IF coalesce(v->>'minimum','')<>'' AND salapiya_p2.php(v,'minimum',true)>greatest(total,0) THEN RAISE EXCEPTION 'minimum exceeds balance' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reference');IF v->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'provider confirmation required' USING ERRCODE='22023';END IF;
  WHEN 'statementLink' THEN
   statement:=salapiya_p2.p4_source(p,v->>'statement',ARRAY['statement']);purchase:=salapiya_p2.p4_source(p,v->>'activity',ARRAY['cardPurchase','cardPayment','cardFee','cardInterest','cardRefund']);
   IF statement.values_json->>'card'<>card.action_id::text OR purchase.values_json->>'card'<>card.action_id::text OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'=op AND r.values_json->>'activity'=purchase.id::text)
   OR v->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'statement membership unavailable' USING ERRCODE='22023';END IF;source:=purchase.id;
  WHEN 'cardAllocation' THEN
   statement:=salapiya_p2.p4_source(p,v->>'statement',ARRAY['statement']);payment:=salapiya_p2.p4_source(p,v->>'payment',ARRAY['cardPayment','cardRefund']);total:=salapiya_p2.php(v,'amount');
   IF statement.values_json->>'card'<>card.action_id::text OR payment.values_json->>'card'<>card.action_id::text OR payment.effective_date>d OR statement.values_json->>'issued'>d
   OR total+salapiya_p2.p4_used(p,op,'payment',payment.id::text,old.id)>payment.amount_minor
   OR total+salapiya_p2.p4_used(p,op,'statement',statement.id::text,old.id)>statement.amount_minor OR v->>'verified' IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'allocation exceeds confirmed capacity' USING ERRCODE='22023';END IF;source:=payment.id;
  WHEN 'installment' THEN
   purchase:=salapiya_p2.p4_source(p,v->>'purchase',ARRAY['cardPurchase']);
   IF purchase.values_json->>'card'<>card.action_id::text THEN RAISE EXCEPTION 'foreign installment purchase' USING ERRCODE='22023';END IF;
   SELECT sum(r.amount) INTO total FROM salapiya_p2.p4_schedule(salapiya_p2.required(v,'schedule',20000)) r;
   IF coalesce(v->>'principal','')<>'' OR coalesce(v->>'interest','')<>'' OR coalesce(v->>'fee','')<>'' THEN
    IF salapiya_p2.php(v,'principal',true)+salapiya_p2.php(v,'interest',true)+salapiya_p2.php(v,'fee',true)<>total OR salapiya_p2.php(v,'principal',true)>purchase.amount_minor
    THEN RAISE EXCEPTION 'provider components mismatch' USING ERRCODE='22023';END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'=op AND r.values_json->>'purchase'=purchase.id::text)
   OR v->>'verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'installment source unavailable' USING ERRCODE='22023';END IF;
   PERFORM salapiya_p2.required(v,'reference');source:=purchase.id;
  WHEN 'installmentApplication' THEN
   plan:=salapiya_p2.p4_source(p,v->>'plan',ARRAY['installment']);payment:=salapiya_p2.p4_source(p,v->>'payment',ARRAY['cardAllocation']);statement:=salapiya_p2.p4_source(p,payment.values_json->>'statement',ARRAY['statement']);
   IF plan.values_json->>'card'<>card.action_id::text OR statement.values_json->>'card'<>card.action_id::text THEN RAISE EXCEPTION 'foreign installment application' USING ERRCODE='22023';END IF;
   SELECT r.amount INTO available FROM salapiya_p2.p4_schedule(plan.values_json->>'schedule') r WHERE r.label=v->>'row';
   IF available IS NULL THEN RAISE EXCEPTION 'installment row unavailable' USING ERRCODE='22023';END IF;
   total:=salapiya_p2.php(v,'amount');
   SELECT coalesce(sum(r.amount_minor),0) INTO used FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND (old.id IS NULL OR r.id<>old.id) AND r.values_json->>'financeType'=op AND r.values_json->>'plan'=plan.id::text AND r.values_json->>'row'=v->>'row';
   IF total+used>available OR total+salapiya_p2.p4_used(p,op,'payment',payment.id::text,old.id)>payment.amount_minor OR v->>'verified' IS DISTINCT FROM 'true'
   THEN RAISE EXCEPTION 'application exceeds supported capacity' USING ERRCODE='22023';END IF;source:=payment.id;
  ELSE RAISE EXCEPTION 'unsupported financial operation' USING ERRCODE='22023';
  END CASE;
 END IF;
 SELECT coalesce(jsonb_agg(e),'[]') INTO posts FROM jsonb_array_elements(posts) e WHERE (e->>'amount')::numeric<>0;
 FOR x IN SELECT value FROM jsonb_array_elements(posts) LOOP
  IF abs((x->>'amount')::numeric)>100000000000 THEN RAISE EXCEPTION 'component outside range' USING ERRCODE='22023';END IF;
  IF x->>'ledger'='expense' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.category k WHERE k.profile_id=p AND k.id=x->>'category' AND k.kind='expense')
  THEN RAISE EXCEPTION 'expense category unavailable' USING ERRCODE='22023';END IF;
  IF x->>'ledger'='cash' THEN
   aid:=(x->>'account')::uuid;
   IF NOT EXISTS(SELECT 1 FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id=aid AND NOT a.archived AND a.cutoff<d) THEN RAISE EXCEPTION 'account unavailable, archived or before cutoff' USING ERRCODE='22023';END IF;
   FOR day IN SELECT DISTINCT effective_date FROM salapiya_p2.posting q WHERE q.profile_id=p AND q.account_id=aid AND q.effective_date>=d UNION SELECT d LOOP
    running:=salapiya_p2.balance(p,aid,day.effective_date,old.id)+(x->>'amount')::numeric;
    IF running<0 AND v->>'acknowledge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'negative balance requires acknowledgement' USING ERRCODE='22023';END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF (SELECT coalesce(sum((e->>'amount')::numeric),0) FROM jsonb_array_elements(posts) e)<>0 THEN RAISE EXCEPTION 'unbalanced financial evidence' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('account',NULL,'category',NULL,'archiveId',NULL,'revision',jsonb_build_object(
  'id',cid::text,'actionId',coalesce(old.action_id,cid)::text,'kind',kind,'change',CASE WHEN reverse THEN 'reverse' WHEN old.id IS NULL THEN 'create' ELSE 'replace' END,
  'date',d,'title',title,'amount',total::text,'number',coalesce(old.revision_no,0)+1,'previous',old.id::text,'source',source::text,'values',v,'postings',posts));
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint),salapiya_p2.plan_before_p4(uuid,uuid,jsonb,bigint),
 salapiya_p2.p4_source(uuid,text,text[]),salapiya_p2.p4_schedule(text),salapiya_p2.p4_used(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
