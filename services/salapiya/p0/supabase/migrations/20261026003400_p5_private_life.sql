BEGIN;
CREATE SCHEMA salapiya_p5;
REVOKE ALL ON SCHEMA salapiya_p5 FROM PUBLIC,anon,authenticated;
CREATE TABLE salapiya_p5.record(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,profile_id uuid NOT NULL REFERENCES public.p2_profile(id),
 kind text NOT NULL,version integer NOT NULL CHECK(version>0),fields jsonb NOT NULL,
 UNIQUE(profile_id,id));
CREATE TABLE salapiya_p5.receipt(
 owner_id uuid NOT NULL,id uuid NOT NULL,payload text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(owner_id,id));
CREATE TABLE public.p5_command(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL,profile_id uuid NOT NULL REFERENCES public.p2_profile(id),
 payload text NOT NULL,sequence_no bigint NOT NULL,recorded_at text NOT NULL,UNIQUE(profile_id,sequence_no));
ALTER TABLE public.p5_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p5_command FORCE ROW LEVEL SECURITY;
CREATE POLICY p5_private_owner ON public.p5_command FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
REVOKE ALL ON public.p5_command FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.p5_command TO authenticated;
ALTER TABLE salapiya_p5.record ENABLE ROW LEVEL SECURITY;
ALTER TABLE salapiya_p5.record FORCE ROW LEVEL SECURITY;
ALTER TABLE salapiya_p5.receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE salapiya_p5.receipt FORCE ROW LEVEL SECURITY;

CREATE FUNCTION salapiya_p5.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'immutable Life evidence' USING ERRCODE='22023';END $$;
CREATE TRIGGER p5_history_immutable BEFORE UPDATE OR DELETE ON public.p5_command FOR EACH ROW EXECUTE FUNCTION salapiya_p5.immutable();
CREATE TRIGGER p5_receipt_immutable BEFORE UPDATE OR DELETE ON salapiya_p5.receipt FOR EACH ROW EXECUTE FUNCTION salapiya_p5.immutable();

CREATE FUNCTION salapiya_p5.day(v text,optional boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d date;BEGIN
 IF optional AND v='' THEN RETURN;END IF;
 IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'1900-01-01' OR v>'2200-12-31' THEN RAISE EXCEPTION 'invalid Life civil date' USING ERRCODE='22023';END IF;
 d:=v::date;IF to_char(d,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'invalid Life civil date' USING ERRCODE='22023';END IF;
END $$;

CREATE FUNCTION salapiya_p5.validate(kind text,v jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['title','status','notes','archived'];x record;instant timestamptz;matches timestamptz[];
BEGIN
 IF kind='task' THEN keys:=keys||ARRAY['detail','due','priority','completed'];
 ELSIF kind IN ('learning','book') THEN keys:=keys||ARRAY['detail','due','total','progress','started','completed'];IF kind='book' THEN keys:=keys||'rating'::text;END IF;
 ELSIF kind IN ('personal','careerEvent') THEN keys:=keys||ARRAY['date','time','timezone','fold','utc','location','outcome'];IF kind='careerEvent' THEN keys:=keys||ARRAY['application','eventKind'];END IF;
 ELSIF kind='document' THEN keys:=keys||ARRAY['application','sourceVersion','mime','size','checksum'];
 ELSIF kind='application' THEN keys:=keys||ARRAY['company','date','stageDate','location','arrangement','postingUrl','source','salaryMin','salaryMax','currency','salaryPeriod','technologies','description','contact','resume','nextAction','followUp'];
 ELSE RAISE EXCEPTION 'unsupported Life preset' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(v)<>'object' OR v-keys<>'{}'::jsonb OR NOT(v ?& keys) THEN RAISE EXCEPTION 'unsupported Life fields' USING ERRCODE='22023';END IF;
 FOR x IN SELECT key,value FROM jsonb_each(v) LOOP
  IF jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}')>(CASE WHEN x.key IN ('notes','description') THEN 20000 ELSE 2000 END) THEN RAISE EXCEPTION 'invalid bounded Life field' USING ERRCODE='22023';END IF;
 END LOOP;
 IF length(btrim(v->>'title')) NOT BETWEEN 1 AND 200 OR v->>'title'<>btrim(v->>'title') OR v->>'archived' NOT IN ('true','false') THEN RAISE EXCEPTION 'invalid Life title or archival state' USING ERRCODE='22023';END IF;
 IF kind IN ('task','learning','book') THEN
  IF v->>'status' NOT IN ('Not started','In progress','Completed','On hold') THEN RAISE EXCEPTION 'invalid preset status' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p5.day(v->>'due',true);PERFORM salapiya_p5.day(v->>'completed',true);
  IF kind='task' THEN
   IF v->>'priority' NOT IN ('High','Normal','Low') THEN RAISE EXCEPTION 'invalid priority' USING ERRCODE='22023';END IF;
  ELSE
   PERFORM salapiya_p5.day(v->>'started',true);
   IF v->>'started'<>'' AND v->>'completed'<>'' AND v->>'started'>v->>'completed' THEN RAISE EXCEPTION 'invalid completion date order' USING ERRCODE='22023';END IF;
   IF v->>'total' !~ '^[1-9][0-9]{0,6}$' OR v->>'progress' !~ '^(0|[1-9][0-9]{0,6})$' OR (v->>'total')::int>1000000 OR (v->>'progress')::int>(v->>'total')::int THEN RAISE EXCEPTION 'invalid progress bounds' USING ERRCODE='22023';END IF;
   IF kind='book' AND v->>'rating' NOT IN ('','1','2','3','4','5') THEN RAISE EXCEPTION 'invalid rating' USING ERRCODE='22023';END IF;
  END IF;
 ELSIF kind='document' THEN
  IF v->>'status'<>'Linked' OR v->>'application' !~ '^[0-9a-f-]{36}$' OR v->>'sourceVersion' !~ '^[1-9][0-9]{0,6}$' OR (v->>'sourceVersion')::int>1000000 OR v->>'mime' NOT IN ('application/pdf','image/jpeg','image/png') OR v->>'size' !~ '^[1-9][0-9]{0,7}$' OR (v->>'size')::int>10485760 OR v->>'checksum' !~ '^[a-f0-9]{64}$' OR v->>'title' ~ '[\\/:[:cntrl:]]' THEN RAISE EXCEPTION 'invalid private Career document' USING ERRCODE='22023';END IF;
 ELSIF kind='application' THEN
  IF v->>'status' NOT IN ('Saved','Applied','Screening','Interview','Technical assessment','Final interview','Offer','Accepted','Rejected','Withdrawn','Declined offer','Expired offer','Employer-cancelled opening') OR length(btrim(v->>'company')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid Career stage or company' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p5.day(v->>'date',v->>'status'='Saved');PERFORM salapiya_p5.day(v->>'stageDate');PERFORM salapiya_p5.day(v->>'followUp',true);
  IF v->>'arrangement' NOT IN ('onsite','hybrid','remote','unspecified') OR v->>'currency' !~ '^[A-Z]{3}$' OR v->>'salaryPeriod' NOT IN ('hour','month','year') THEN RAISE EXCEPTION 'invalid Career arrangement or salary context' USING ERRCODE='22023';END IF;
  IF (v->>'salaryMin'<>'' AND v->>'salaryMin' !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$') OR (v->>'salaryMax'<>'' AND v->>'salaryMax' !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$') OR (v->>'salaryMin'<>'' AND v->>'salaryMax'<>'' AND (v->>'salaryMin')::numeric>(v->>'salaryMax')::numeric) THEN RAISE EXCEPTION 'invalid exact Career salary bounds' USING ERRCODE='22023';END IF;
  IF v->>'postingUrl'<>'' AND (v->>'postingUrl' !~ '^https?://[^/@[:space:]]+' OR v->>'postingUrl' ~ '^https?://[^/]*@') THEN RAISE EXCEPTION 'invalid posting URL' USING ERRCODE='22023';END IF;
 ELSE
  PERFORM salapiya_p5.day(v->>'date');
  IF v->>'status' NOT IN ('Scheduled','Completed','Cancelled') OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v->>'timezone') OR v->>'fold' NOT IN ('','Earlier','Later') THEN RAISE EXCEPTION 'invalid scheduled event context' USING ERRCODE='22023';END IF;
  IF v->>'time'='' THEN
   IF v->>'utc'<>'' THEN RAISE EXCEPTION 'all-day event must remain a civil date' USING ERRCODE='22023';END IF;
  ELSE
   IF v->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR v->>'utc' !~ 'Z$' THEN RAISE EXCEPTION 'invalid event time' USING ERRCODE='22023';END IF;
   instant:=(v->>'utc')::timestamptz;
   IF to_char(instant AT TIME ZONE (v->>'timezone'),'YYYY-MM-DD HH24:MI:SS')<>((v->>'date')||' '||(v->>'time')||':00') THEN RAISE EXCEPTION 'UTC and original timezone disagree' USING ERRCODE='22023';END IF;
   SELECT array_agg(t ORDER BY t) INTO matches FROM generate_series(instant-interval '3 hours',instant+interval '3 hours',interval '15 minutes') t WHERE to_char(t AT TIME ZONE (v->>'timezone'),'YYYY-MM-DD HH24:MI:SS')=((v->>'date')||' '||(v->>'time')||':00');
   IF cardinality(matches)>1 AND (v->>'fold'='' OR (v->>'fold'='Earlier' AND instant<>matches[1]) OR (v->>'fold'='Later' AND instant<>matches[cardinality(matches)])) THEN RAISE EXCEPTION 'explicit DST occurrence required' USING ERRCODE='22023';END IF;
  END IF;
  IF kind='careerEvent' THEN
   IF v->>'application' !~ '^[0-9a-f-]{36}$' OR v->>'eventKind' NOT IN ('Interview','Assessment','Follow-up','Submission','Response','Offer','No response','Note') OR (v->>'eventKind' IN ('Interview','Assessment') AND v->>'time'='') OR (v->>'eventKind' IN ('Submission','Response','Offer','No response','Note') AND v->>'status'<>'Completed') THEN RAISE EXCEPTION 'invalid Career event or observation' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
END $$;

CREATE FUNCTION public.p5_submit_command(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();cmd jsonb;p uuid;rid uuid;k text;v jsonb;
 prior salapiya_p5.receipt;old salapiya_p5.record;parent salapiya_p5.record;seq bigint;result jsonb;expected integer;message text;
BEGIN
 IF command_id IS NULL OR command_payload IS NULL OR octet_length(command_payload)>131072 THEN RAISE EXCEPTION 'invalid Life command size or identity' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,5));
 SELECT * INTO prior FROM salapiya_p5.receipt WHERE owner_id=actor AND id=command_id;
 IF FOUND THEN
  IF prior.payload<>command_payload THEN RAISE EXCEPTION 'Life command payload mismatch' USING ERRCODE='22023';END IF;
  RETURN prior.result;
 END IF;
 BEGIN
  cmd:=command_payload::jsonb;
  IF jsonb_typeof(cmd)<>'object' OR cmd-ARRAY['contract','presetVersion','owner','record','type','expectedVersion','fields','reason','recordedAt']<>'{}'::jsonb OR NOT(cmd ?& ARRAY['contract','presetVersion','owner','record','type','expectedVersion','fields','reason','recordedAt']) OR cmd->'contract'<>'5'::jsonb OR cmd->'presetVersion'<>'1'::jsonb OR jsonb_typeof(cmd->'expectedVersion')<>'number' OR cmd->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,6})$' OR length(btrim(cmd->>'reason')) NOT BETWEEN 1 AND 2000 OR cmd->>'recordedAt' !~ 'Z$' THEN RAISE EXCEPTION 'unsupported Life command' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(cmd) x WHERE x.key IN ('owner','record','type','reason','recordedAt') AND jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'invalid Life command field types' USING ERRCODE='22023';END IF;
  PERFORM (cmd->>'recordedAt')::timestamptz;
  p:=(cmd->>'owner')::uuid;rid:=(cmd->>'record')::uuid;k:=cmd->>'type';v:=cmd->'fields';expected:=(cmd->>'expectedVersion')::integer;
  IF expected>1000000 OR NOT EXISTS(SELECT 1 FROM public.p2_profile WHERE id=p AND owner_id=actor) THEN RAISE EXCEPTION 'owned private profile required' USING ERRCODE='22023';END IF;
  PERFORM salapiya_p5.validate(k,v);
  SELECT * INTO old FROM salapiya_p5.record WHERE id=rid;
  IF coalesce(old.version,0)<>expected OR (old.id IS NOT NULL AND (old.owner_id<>actor OR old.profile_id<>p OR old.kind<>k)) THEN RAISE EXCEPTION 'Life source version changed; review current record' USING ERRCODE='22023';END IF;
  IF k='careerEvent' THEN
   SELECT * INTO parent FROM salapiya_p5.record WHERE id=(v->>'application')::uuid AND profile_id=p AND owner_id=actor AND kind='application';
   IF parent.id IS NULL OR parent.fields->>'archived'='true' OR parent.fields->>'status' IN ('Accepted','Rejected','Withdrawn','Declined offer','Expired offer','Employer-cancelled opening') OR (old.id IS NOT NULL AND old.fields->>'application'<>v->>'application') THEN RAISE EXCEPTION 'active owned Career application required' USING ERRCODE='22023';END IF;
  END IF;
  IF k='document' THEN
   SELECT * INTO parent FROM salapiya_p5.record WHERE id=(v->>'application')::uuid AND profile_id=p AND owner_id=actor AND kind='application';
   IF parent.id IS NULL OR (old.id IS NULL AND parent.version<>(v->>'sourceVersion')::int) OR (old.id IS NOT NULL AND old.fields-ARRAY['archived','notes']<>v-ARRAY['archived','notes']) THEN RAISE EXCEPTION 'owned immutable Career document source required' USING ERRCODE='22023';END IF;
   IF old.id IS NULL AND ((SELECT count(*) FROM salapiya_p5.record WHERE profile_id=p AND kind='document')>=1000 OR coalesce((SELECT sum((fields->>'size')::bigint) FROM salapiya_p5.record WHERE profile_id=p AND kind='document'),0)+(v->>'size')::bigint>1073741824) THEN RAISE EXCEPTION 'Career document metadata capacity exceeded' USING ERRCODE='22023';END IF;
  END IF;
  SELECT count(*)+1 INTO seq FROM public.p5_command WHERE profile_id=p;
  IF seq>20000 OR (expected=0 AND (SELECT count(*) FROM salapiya_p5.record WHERE profile_id=p)>=10000) THEN RAISE EXCEPTION 'bounded Life history capacity exceeded' USING ERRCODE='22023';END IF;
  INSERT INTO salapiya_p5.record VALUES(rid,actor,p,k,expected+1,v) ON CONFLICT(id) DO UPDATE SET version=excluded.version,fields=excluded.fields;
  INSERT INTO public.p5_command VALUES(command_id,actor,p,command_payload,seq,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  result:=jsonb_build_object('id',command_id,'owner_id',actor,'profile_id',p,'outcome','accepted','sequence_no',seq,'reason',NULL);
 EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range OR unique_violation OR foreign_key_violation OR check_violation THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  result:=jsonb_build_object('id',command_id,'owner_id',actor,'profile_id',cmd->>'owner','outcome','rejected','reason',CASE WHEN message='Life source version changed; review current record' THEN message ELSE 'Invalid, unavailable or incompatible private Life command; review the retained draft.' END);
 END;
 INSERT INTO salapiya_p5.receipt VALUES(actor,command_id,command_payload,result);
 RETURN result;
END $$;

CREATE FUNCTION public.p5_boundary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();BEGIN
 RETURN (SELECT jsonb_build_object('profile_id',p.id,'revision',(SELECT count(*) FROM public.p5_command c WHERE c.profile_id=p.id)) FROM public.p2_profile p WHERE p.owner_id=actor);
END $$;
CREATE FUNCTION public.p5_receipt(command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();BEGIN
 RETURN (SELECT result FROM salapiya_p5.receipt WHERE owner_id=actor AND id=command_id);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA salapiya_p5 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p5_submit_command(uuid,text),public.p5_boundary(),public.p5_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p5_submit_command(uuid,text),public.p5_boundary(),public.p5_receipt(uuid) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN GRANT SELECT ON public.p5_command TO salapiya_p0_replication;END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync' AND puballtables) OR EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND (schemaname<>'public' OR tablename NOT IN ('p0_profile','p0_accepted','p2_profile','p2_command','p3_group','p3_resource','p3_private_review'))) THEN RAISE EXCEPTION 'unexpected publication scope; preserve and review';END IF;
  ALTER PUBLICATION powersync ADD TABLE public.p5_command;
 END IF;
END $$;
COMMIT;
