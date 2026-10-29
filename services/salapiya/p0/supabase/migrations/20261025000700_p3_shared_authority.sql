BEGIN;
CREATE SCHEMA salapiya_p3;
REVOKE ALL ON SCHEMA salapiya_p3 FROM PUBLIC,anon,authenticated;
CREATE TABLE salapiya_p3.groups(id uuid PRIMARY KEY, version bigint NOT NULL, document jsonb NOT NULL);
CREATE TABLE salapiya_p3.receipt(actor uuid NOT NULL,id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor,id));
CREATE TABLE salapiya_p3.invite(id uuid PRIMARY KEY,group_id uuid NOT NULL REFERENCES salapiya_p3.groups,
 inviter uuid NOT NULL,participant uuid,email text NOT NULL,token_hash text NOT NULL UNIQUE,
 expires timestamptz NOT NULL,used_by uuid,revoked boolean NOT NULL DEFAULT false,version bigint NOT NULL);
-- Only pre-authorized, sanitized audience snapshots reach CDC. No subscription
-- parameter, private funding information, invitation or private receipt is replicated.
CREATE TABLE public.p3_group(id text PRIMARY KEY,owner_id uuid NOT NULL,group_id uuid NOT NULL,
 version bigint NOT NULL,document text NOT NULL,UNIQUE(owner_id,group_id));
CREATE INDEX p3_group_owner ON public.p3_group(owner_id);
ALTER TABLE public.p3_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p3_group FORCE ROW LEVEL SECURITY;
CREATE POLICY own_p3_snapshot ON public.p3_group FOR SELECT TO authenticated USING(owner_id=auth.uid());
GRANT SELECT ON public.p3_group TO authenticated;
REVOKE ALL ON salapiya_p3.groups,salapiya_p3.receipt,salapiya_p3.invite FROM PUBLIC,anon,authenticated;

CREATE FUNCTION salapiya_p3.fail(message text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION '%',message USING ERRCODE='22023'; END $$;
CREATE FUNCTION salapiya_p3.minor(v jsonb,positive boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n numeric; BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v#>>'{}') !~ '^(0|[1-9][0-9]{0,18})$' THEN PERFORM salapiya_p3.fail('Use exact minor-unit strings'); END IF;
 n:=(v#>>'{}')::numeric;
 IF n>9223372036854775807 OR (positive AND n=0) THEN PERFORM salapiya_p3.fail('Amount outside supported range'); END IF;
 RETURN n; END $$;
CREATE FUNCTION salapiya_p3.text(v jsonb,k text) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t text:=v->>k; BEGIN
 IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' OR length(btrim(t)) NOT BETWEEN 1 AND 2000 THEN PERFORM salapiya_p3.fail('Required text: '||k); END IF;
 RETURN btrim(t); END $$;
CREATE FUNCTION salapiya_p3.axis(axis jsonb,people jsonb,total numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e record; n numeric:=0; BEGIN
 IF jsonb_typeof(axis) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_each(axis)) NOT BETWEEN 1 AND 100 THEN PERFORM salapiya_p3.fail('Select 1–100 participants'); END IF;
 FOR e IN SELECT * FROM jsonb_each(axis) LOOP
   IF NOT people ? e.key THEN PERFORM salapiya_p3.fail('Unknown participant'); END IF;
   n:=n+salapiya_p3.minor(e.value);
 END LOOP;
 IF n<>total THEN PERFORM salapiya_p3.fail('Allocation total differs from bill total'); END IF;
END $$;
-- Web attribution policy 1: offset own paid/share; match debtors/creditors
-- in UUID order per source, then retain reciprocal settlement edges.
CREATE FUNCTION salapiya_p3.edges(doc jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE out jsonb:='[]'; b record; p record; r jsonb; f jsonb; net numeric; owes jsonb; credits jsonb;
 d record; c record; used numeric; s record; BEGIN
 FOR b IN SELECT * FROM jsonb_each(doc->'bills') ORDER BY key LOOP
   r:=b.value->'revisions'->-1; owes:='{}'; credits:='{}';
   FOR p IN SELECT * FROM jsonb_each(doc->'people') ORDER BY key LOOP
     net:=coalesce((r->'paid'->>p.key)::numeric,0)-coalesce((r->'shares'->>p.key)::numeric,0);
     FOR f IN SELECT value FROM jsonb_array_elements(b.value->'refunds') LOOP
       net:=net-coalesce((f->'received'->>p.key)::numeric,0)+coalesce((f->'credits'->>p.key)::numeric,0);
     END LOOP;
     IF net<0 THEN owes:=owes||jsonb_build_object(p.key,(-net)::text); END IF;
     IF net>0 THEN credits:=credits||jsonb_build_object(p.key,net::text); END IF;
   END LOOP;
   FOR d IN SELECT * FROM jsonb_each_text(owes) ORDER BY key LOOP
     FOR c IN SELECT * FROM jsonb_each_text(credits) ORDER BY key LOOP
       used:=least((owes->>d.key)::numeric,(credits->>c.key)::numeric);
       IF used>0 THEN out:=out||jsonb_build_array(jsonb_build_object('sender',d.key,'recipient',c.key,'amount',used::text,'bill',b.key,'revision',r->>'id','source',b.key)); END IF;
       owes:=owes||jsonb_build_object(d.key,((owes->>d.key)::numeric-used)::text);
       credits:=credits||jsonb_build_object(c.key,((credits->>c.key)::numeric-used)::text);
     END LOOP;
   END LOOP;
 END LOOP;
 FOR s IN SELECT * FROM jsonb_each(doc->'settlements') LOOP
   IF s.value->>'state'='confirmed' THEN
     FOR p IN SELECT * FROM jsonb_each(s.value->'allocations') LOOP
       out:=out||jsonb_build_array(jsonb_build_object('sender',s.value->>'recipient','recipient',s.value->>'sender','amount',p.value->>'amount','bill',p.key,'source',s.key));
     END LOOP;
     IF (s.value->>'advance')::numeric>0 THEN out:=out||jsonb_build_array(jsonb_build_object('sender',s.value->>'recipient','recipient',s.value->>'sender','amount',s.value->>'advance','bill',NULL,'source',s.key)); END IF;
   END IF;
 END LOOP;
 RETURN out; END $$;
CREATE FUNCTION salapiya_p3.due(edges jsonb,sender text,recipient text,bill text DEFAULT NULL) RETURNS numeric LANGUAGE sql SET search_path='' AS $$
 SELECT coalesce(sum(CASE WHEN e->>'sender'=sender AND e->>'recipient'=recipient THEN (e->>'amount')::numeric
 WHEN e->>'sender'=recipient AND e->>'recipient'=sender THEN -(e->>'amount')::numeric ELSE 0 END),0)
 FROM jsonb_array_elements(edges) e WHERE bill IS NULL OR e->>'bill'=bill $$;

CREATE FUNCTION salapiya_p3.publish(g uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE doc jsonb; p record; viewdoc jsonb; bills jsonb; payments jsonb; b record; s record; previous public.p3_group; BEGIN
 SELECT document INTO doc FROM salapiya_p3.groups WHERE id=g;
 FOR p IN SELECT * FROM jsonb_each(doc->'people') LOOP
   IF p.value->>'user' IS NULL THEN CONTINUE; END IF;
   viewdoc:=doc;
   IF NOT (p.value->>'active')::boolean THEN
     bills:='{}'; payments:='{}';
     FOR b IN SELECT * FROM jsonb_each(doc->'bills') LOOP
       IF p.value->'entitled' ? b.key THEN bills:=bills||jsonb_build_object(b.key,b.value); END IF;
     END LOOP;
     FOR s IN SELECT * FROM jsonb_each(doc->'settlements') LOOP
       IF (s.value->>'sender'=p.key OR s.value->>'recipient'=p.key) AND
         NOT EXISTS(SELECT 1 FROM jsonb_object_keys(s.value->'allocations') k WHERE NOT bills ? k)
       THEN payments:=payments||jsonb_build_object(s.key,s.value); END IF;
     END LOOP;
     -- No unrelated post-exit descriptions, activity, membership or group version.
     SELECT * INTO previous FROM public.p3_group WHERE owner_id=(p.value->>'user')::uuid AND group_id=g;
     viewdoc:=coalesce(previous.document::jsonb,doc)||jsonb_build_object('bills',bills,'settlements',payments,'version',NULL,'complete',false);
     viewdoc:=jsonb_set(viewdoc,ARRAY['people',p.key],p.value);
     viewdoc:=jsonb_set(viewdoc,'{activity}','[]');
   ELSE viewdoc:=viewdoc||jsonb_build_object('complete',true); END IF;
   INSERT INTO public.p3_group VALUES(g::text||':'||(p.value->>'user'),(p.value->>'user')::uuid,g,1,viewdoc::text)
   ON CONFLICT(owner_id,group_id) DO UPDATE SET version=p3_group.version+1,document=excluded.document
   WHERE p3_group.document IS DISTINCT FROM excluded.document;
 END LOOP;
END $$;

CREATE FUNCTION salapiya_p3.apply(actor uuid,cid uuid,cmd jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_column
DECLARE g uuid:=(cmd->>'group')::uuid; op text:=cmd->>'op'; v jsonb:=cmd->'values'; doc jsonb; people jsonb;
 me text; owner boolean; active boolean; pid text; target text; b jsonb; r jsonb; s jsonb; x jsonb; f jsonb;
 key text; total numeric; n numeric; paid jsonb; shares jsonb; received numeric; credit numeric;
 edges jsonb; allocations jsonb; allocated numeric; due numeric; use numeric; remain numeric;
 inv salapiya_p3.invite; email text; seq bigint; stamp text:=clock_timestamp()::text; result jsonb:='{}';
BEGIN
 IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR cmd-ARRAY['contract','group','op','version','values']<>'{}' OR
   NOT(cmd ?& ARRAY['contract','group','op','version','values']) OR cmd->'contract' IS DISTINCT FROM '3' OR
   jsonb_typeof(v) IS DISTINCT FROM 'object' OR octet_length(cmd::text)>131072 OR g IS NULL
 THEN PERFORM salapiya_p3.fail('Invalid group command'); END IF;
 -- Bound form keys per operation: private account/funding values can never enter
 -- group receipts, audits or a replicated document.
 IF v - (CASE op
 WHEN 'create' THEN ARRAY['name','participant','display'] WHEN 'manual' THEN ARRAY['name','participant']
 WHEN 'invite' THEN ARRAY['email','participant','hash'] WHEN 'revoke' THEN ARRAY['invitation']
 WHEN 'accept' THEN ARRAY['token','consent','display','participant']
 WHEN 'bill' THEN ARRAY['name','date','total','paid','shares','method']
 WHEN 'correct' THEN ARRAY['bill','revision','name','date','total','paid','shares','method','reason']
 WHEN 'refund' THEN ARRAY['bill','revision','date','total','received','credits','reason']
 WHEN 'report' THEN ARRAY['sender','recipient','date','amount','mode','allocations','acknowledge']
 WHEN 'resolve' THEN ARRAY['settlement','state','reason','acknowledge']
 WHEN 'leave' THEN ARRAY['participant','reason'] WHEN 'remove' THEN ARRAY['participant','reason']
 WHEN 'transfer' THEN ARRAY['participant','reason'] WHEN 'archive' THEN ARRAY['reason','archived']
 ELSE ARRAY[]::text[] END) <> '{}' THEN PERFORM salapiya_p3.fail('Unsupported group fields'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(g::text,3));
 SELECT document,version INTO doc,seq FROM salapiya_p3.groups WHERE id=g FOR UPDATE;
 IF op='create' THEN
   IF doc IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.p2_profile WHERE owner_id=actor) THEN PERFORM salapiya_p3.fail('Connected profile required or group already exists'); END IF;
   pid:=(v->>'participant')::uuid::text;
   doc:=jsonb_build_object('id',g::text,'name',salapiya_p3.text(v,'name'),'owner',pid,'archived',false,'version',0,
    'people',jsonb_build_object(pid,jsonb_build_object('name',salapiya_p3.text(v,'display'),'user',actor::text,'kind','registered','active',true,'intervals',jsonb_build_array(jsonb_build_object('joined',stamp,'role','owner')),'entitled','[]'::jsonb)),
    'bills','{}'::jsonb,'settlements','{}'::jsonb,'activity','[]'::jsonb);
   seq:=0;
   INSERT INTO salapiya_p3.groups VALUES(g,seq,doc);
 ELSE
   IF doc IS NULL THEN PERFORM salapiya_p3.fail('Group unavailable'); END IF;
   SELECT key INTO me FROM jsonb_each(doc->'people') WHERE value->>'user'=actor::text;
   owner:=coalesce(doc->>'owner'=me,false); active:=coalesce((doc->'people'->me->>'active')::boolean,false);
   IF op<>'accept' AND me IS NULL THEN PERFORM salapiya_p3.fail('Group unavailable'); END IF;
   IF NOT active AND op NOT IN ('accept','resolve') THEN PERFORM salapiya_p3.fail('Current membership required'); END IF;
   IF (doc->>'archived')::boolean AND op NOT IN ('resolve','archive','leave','transfer') THEN PERFORM salapiya_p3.fail('Group is archived'); END IF;
   IF op NOT IN ('accept','bill','report') AND (cmd->>'version')::bigint IS DISTINCT FROM seq THEN PERFORM salapiya_p3.fail('Group changed; refresh and review'); END IF;
 END IF;
 people:=doc->'people';
 CASE op
 WHEN 'create' THEN NULL;
 WHEN 'manual' THEN
   IF NOT owner OR (SELECT count(*) FROM jsonb_each(people))>=100 THEN PERFORM salapiya_p3.fail('Owner required; participant limit 100'); END IF;
   pid:=(v->>'participant')::uuid::text;
   IF people ? pid THEN PERFORM salapiya_p3.fail('Participant already exists'); END IF;
   doc:=jsonb_set(doc,ARRAY['people',pid],jsonb_build_object('name',salapiya_p3.text(v,'name'),'user',NULL,'kind','manual','active',true,'intervals','[]'::jsonb,'entitled','[]'::jsonb));
 WHEN 'invite' THEN
   IF NOT owner THEN PERFORM salapiya_p3.fail('Owner required'); END IF;
   email:=lower(salapiya_p3.text(v,'email'));
   IF email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' OR v->>'hash' !~ '^[0-9a-f]{64}$' THEN PERFORM salapiya_p3.fail('Invalid invitation'); END IF;
   pid:=v->>'participant';
   IF pid IS NOT NULL AND (NOT people ? pid OR people->pid->>'kind'<>'manual' OR people->pid->>'user' IS NOT NULL) THEN PERFORM salapiya_p3.fail('Nominate an unclaimed manual participant'); END IF;
   INSERT INTO salapiya_p3.invite VALUES(cid,g,actor,pid::uuid,email,v->>'hash',clock_timestamp()+interval '7 days',NULL,false,seq+1);
   result:=jsonb_build_object('invitation',cid::text);
 WHEN 'revoke' THEN
   IF NOT owner THEN PERFORM salapiya_p3.fail('Owner required'); END IF;
   UPDATE salapiya_p3.invite SET revoked=true WHERE id=(v->>'invitation')::uuid AND group_id=g AND used_by IS NULL;
   IF NOT FOUND THEN PERFORM salapiya_p3.fail('Invitation unavailable'); END IF;
 WHEN 'accept' THEN
   SELECT * INTO inv FROM salapiya_p3.invite WHERE group_id=g AND token_hash=encode(sha256(convert_to(v->>'token','UTF8')),'hex') FOR UPDATE;
   SELECT lower(u.email) INTO email FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
   IF inv.id IS NULL OR inv.revoked OR inv.used_by IS NOT NULL OR inv.expires<=clock_timestamp() OR email IS DISTINCT FROM inv.email OR
     v->'consent' IS DISTINCT FROM 'true' OR (inv.participant IS NOT NULL AND inv.version<>seq) OR
     NOT EXISTS(SELECT 1 FROM jsonb_each(people) WHERE value->>'user'=inv.inviter::text AND (value->>'active')::boolean)
   THEN PERFORM salapiya_p3.fail('Invitation unavailable, expired, changed or wrong verified recipient'); END IF;
   IF me IS NOT NULL AND active THEN PERFORM salapiya_p3.fail('Already an active member'); END IF;
   pid:=coalesce(me,inv.participant::text,(v->>'participant')::uuid::text);
   IF pid IS NULL OR (me IS NOT NULL AND inv.participant IS NOT NULL AND me<>inv.participant::text) OR (me IS NULL AND inv.participant IS NULL AND people ? pid)
   THEN PERFORM salapiya_p3.fail('Identity claim requires review'); END IF;
   IF NOT people ? pid AND (SELECT count(*) FROM jsonb_each(people))>=100 THEN PERFORM salapiya_p3.fail('Participant limit 100'); END IF;
   x:=coalesce(people->pid,jsonb_build_object('name',salapiya_p3.text(v,'display'),'intervals','[]'::jsonb,'entitled','[]'::jsonb));
   x:=x||jsonb_build_object('user',actor::text,'kind','registered','active',true,'intervals',x->'intervals'||jsonb_build_array(jsonb_build_object('joined',stamp,'role','member','historyPolicy',1)));
   doc:=jsonb_set(doc,ARRAY['people',pid],x);
   UPDATE salapiya_p3.invite SET used_by=actor WHERE id=inv.id;
 WHEN 'bill','correct' THEN
   target:=CASE WHEN op='bill' THEN cid::text ELSE v->>'bill' END; b:=doc->'bills'->target;
   IF op='bill' AND (SELECT count(*) FROM jsonb_each(doc->'bills'))>=1000 THEN PERFORM salapiya_p3.fail('Bill limit 1000'); END IF;
   IF op='correct' THEN
     IF b IS NULL OR b->>'creator'<>me OR b->'revisions'->-1->>'id' IS DISTINCT FROM v->>'revision' THEN PERFORM salapiya_p3.fail('Creator and current revision required'); END IF;
     PERFORM salapiya_p3.text(v,'reason');
     IF jsonb_array_length(b->'revisions')>=100 THEN PERFORM salapiya_p3.fail('Revision limit 100'); END IF;
   END IF;
   total:=salapiya_p3.minor(v->'total',true); paid:=v->'paid'; shares:=v->'shares';
   PERFORM salapiya_p3.axis(paid,people,total); PERFORM salapiya_p3.axis(shares,people,total);
   IF v->>'method' NOT IN ('equal','exact') THEN PERFORM salapiya_p3.fail('Unsupported split method'); END IF;
   IF op='bill' AND EXISTS(SELECT 1 FROM jsonb_each(people) p WHERE NOT(p.value->>'active')::boolean AND (shares ? p.key OR coalesce((paid->>p.key)::numeric,0)>0)) THEN PERFORM salapiya_p3.fail('Former participant cannot enter a new bill'); END IF;
   IF v->>'method'='equal' THEN
     n:=(SELECT count(*) FROM jsonb_each(shares)); allocated:=0;
     FOR key IN SELECT jsonb_object_keys(shares) ORDER BY 1 LOOP
       use:=trunc(total/n)+CASE WHEN allocated<mod(total,n) THEN 1 ELSE 0 END; allocated:=allocated+1;
       IF (shares->>key)::numeric<>use THEN PERFORM salapiya_p3.fail('Equal split must follow canonical UUID remainder order'); END IF;
     END LOOP;
   END IF;
   FOR key IN SELECT jsonb_object_keys(people) LOOP
     received:=0;credit:=0;
     FOR f IN SELECT value FROM jsonb_array_elements(coalesce(b->'refunds','[]')) LOOP
       received:=received+coalesce((f->'received'->>key)::numeric,0); credit:=credit+coalesce((f->'credits'->>key)::numeric,0);
     END LOOP;
     IF received>coalesce((paid->>key)::numeric,0) OR credit>coalesce((shares->>key)::numeric,0) THEN PERFORM salapiya_p3.fail('Correction contradicts retained refund caps'); END IF;
   END LOOP;
   r:=jsonb_build_object('id',cid::text,'name',salapiya_p3.text(v,'name'),'date',salapiya_p2.day(v->>'date'),'total',total::text,'paid',paid,'shares',shares,'method',v->>'method','reason',v->>'reason','actor',actor::text,'at',stamp);
   b:=coalesce(b,jsonb_build_object('creator',me,'revisions','[]'::jsonb,'refunds','[]'::jsonb));
   b:=b||jsonb_build_object('revisions',b->'revisions'||jsonb_build_array(r)); doc:=jsonb_set(doc,ARRAY['bills',target],b);
 WHEN 'refund' THEN
   target:=v->>'bill';b:=doc->'bills'->target;r:=b->'revisions'->-1;
   IF b IS NULL OR b->>'creator'<>me OR r->>'id' IS DISTINCT FROM v->>'revision' THEN PERFORM salapiya_p3.fail('Creator and current revision required'); END IF;
   IF jsonb_array_length(b->'refunds')>=1000 THEN PERFORM salapiya_p3.fail('Refund limit 1000'); END IF;
   total:=salapiya_p3.minor(v->'total',true); PERFORM salapiya_p3.axis(v->'received',people,total);PERFORM salapiya_p3.axis(v->'credits',people,total);
   IF salapiya_p2.day(v->>'date')<r->>'date' THEN PERFORM salapiya_p3.fail('Refund precedes bill'); END IF;
   FOR key IN SELECT jsonb_object_keys(people) LOOP
     received:=coalesce((v->'received'->>key)::numeric,0);credit:=coalesce((v->'credits'->>key)::numeric,0);
     FOR f IN SELECT value FROM jsonb_array_elements(b->'refunds') LOOP received:=received+coalesce((f->'received'->>key)::numeric,0);credit:=credit+coalesce((f->'credits'->>key)::numeric,0); END LOOP;
     IF received>coalesce((r->'paid'->>key)::numeric,0) OR credit>coalesce((r->'shares'->>key)::numeric,0) THEN PERFORM salapiya_p3.fail('Refund exceeds remaining source cap'); END IF;
   END LOOP;
   f:=v||jsonb_build_object('id',cid::text,'actor',actor::text,'at',stamp,'reason',salapiya_p3.text(v,'reason'));
   doc:=jsonb_set(doc,ARRAY['bills',target,'refunds'],b->'refunds'||jsonb_build_array(f));
 WHEN 'report' THEN
   IF (SELECT count(*) FROM jsonb_each(doc->'settlements'))>=1000 THEN PERFORM salapiya_p3.fail('Settlement limit 1000'); END IF;
   pid:=v->>'sender'; target:=v->>'recipient';
   IF NOT people ? pid OR NOT people ? target OR pid=target OR (me<>pid AND NOT(owner AND people->pid->>'kind'<>'registered')) THEN PERFORM salapiya_p3.fail('Sender authority required'); END IF;
   total:=salapiya_p3.minor(v->'amount',true);PERFORM salapiya_p2.day(v->>'date');
   edges:=salapiya_p3.edges(doc);due:=salapiya_p3.due(edges,pid,target);allocations:='{}';allocated:=0;
   IF v->>'mode'='selected' THEN
     IF jsonb_typeof(v->'allocations') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_each(v->'allocations'))>100 THEN PERFORM salapiya_p3.fail('Select up to 100 sources'); END IF;
     FOR key,x IN SELECT * FROM jsonb_each(v->'allocations') LOOP
       b:=doc->'bills'->key;use:=salapiya_p3.minor(x->'amount',true);
       IF x-ARRAY['amount','revision']<>'{}' OR b IS NULL OR x->>'revision' IS DISTINCT FROM b->'revisions'->-1->>'id' OR use>salapiya_p3.due(edges,pid,target,key) THEN PERFORM salapiya_p3.fail('Selected source changed or exceeds capacity'); END IF;
       allocations:=allocations||jsonb_build_object(key,x);allocated:=allocated+use;
     END LOOP;
   ELSIF v->>'mode' IN ('full','custom') THEN
     IF v->>'mode'='full' AND total<>due THEN PERFORM salapiya_p3.fail('Full payment must equal current pairwise net'); END IF;
     remain:=greatest(0,least(total,due));
     FOR key IN SELECT jsonb_object_keys(doc->'bills') ORDER BY 1 LOOP
       use:=greatest(0,least(remain,salapiya_p3.due(edges,pid,target,key)));
       IF use>0 THEN allocations:=allocations||jsonb_build_object(key,jsonb_build_object('amount',use::text,'revision',doc->'bills'->key->'revisions'->-1->>'id'));allocated:=allocated+use;remain:=remain-use; END IF;
     END LOOP;
   ELSE PERFORM salapiya_p3.fail('Unsupported payment mode'); END IF;
   IF allocated>total OR ((allocated<total OR total>due) AND v->'acknowledge' IS DISTINCT FROM 'true') THEN PERFORM salapiya_p3.fail('Acknowledge advance or over-net payment explicitly'); END IF;
   s:=jsonb_build_object('id',cid::text,'sender',pid,'recipient',target,'amount',total::text,'date',v->>'date','allocations',allocations,'advance',(total-allocated)::text,'acknowledge',v->'acknowledge','state','pending','manual',false,'events',jsonb_build_array(jsonb_build_object('state','pending','actor',actor::text,'at',stamp)));
   doc:=jsonb_set(doc,ARRAY['settlements',cid::text],s);
 WHEN 'resolve' THEN
   target:=v->>'settlement';s:=doc->'settlements'->target;key:=v->>'state';pid:=s->>'recipient';
   IF s IS NULL OR key NOT IN ('confirmed','disputed','cancelled','reversed') THEN PERFORM salapiya_p3.fail('Settlement unavailable'); END IF;
   IF NOT active AND (s->>'sender'<>me AND pid<>me OR EXISTS(SELECT 1 FROM jsonb_object_keys(s->'allocations') a WHERE NOT(people->me->'entitled' ? a))) THEN PERFORM salapiya_p3.fail('Outside retained entitlement'); END IF;
   IF key='cancelled' THEN
     IF me<>s->>'sender' OR s->>'state' NOT IN ('pending','disputed') THEN PERFORM salapiya_p3.fail('Sender may cancel an open report'); END IF;
   ELSE
     IF me<>pid AND NOT(owner AND people->pid->>'kind'<>'registered') THEN PERFORM salapiya_p3.fail('Recipient authority required'); END IF;
     IF (key='reversed' AND s->>'state'<>'confirmed') OR (key<>'reversed' AND s->>'state'<>'pending') THEN PERFORM salapiya_p3.fail('Invalid settlement transition'); END IF;
   END IF;
   IF key<>'confirmed' THEN PERFORM salapiya_p3.text(v,'reason'); END IF;
   IF key='confirmed' THEN
     edges:=salapiya_p3.edges(doc);
     FOR pid,x IN SELECT * FROM jsonb_each(s->'allocations') LOOP
       IF x->>'revision' IS DISTINCT FROM doc->'bills'->pid->'revisions'->-1->>'id' OR (x->>'amount')::numeric>salapiya_p3.due(edges,s->>'sender',s->>'recipient',pid) THEN PERFORM salapiya_p3.fail('Payment source changed; cancel and review'); END IF;
     END LOOP;
     IF (s->>'amount')::numeric>salapiya_p3.due(edges,s->>'sender',s->>'recipient') AND s->'acknowledge' IS DISTINCT FROM 'true' THEN PERFORM salapiya_p3.fail('Relationship changed; review advance'); END IF;
     IF people->(s->>'recipient')->>'kind'<>'registered' THEN
       IF v->'acknowledge' IS DISTINCT FROM 'true' THEN PERFORM salapiya_p3.fail('Manual receipt is unverified; explicit acknowledgement required'); END IF;
       s:=s||jsonb_build_object('manual',true);
     END IF;
   END IF;
   s:=s||jsonb_build_object('state',key,'events',s->'events'||jsonb_build_array(jsonb_build_object('id',cid::text,'state',key,'actor',actor::text,'reason',v->>'reason','at',stamp,'manual',s->'manual')));
   doc:=jsonb_set(doc,ARRAY['settlements',target],s);
 WHEN 'leave','remove' THEN
   pid:=v->>'participant';
   IF NOT people ? pid OR NOT(people->pid->>'active')::boolean OR (op='leave' AND pid<>me) OR (op='remove' AND NOT owner) OR pid=doc->>'owner' THEN PERFORM salapiya_p3.fail('Transfer ownership before exit; current authority required'); END IF;
   PERFORM salapiya_p3.text(v,'reason');
   x:=people->pid; x:=x||jsonb_build_object('active',false,'entitled',(SELECT coalesce(jsonb_agg(k),'[]') FROM jsonb_object_keys(doc->'bills') k),'intervals',x->'intervals'||jsonb_build_array(jsonb_build_object('left',stamp,'actor',actor::text,'reason',v->>'reason')));
   doc:=jsonb_set(doc,ARRAY['people',pid],x);
 WHEN 'transfer' THEN
   pid:=v->>'participant';PERFORM salapiya_p3.text(v,'reason');
   IF NOT owner OR pid=me OR NOT people ? pid OR people->pid->>'kind'<>'registered' OR NOT(people->pid->>'active')::boolean THEN PERFORM salapiya_p3.fail('Transfer to an active registered member'); END IF;
   doc:=jsonb_set(doc,'{owner}',to_jsonb(pid));
 WHEN 'archive' THEN
   IF NOT owner OR jsonb_typeof(v->'archived') IS DISTINCT FROM 'boolean' THEN PERFORM salapiya_p3.fail('Owner required'); END IF;
   PERFORM salapiya_p3.text(v,'reason'); doc:=jsonb_set(doc,'{archived}',v->'archived');
 ELSE PERFORM salapiya_p3.fail('Unsupported group operation');
 END CASE;
 seq:=seq+1;doc:=jsonb_set(doc,'{version}',to_jsonb(seq));
 -- Tokens, token hashes, contact addresses and private fields never enter activity.
 doc:=jsonb_set(doc,'{activity}',doc->'activity'||jsonb_build_array(jsonb_build_object('id',cid::text,'op',op,'actor',actor::text,'at',stamp,'reason',v->>'reason')));
 UPDATE salapiya_p3.groups SET version=seq,document=doc WHERE id=g;
 PERFORM salapiya_p3.publish(g);
 RETURN result||jsonb_build_object('id',cid::text,'owner_id',actor::text,'group_id',g::text,'outcome','accepted','version',seq);
END $$;

CREATE FUNCTION public.p3_submit_command(command_id uuid,command_payload text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=salapiya_p0.require_current_session();cmd jsonb;fingerprint jsonb;prior salapiya_p3.receipt;result jsonb;message text; BEGIN
 IF command_id IS NULL OR command_payload IS NULL OR octet_length(command_payload)>131072 THEN PERFORM salapiya_p3.fail('Invalid command size'); END IF;
 cmd:=command_payload::jsonb;fingerprint:=cmd;
 IF cmd->>'op'='accept' THEN fingerprint:=jsonb_set(cmd,'{values,token}',to_jsonb(encode(sha256(convert_to(cmd->'values'->>'token','UTF8')),'hex'))); END IF;
 -- Actor lock prevents same-ID races without locking any private financial graph.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,30));
 SELECT * INTO prior FROM salapiya_p3.receipt WHERE salapiya_p3.receipt.actor=actor AND id=command_id;
 IF FOUND THEN IF prior.payload<>fingerprint THEN PERFORM salapiya_p3.fail('Command payload mismatch'); END IF;RETURN prior.result; END IF;
 BEGIN result:=salapiya_p3.apply(actor,command_id,cmd);
 EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR check_violation OR unique_violation OR not_null_violation THEN
 GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 result:=jsonb_build_object('id',command_id::text,'owner_id',actor::text,'group_id',cmd->>'group','outcome','rejected','reason',CASE WHEN SQLSTATE='22023' THEN message ELSE 'Invalid group command; review current sources' END);
 END;
 -- Invitation acceptance contains the secret only at the request boundary. Keep
 -- a digest for idempotency; never store raw invite codes in any server receipt.
 INSERT INTO salapiya_p3.receipt VALUES(actor,command_id,fingerprint,result);
 RETURN result; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salapiya_p3 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p3_submit_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p3_submit_command(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
