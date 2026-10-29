-- Exact server counterpart of local/finance_domain.dart. No client posting plan
-- is accepted. Hosted parity fixtures exercise both implementations.
BEGIN;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 v jsonb:=cmd->'values'; data jsonb:=v; k text:=cmd->>'kind'; change text:='create';
 action_id uuid:=cid; previous_id uuid; source_id uuid; number integer:=1;
 d text; title text:=salapiya_p2.value(v,'name'); total numeric:=0;
 posts jsonb:='[]'; account_json jsonb; category_json jsonb; revision_json jsonb;
 original salapiya_p2.revision; replaced salapiya_p2.revision; a salapiya_p2.account;
 post_item jsonb; entry record; i integer; cnt integer; part numeric; allocated numeric; withheld numeric:=0;
 fee numeric; treatment text; fee_date text; bearing text; prefix text; fee_key text;
 allocations text:='['; posting_id text; selected text[]:='{}'; eligible salapiya_p2.posting;
 refunded numeric; observed numeric; calculated numeric; source_count bigint;
 min_date text; running numeric; affected uuid; classification text; form_name text;
BEGIN
 IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR
    cmd - ARRAY['contract','authority','owner','expectedVersion','kind','values'] <> '{}'::jsonb OR
    NOT(cmd ?& ARRAY['contract','authority','owner','expectedVersion','kind','values']) OR
    cmd->'contract' IS DISTINCT FROM '1'::jsonb OR cmd->>'authority' IS DISTINCT FROM 'local' OR
    cmd->>'owner' IS DISTINCT FROM p::text OR jsonb_typeof(cmd->'expectedVersion') IS DISTINCT FROM 'number' OR
    (cmd->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,14})$' OR
    jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_each(v))>512
 THEN RAISE EXCEPTION 'invalid command contract' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>20000)
 THEN RAISE EXCEPTION 'invalid form values' USING ERRCODE='22023'; END IF;
 d:=CASE WHEN salapiya_p2.value(v,'date')<>'' THEN salapiya_p2.day(salapiya_p2.value(v,'date'))
   WHEN k='account' THEN salapiya_p2.day(salapiya_p2.value(v,'cutoff'))
   WHEN k IN ('category','archive','reversal') THEN to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD')
   ELSE salapiya_p2.day(salapiya_p2.value(v,'date')) END;
 IF k='category' THEN
   form_name:=salapiya_p2.required(v,'name',200); classification:=salapiya_p2.value(v,'classification');
   IF classification NOT IN ('expense','income') OR EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND lower(c.name)=lower(form_name))
   THEN RAISE EXCEPTION 'category classification or name conflict' USING ERRCODE='22023'; END IF;
   category_json:=jsonb_build_object('id',cid::text,'name',form_name,'kind',classification);
   RETURN jsonb_build_object('account',NULL,'category',category_json,'archiveId',NULL,'revision',NULL);
 END IF;
 IF k='archive' THEN
   SELECT * INTO a FROM salapiya_p2.account ac WHERE ac.profile_id=p AND ac.id::text=salapiya_p2.value(v,'account');
   IF NOT FOUND OR a.archived THEN RAISE EXCEPTION 'account unavailable or archived' USING ERRCODE='22023'; END IF;
   PERFORM salapiya_p2.required(v,'reason');
   RETURN jsonb_build_object('account',NULL,'category',NULL,'archiveId',a.id::text,'revision',NULL);
 END IF;
 IF k IN ('correction','reversal') THEN
   SELECT * INTO replaced FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.id::text=salapiya_p2.value(v,'source');
   IF NOT FOUND OR salapiya_p2.value(v,'sourceVersion')<>replaced.revision_no::text
     OR replaced.kind NOT IN ('expense','income','transfer','refund','adjustment','opening')
   THEN RAISE EXCEPTION 'source version changed or unavailable' USING ERRCODE='22023'; END IF;
   PERFORM salapiya_p2.required(v,'reason');
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision r JOIN salapiya_p2.revision s ON s.id=r.source_id
     WHERE r.profile_id=p AND s.action_id=replaced.action_id)
   THEN RAISE EXCEPTION 'resolve dependent evidence first' USING ERRCODE='22023'; END IF;
   previous_id:=replaced.id; action_id:=replaced.action_id; number:=replaced.revision_no+1;
   change:=CASE WHEN k='reversal' THEN 'reverse' ELSE 'replace' END;
   k:=replaced.kind; source_id:=replaced.source_id; data:=replaced.values_json || v;
   IF change='reverse' THEN d:=replaced.effective_date; title:='Reversal · '||replaced.title; total:=replaced.amount_minor; END IF;
 END IF;
 IF change<>'reverse' THEN
 CASE k
 WHEN 'account' THEN
   form_name:=salapiya_p2.required(v,'name',200); classification:=salapiya_p2.value(v,'kind');
   IF classification NOT IN ('Cash','Bank','Mobile wallet','Checking','Savings') OR
     EXISTS(SELECT 1 FROM salapiya_p2.account ac WHERE ac.profile_id=p AND lower(ac.name)=lower(form_name))
   THEN RAISE EXCEPTION 'account type or name conflict' USING ERRCODE='22023'; END IF;
   d:=salapiya_p2.day(salapiya_p2.value(v,'cutoff')); total:=salapiya_p2.php(v,'amount',true);
   account_json:=jsonb_build_object('id',cid::text,'name',form_name,'kind',classification,'cutoff',d,
     'institution',salapiya_p2.value(v,'institution'),'notes',salapiya_p2.value(v,'notes'));
   k:='opening'; title:='Opening balance · '||form_name;
   IF total<>0 THEN posts:=jsonb_build_array(salapiya_p2.post('cash',total,d,cid::text),salapiya_p2.post('equity',-total,d)); END IF;
 WHEN 'income','expense' THEN
   total:=salapiya_p2.php(v,'amount'); title:=salapiya_p2.required(v,'name');
   posts:=jsonb_build_array(salapiya_p2.post('cash',CASE WHEN k='income' THEN total ELSE -total END,d,salapiya_p2.value(v,'account')));
   IF k='income' THEN
     IF salapiya_p2.value(v,'incomeClass') NOT IN ('earned','gift','reward','other')
     THEN RAISE EXCEPTION 'income classification required' USING ERRCODE='22023'; END IF;
     posts:=posts || jsonb_build_array(salapiya_p2.post('income',-total,d,NULL,salapiya_p2.value(v,'category')));
   ELSIF salapiya_p2.value(v,'split')='true' THEN
     cnt:=CASE WHEN salapiya_p2.value(v,'splitCount') ~ '^[0-9]{1,3}$' THEN (v->>'splitCount')::int ELSE 2 END;
     IF cnt<2 OR cnt>100 THEN RAISE EXCEPTION 'split count outside contract' USING ERRCODE='22023'; END IF;
     part:=salapiya_p2.php(v,'splitAmount'); allocated:=part;
     posts:=posts || jsonb_build_array(salapiya_p2.post('expense',part,d,NULL,salapiya_p2.value(v,'category')));
     FOR i IN 2..cnt-1 LOOP
       part:=salapiya_p2.php(v,'split'||i||'Amount'); allocated:=allocated+part;
       posts:=posts || jsonb_build_array(salapiya_p2.post('expense',part,d,NULL,salapiya_p2.value(v,'split'||i||'Category')));
     END LOOP;
     IF allocated>=total THEN RAISE EXCEPTION 'split amounts must equal total with positive parts' USING ERRCODE='22023'; END IF;
     posts:=posts || jsonb_build_array(salapiya_p2.post('expense',total-allocated,d,NULL,salapiya_p2.value(v,'splitCategory')));
   ELSE posts:=posts || jsonb_build_array(salapiya_p2.post('expense',total,d,NULL,salapiya_p2.value(v,'category'))); END IF;
 WHEN 'transfer' THEN
   total:=salapiya_p2.php(v,'amount');
   title:=CASE WHEN title='' THEN 'Account transfer' ELSE salapiya_p2.required(v,'name') END;
   IF salapiya_p2.value(v,'account')=salapiya_p2.value(v,'destination')
   THEN RAISE EXCEPTION 'transfer requires different accounts' USING ERRCODE='22023'; END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',-total,d,salapiya_p2.value(v,'account')),
     salapiya_p2.post('cash',total,d,salapiya_p2.value(v,'destination')));
   cnt:=CASE WHEN salapiya_p2.value(v,'feeCount') ~ '^[0-9]{1,3}$' THEN (v->>'feeCount')::int ELSE 1 END;
   IF cnt<1 OR cnt>20 THEN RAISE EXCEPTION 'fee count outside contract' USING ERRCODE='22023'; END IF;
   FOR i IN 0..cnt-1 LOOP
     prefix:=CASE WHEN i=0 THEN 'fee' ELSE 'extraFee'||i END;
     fee_key:=CASE WHEN i=0 THEN 'fee' ELSE prefix||'Amount' END;
     fee:=salapiya_p2.php(v,fee_key,i=0);
     IF fee=0 THEN CONTINUE; END IF;
     treatment:=salapiya_p2.value(v,prefix||'Treatment');
     IF treatment NOT IN ('source_additional','withheld','separate')
     THEN RAISE EXCEPTION 'fee treatment required' USING ERRCODE='22023'; END IF;
     fee_date:=CASE WHEN salapiya_p2.value(v,prefix||'Date')='' THEN d ELSE salapiya_p2.day(salapiya_p2.value(v,prefix||'Date')) END;
     IF treatment='withheld' THEN
       IF fee_date<>d THEN RAISE EXCEPTION 'withheld fee date differs' USING ERRCODE='22023'; END IF;
       withheld:=withheld+fee;
     END IF;
     bearing:=CASE WHEN treatment='separate' THEN salapiya_p2.value(v,prefix||'Account') ELSE salapiya_p2.value(v,'account') END;
     posts:=posts || jsonb_build_array(salapiya_p2.post('cash',-fee,fee_date,bearing),
       salapiya_p2.post('expense',fee,fee_date,NULL,salapiya_p2.value(v,prefix||'Category')));
   END LOOP;
   IF total+withheld>100000000000 THEN RAISE EXCEPTION 'transfer principal outside contract' USING ERRCODE='22023'; END IF;
 WHEN 'refund' THEN
   SELECT * INTO original FROM salapiya_p2.current_revision r WHERE r.profile_id=p
     AND r.id::text=coalesce(replaced.source_id::text,salapiya_p2.value(v,'source'));
   IF NOT FOUND OR original.kind NOT IN ('expense','transfer') OR
     (replaced.id IS NULL AND salapiya_p2.value(v,'sourceVersion')<>original.revision_no::text)
     OR d<original.effective_date
   THEN RAISE EXCEPTION 'refund source changed or unavailable' USING ERRCODE='22023'; END IF;
   source_id:=original.id; total:=salapiya_p2.php(v,'amount'); PERFORM salapiya_p2.required(v,'reason');
   IF title='' THEN title:='Refund · '||original.title; END IF;
   cnt:=CASE WHEN salapiya_p2.value(v,'refundMultiple')='true'
     THEN CASE WHEN salapiya_p2.value(v,'refundCount') ~ '^[0-9]{1,3}$' THEN (v->>'refundCount')::int ELSE 2 END ELSE 1 END;
   IF cnt<1 OR cnt>100 THEN RAISE EXCEPTION 'refund allocation count outside contract' USING ERRCODE='22023'; END IF;
   allocated:=0;
   FOR i IN 0..cnt-1 LOOP
     posting_id:=salapiya_p2.value(v,CASE WHEN i=0 THEN 'refundPosting' ELSE 'refund'||i||'Posting' END);
     IF (SELECT count(*) FROM salapiya_p2.posting x WHERE x.revision_id=original.id AND x.ledger='expense' AND x.effective_date<=d
       AND (CASE WHEN posting_id='' AND salapiya_p2.value(v,'refundMultiple')<>'true' THEN x.category_id=salapiya_p2.value(v,'refundCategory') ELSE x.id=posting_id END))<>1
     THEN RAISE EXCEPTION 'choose an eligible original portion' USING ERRCODE='22023'; END IF;
     SELECT * INTO eligible FROM salapiya_p2.posting x WHERE x.revision_id=original.id AND x.ledger='expense' AND x.effective_date<=d
       AND (CASE WHEN posting_id='' AND salapiya_p2.value(v,'refundMultiple')<>'true' THEN x.category_id=salapiya_p2.value(v,'refundCategory') ELSE x.id=posting_id END);
     posting_id:=eligible.id;
     IF posting_id=ANY(selected) THEN RAISE EXCEPTION 'duplicate refund portion' USING ERRCODE='22023'; END IF;
     selected:=array_append(selected,posting_id);
     part:=CASE WHEN salapiya_p2.value(v,'refundMultiple')='true' THEN salapiya_p2.php(v,CASE WHEN i=0 THEN 'refundFirstAmount' ELSE 'refund'||i||'Amount' END) ELSE total END;
     SELECT coalesce(sum((alloc.value->>'amount_minor')::numeric),0) INTO refunded FROM salapiya_p2.current_revision r,
       LATERAL jsonb_array_elements((r.values_json->>'refundAllocations')::jsonb) alloc
       WHERE r.profile_id=p AND r.kind='refund' AND r.source_id=original.id
       AND (replaced.id IS NULL OR r.id<>replaced.id) AND alloc.value->>'posting'=posting_id;
     IF part+refunded>eligible.amount_minor THEN RAISE EXCEPTION 'refund exceeds unrefunded portion' USING ERRCODE='22023'; END IF;
     allocations:=allocations || CASE WHEN i>0 THEN ',' ELSE '' END ||
       '{"posting":'||to_json(posting_id)::text||',"category":'||to_json(eligible.category_id)::text||',"amount_minor":'||to_json(part::text)::text||'}';
     allocated:=allocated+part;
     posts:=posts || jsonb_build_array(salapiya_p2.post('expense',-part,d,NULL,eligible.category_id));
     IF i=0 THEN data:=data || jsonb_build_object('refundPosting',posting_id,'refundCategory',eligible.category_id); END IF;
   END LOOP;
   IF allocated<>total THEN RAISE EXCEPTION 'refund allocations differ from total' USING ERRCODE='22023'; END IF;
   data:=data || jsonb_build_object('refundAllocations',allocations||']');
   posts:=posts || jsonb_build_array(salapiya_p2.post('cash',total,d,salapiya_p2.value(v,'account')));
 WHEN 'reconcile' THEN
   SELECT * INTO a FROM salapiya_p2.account ac WHERE ac.profile_id=p AND ac.id::text=salapiya_p2.value(v,'account');
   IF NOT FOUND OR d<a.cutoff THEN RAISE EXCEPTION 'comparison account or date invalid' USING ERRCODE='22023'; END IF;
   observed:=salapiya_p2.php(v,'amount',true,true,true); calculated:=salapiya_p2.balance(p,a.id,d);
   total:=observed-calculated; title:='Reconciliation · '||a.name;
   data:=data || jsonb_build_object('account',a.id::text,'date',d,'observed',observed::text,
     'calculated',calculated::text,'difference',total::text,'version',seq::text,
     'sourceCount',salapiya_p2.source_count(p,a.id,d)::text);
 WHEN 'adjustment' THEN
   PERFORM salapiya_p2.required(v,'reason'); title:='Balance adjustment';
   IF (replaced.id IS NOT NULL AND replaced.source_id IS NULL) OR (replaced.id IS NULL AND salapiya_p2.value(v,'source')='') THEN
     total:=salapiya_p2.php(v,'amount',false,true); source_id:=NULL; data:=data || '{"mode":"manual"}';
   ELSE
     SELECT * INTO original FROM salapiya_p2.revision r WHERE r.profile_id=p
       AND r.id::text=coalesce(replaced.source_id::text,salapiya_p2.value(v,'source'));
     IF NOT FOUND OR original.kind<>'reconcile' OR original.values_json->>'account'<>salapiya_p2.value(v,'account') OR
       EXISTS(SELECT 1 FROM salapiya_p2.current_revision r WHERE r.profile_id=p AND r.kind='adjustment' AND r.source_id=original.id AND (replaced.id IS NULL OR r.id<>replaced.id))
     THEN RAISE EXCEPTION 'comparison unavailable or already adjusted' USING ERRCODE='22023'; END IF;
     calculated:=salapiya_p2.balance(p,(v->>'account')::uuid,original.effective_date,replaced.id);
     source_count:=salapiya_p2.source_count(p,(v->>'account')::uuid,original.effective_date,replaced.id);
     IF calculated<>(original.values_json->>'calculated')::numeric OR source_count::text<>original.values_json->>'sourceCount' OR d<>original.effective_date
     THEN RAISE EXCEPTION 'comparison sources changed' USING ERRCODE='22023'; END IF;
     source_id:=original.id;
     total:=salapiya_p2.php(original.values_json,'amount',true,true,true)-calculated;
     IF total=0 OR abs(total)>100000000000 THEN RAISE EXCEPTION 'adjustment outside contract' USING ERRCODE='22023'; END IF;
   END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',total,d,salapiya_p2.value(v,'account')),salapiya_p2.post('equity',-total,d));
 WHEN 'opening' THEN
   SELECT * INTO eligible FROM salapiya_p2.posting x WHERE x.revision_id=replaced.id AND x.ledger='cash';
   SELECT * INTO a FROM salapiya_p2.account ac WHERE ac.profile_id=p AND ac.id=eligible.account_id;
   IF replaced.id IS NULL OR a.id IS NULL OR salapiya_p2.value(v,'account')<>a.id::text OR d<>replaced.effective_date OR d<>a.cutoff
   THEN RAISE EXCEPTION 'opening correction must retain account and cutoff' USING ERRCODE='22023'; END IF;
   total:=salapiya_p2.php(v,'amount'); title:=replaced.title;
   posts:=jsonb_build_array(salapiya_p2.post('cash',total,d,a.id::text),salapiya_p2.post('equity',-total,d));
 ELSE RAISE EXCEPTION 'unsupported financial command' USING ERRCODE='22023';
 END CASE;
 END IF;
 -- Independently validate every referenced owner/account/category and journal.
 FOR post_item IN SELECT value FROM jsonb_array_elements(posts) LOOP
   IF (post_item->>'amount')::numeric=0 OR abs((post_item->>'amount')::numeric)>100000000000 THEN RAISE EXCEPTION 'posting outside contract' USING ERRCODE='22023'; END IF;
   IF post_item->>'account' IS NOT NULL AND account_json IS NULL THEN
     SELECT * INTO a FROM salapiya_p2.account ac WHERE ac.profile_id=p AND ac.id::text=post_item->>'account';
     IF NOT FOUND OR (a.archived AND replaced.id IS NULL) OR (k<>'opening' AND post_item->>'date'<=a.cutoff)
     THEN RAISE EXCEPTION 'account unavailable, archived or before cutoff' USING ERRCODE='22023'; END IF;
   END IF;
   IF post_item->>'category' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND c.id=post_item->>'category' AND c.kind=post_item->>'ledger')
   THEN RAISE EXCEPTION 'category unavailable or misclassified' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(posts) x GROUP BY x->>'date' HAVING sum((x->>'amount')::numeric)<>0)
 THEN RAISE EXCEPTION 'unbalanced journal' USING ERRCODE='22023'; END IF;
 FOR affected IN SELECT DISTINCT aid FROM (
   SELECT (x->>'account')::uuid aid FROM jsonb_array_elements(posts) x WHERE x->>'account' IS NOT NULL
   UNION SELECT x.account_id FROM salapiya_p2.posting x WHERE x.revision_id=replaced.id AND x.account_id IS NOT NULL) ids
 LOOP
   IF account_json IS NOT NULL AND affected=cid THEN CONTINUE; END IF;
   SELECT min(on_date) INTO min_date FROM (
     SELECT x->>'date' on_date FROM jsonb_array_elements(posts) x WHERE x->>'account'=affected::text
     UNION SELECT x.effective_date FROM salapiya_p2.posting x WHERE x.revision_id=replaced.id AND x.account_id=affected) dates;
   running:=0;
   FOR entry IN SELECT on_date,sum(n) delta FROM (
     SELECT x.effective_date on_date,x.amount_minor::numeric n FROM salapiya_p2.posting x
       JOIN salapiya_p2.current_revision r ON r.id=x.revision_id
       WHERE x.profile_id=p AND x.account_id=affected AND (replaced.id IS NULL OR r.id<>replaced.id)
     UNION ALL SELECT x->>'date',(x->>'amount')::numeric FROM jsonb_array_elements(posts) x WHERE x->>'account'=affected::text
     UNION ALL SELECT min_date,0::numeric) changes GROUP BY on_date ORDER BY on_date
   LOOP
     running:=running+entry.delta;
     IF entry.on_date<min_date THEN CONTINUE; END IF;
     IF running< -9223372036854775808 OR running>9223372036854775807 THEN RAISE EXCEPTION 'balance outside SQLite range' USING ERRCODE='22023'; END IF;
     IF running<0 AND salapiya_p2.value(v,'acknowledge')<>'true'
     THEN RAISE EXCEPTION 'negative balance requires acknowledgement' USING ERRCODE='22023'; END IF;
   END LOOP;
 END LOOP;
 data:=data || jsonb_build_object('name',title,'date',d);
 IF NOT(k='opening' AND total=0) THEN
   revision_json:=jsonb_build_object('id',cid::text,'actionId',action_id::text,'kind',k,'change',change,
     'date',d,'title',title,'amount',total::text,'number',number,'previous',previous_id::text,
     'source',source_id::text,'values',data,'postings',posts);
 END IF;
 RETURN jsonb_build_object('account',account_json,'category',category_json,'archiveId',NULL,'revision',revision_json);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
