BEGIN;
ALTER TABLE salapiya_p2.posting DROP CONSTRAINT posting_ledger_check;
ALTER TABLE salapiya_p2.posting DROP CONSTRAINT posting_check;
ALTER TABLE salapiya_p2.posting ADD CONSTRAINT posting_ledger_check CHECK(ledger IN ('cash','expense','income','equity','shared_receivable','shared_payable','shared_clearing'));
ALTER TABLE salapiya_p2.posting ADD CONSTRAINT posting_check CHECK(
 (ledger='cash' AND account_id IS NOT NULL AND category_id IS NULL) OR
 (ledger IN ('expense','income') AND account_id IS NULL AND category_id IS NOT NULL) OR
 (ledger IN ('equity','shared_receivable','shared_payable','shared_clearing') AND account_id IS NULL AND category_id IS NULL));
ALTER FUNCTION salapiya_p2.plan(uuid,uuid,jsonb,bigint) RENAME TO plan_p2;
CREATE FUNCTION salapiya_p2.plan(p uuid,cid uuid,cmd jsonb,seq bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v jsonb:=cmd->'values'; mode text:=v->>'sharedMode'; d text; g jsonb; me text; source jsonb; b jsonb; r jsonb;
 old salapiya_p2.revision; payment salapiya_p2.revision; original uuid; amount numeric; share numeric; effect numeric;
 posts jsonb:='[]'; x jsonb; line record; aid uuid; running numeric; covered numeric; kind text:='expense'; total numeric;
BEGIN
 IF cmd->>'kind'<>'shared' THEN
   IF cmd->>'kind' IN ('correction','reversal','refund') AND EXISTS(SELECT 1 FROM salapiya_p2.revision z WHERE z.profile_id=p AND z.id::text=v->>'source' AND z.values_json ? 'sharedGroup')
   THEN PERFORM salapiya_p3.fail('Use explicit Shared Expenses private reconciliation');END IF;
   RETURN salapiya_p2.plan_p2(p,cid,cmd,seq);
 END IF;
 IF cmd-ARRAY['contract','authority','owner','expectedVersion','kind','values']<>'{}' OR cmd->'contract' IS DISTINCT FROM '1' OR cmd->>'authority'<>'local' OR cmd->>'owner' IS DISTINCT FROM p::text OR
 jsonb_typeof(v) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>20000)
 THEN PERFORM salapiya_p3.fail('Invalid private shared contract');END IF;
 IF v->>'funding'='card' THEN PERFORM salapiya_p3.fail('Card integration requires P4');END IF;
 d:=salapiya_p2.day(v->>'date');amount:=salapiya_p2.php(v,'fundingAmount',true);share:=salapiya_p2.php(v,'shareAmount',true);
 SELECT document::jsonb INTO g FROM public.p3_group z JOIN public.p2_profile profile ON profile.owner_id=z.owner_id
 WHERE profile.id=p AND z.group_id=(v->>'sharedGroup')::uuid;
 IF g IS NULL THEN PERFORM salapiya_p3.fail('Entitled group source unavailable');END IF;
 SELECT e.key INTO me FROM jsonb_each(g->'people') e JOIN public.p2_profile profile ON profile.owner_id::text=e.value->>'user' WHERE profile.id=p;
 IF me IS NULL THEN PERFORM salapiya_p3.fail('Private participant unavailable');END IF;
 IF coalesce(v->>'source','')<>'' THEN
   SELECT * INTO old FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.id::text=v->>'source';
   IF old.id IS NULL OR old.revision_no::text IS DISTINCT FROM v->>'sourceVersion' THEN PERFORM salapiya_p3.fail('Private source changed');END IF;
   PERFORM salapiya_p2.required(v,'reason');
   IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.source_id=old.id) THEN PERFORM salapiya_p3.fail('Resolve dependent private evidence first');END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND (old.id IS NULL OR z.id<>old.id) AND z.values_json->>'sharedGroup'=v->>'sharedGroup' AND z.values_json->>'sharedKey'=v->>'sharedKey' AND z.values_json->>'sharedMode'=mode)
 THEN PERFORM salapiya_p3.fail('Private group source already linked');END IF;
 IF mode='bill' THEN
   b:=g->'bills'->(v->>'sharedKey');r:=b->'revisions'->-1;
   IF r IS NULL OR r->>'id' IS DISTINCT FROM v->>'sharedRevision' OR share<>coalesce((r->'shares'->>me)::numeric,0) THEN PERFORM salapiya_p3.fail('Group bill changed; review source');END IF;
   -- Refunds are independent actual-money/share-credit sources; adoption starts
   -- from gross bill funding and consumption, never silently nets actual cash.
   IF old.id IS NULL OR old.values_json->>'sharedGroup' IS NULL OR v->>'acknowledgeFunding'='true' THEN
     IF amount<>coalesce((r->'paid'->>me)::numeric,0) THEN PERFORM salapiya_p3.fail('Funding differs from accepted contribution');END IF;
   ELSIF old.values_json->>'fundingAmount' IS DISTINCT FROM v->>'fundingAmount' OR old.values_json->>'account' IS DISTINCT FROM v->>'account' THEN PERFORM salapiya_p3.fail('Funding correction requires explicit consent');END IF;
   IF old.id IS NOT NULL THEN
     IF NOT(old.values_json ? 'sharedGroup') THEN
       IF old.kind<>'expense' OR old.amount_minor<>amount OR old.effective_date<>d OR old.values_json->>'split'='true' OR old.values_json->>'account' IS DISTINCT FROM v->>'account' THEN PERFORM salapiya_p3.fail('Existing purchase funding must remain exact');END IF;
     ELSIF old.values_json->>'sharedGroup' IS DISTINCT FROM v->>'sharedGroup' OR old.values_json->>'sharedKey' IS DISTINCT FROM v->>'sharedKey' THEN PERFORM salapiya_p3.fail('Private source cannot switch group');END IF;
   END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',-amount,d,v->>'account'),salapiya_p2.post('expense',share,d,NULL,v->>'category'),salapiya_p2.post(CASE WHEN amount>=share THEN 'shared_receivable' ELSE 'shared_payable' END,amount-share,d));total:=share;
 ELSIF mode IN ('payment','clear') THEN
   source:=g->'settlements'->(v->>'sharedKey');
   IF source IS NULL OR source->>'id' IS DISTINCT FROM v->>'sharedRevision' OR amount<>(source->>'amount')::numeric OR share<>0 OR amount=0 THEN PERFORM salapiya_p3.fail('Private payment source changed');END IF;
   IF (v->>'direction'='out' AND source->>'sender'<>me) OR (v->>'direction'='in' AND source->>'recipient'<>me) OR v->>'direction' NOT IN ('in','out') THEN PERFORM salapiya_p3.fail('Private payment direction unavailable');END IF;
   effect:=CASE WHEN v->>'direction'='out' THEN amount ELSE -amount END;
   IF mode='payment' THEN posts:=jsonb_build_array(salapiya_p2.post('cash',-effect,d,v->>'account'),salapiya_p2.post('shared_clearing',effect,d));
   ELSE
     SELECT * INTO payment FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.id::text=v->>'paymentSource';
     IF payment.id IS NULL OR payment.values_json->>'sharedMode'<>'payment' OR payment.values_json->>'sharedGroup' IS DISTINCT FROM v->>'sharedGroup' OR payment.values_json->>'sharedKey' IS DISTINCT FROM v->>'sharedKey' OR payment.values_json->>'fundingAmount' IS DISTINCT FROM v->>'fundingAmount' OR payment.values_json->>'direction' IS DISTINCT FROM v->>'direction' OR source->>'state'<>'confirmed' OR (source->>'advance')::numeric<>0 OR EXISTS(SELECT 1 FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.source_id=payment.id) THEN PERFORM salapiya_p3.fail('Confirmed complete adopted coverage required for clearing');END IF;
     covered:=0;
     FOR line IN SELECT * FROM jsonb_each(source->'allocations') LOOP
       IF NOT EXISTS(SELECT 1 FROM salapiya_p2.current_revision z WHERE z.profile_id=p AND z.values_json->>'sharedMode'='bill' AND z.values_json->>'sharedGroup'=v->>'sharedGroup' AND z.values_json->>'sharedKey'=line.key AND z.values_json->>'sharedRevision'=g->'bills'->line.key->'revisions'->-1->>'id') THEN PERFORM salapiya_p3.fail('Adopt and review all private bill sources first');END IF;
       covered:=covered+(line.value->>'amount')::numeric;
     END LOOP;
     IF covered<>amount THEN PERFORM salapiya_p3.fail('Incomplete private source coverage');END IF;
     original:=payment.id;
     posts:=jsonb_build_array(salapiya_p2.post('shared_clearing',-effect,d),salapiya_p2.post(CASE WHEN effect>0 THEN 'shared_payable' ELSE 'shared_receivable' END,effect,d));
   END IF;kind:='adjustment';total:=amount;
 ELSIF mode='refund' THEN
   FOR b IN SELECT value FROM jsonb_each(g->'bills') LOOP
     SELECT f INTO source FROM jsonb_array_elements(b->'refunds') f WHERE f->>'id'=v->>'sharedKey';EXIT WHEN source IS NOT NULL;
   END LOOP;
   IF source IS NULL OR source->>'id' IS DISTINCT FROM v->>'sharedRevision' OR amount<>coalesce((source->'received'->>me)::numeric,0) OR share<>coalesce((source->'credits'->>me)::numeric,0) THEN PERFORM salapiya_p3.fail('Private refund source changed');END IF;
   posts:=jsonb_build_array(salapiya_p2.post('cash',amount,d,v->>'account'),salapiya_p2.post('expense',-share,d,NULL,v->>'category'),salapiya_p2.post(CASE WHEN share>=amount THEN 'shared_receivable' ELSE 'shared_payable' END,share-amount,d));kind:='refund';total:=share;
 ELSE PERFORM salapiya_p3.fail('Unsupported private shared effect');END IF;
 IF old.id IS NOT NULL AND mode<>'bill' THEN PERFORM salapiya_p3.fail('Payment/refund cash corrections require separate retained evidence');END IF;
 SELECT coalesce(jsonb_agg(e),'[]') INTO posts FROM jsonb_array_elements(posts) e WHERE (e->>'amount')::numeric<>0;
 FOR x IN SELECT value FROM jsonb_array_elements(posts) LOOP
   IF abs((x->>'amount')::numeric)>100000000000 THEN PERFORM salapiya_p3.fail('Private component outside supported range');END IF;
   IF x->>'ledger'='expense' AND NOT EXISTS(SELECT 1 FROM salapiya_p2.category c WHERE c.profile_id=p AND c.id=x->>'category' AND c.kind='expense') THEN PERFORM salapiya_p3.fail('Private expense category unavailable');END IF;
   IF x->>'ledger'='cash' THEN
     aid:=(x->>'account')::uuid;
     IF NOT EXISTS(SELECT 1 FROM salapiya_p2.account a WHERE a.profile_id=p AND a.id=aid AND NOT a.archived AND a.cutoff<d) THEN PERFORM salapiya_p3.fail('Private account unavailable or before cutoff');END IF;
     FOR line IN SELECT DISTINCT effective_date FROM salapiya_p2.posting z WHERE z.profile_id=p AND z.account_id=aid AND effective_date>=d UNION SELECT d LOOP
       running:=salapiya_p2.balance(p,aid,line.effective_date,old.id)+(x->>'amount')::numeric;
       IF running<0 AND v->>'acknowledge' IS DISTINCT FROM 'true' THEN PERFORM salapiya_p3.fail('Negative balance requires acknowledgement');END IF;
     END LOOP;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('account',NULL,'category',NULL,'archiveId',NULL,'revision',jsonb_build_object('id',cid::text,'actionId',coalesce(old.action_id,cid)::text,'kind',kind,'change',CASE WHEN old.id IS NULL THEN 'create' ELSE 'replace' END,'date',d,'title',v->>'name','amount',total::text,'number',coalesce(old.revision_no,0)+1,'previous',old.id::text,'source',original::text,'values',v,'postings',posts));
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.plan_p2(uuid,uuid,jsonb,bigint),salapiya_p2.plan(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
