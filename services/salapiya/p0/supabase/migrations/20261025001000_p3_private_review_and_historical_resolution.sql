BEGIN;
CREATE TABLE public.p3_private_review(id uuid PRIMARY KEY,owner_id uuid NOT NULL,profile_id uuid NOT NULL,
 group_id uuid NOT NULL,bill_id uuid NOT NULL,private_revision uuid NOT NULL,source_stamp text NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(profile_id,owner_id) REFERENCES public.p2_profile(id,owner_id),
 FOREIGN KEY(private_revision,profile_id) REFERENCES salapiya_p2.revision(id,profile_id));
ALTER TABLE public.p3_private_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p3_private_review FORCE ROW LEVEL SECURITY;
CREATE POLICY own_p3_review ON public.p3_private_review FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE INDEX p3_private_review_owner ON public.p3_private_review(owner_id,profile_id);
GRANT SELECT ON public.p3_private_review TO authenticated;
CREATE TRIGGER p3_private_review_immutable BEFORE UPDATE OR DELETE ON public.p3_private_review FOR EACH ROW EXECUTE FUNCTION salapiya_p3.immutable();
CREATE FUNCTION salapiya_p3.source_stamp(b jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT b->'revisions'->-1->>'id'||':'||coalesce((SELECT string_agg(f->>'id',',' ORDER BY f->>'id') FROM jsonb_array_elements(b->'refunds') f),'') $$;
CREATE FUNCTION public.p3_retain_private_evidence(command_id uuid,profile_id uuid,group_id uuid,bill_id uuid,private_revision uuid,source_stamp text,reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE actor uuid:=salapiya_p0.require_current_session(); prior public.p3_private_review; r salapiya_p2.revision;doc jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO prior FROM public.p3_private_review q WHERE q.id=command_id;
 IF FOUND THEN
   IF prior.owner_id<>actor OR prior.profile_id<>profile_id OR prior.group_id<>group_id OR prior.bill_id<>bill_id OR prior.private_revision<>private_revision OR prior.source_stamp<>source_stamp OR prior.reason<>reason THEN PERFORM salapiya_p3.fail('Private review payload mismatch');END IF;
   RETURN jsonb_build_object('id',command_id::text,'outcome','accepted');
 END IF;
 SELECT z.* INTO r FROM salapiya_p2.current_revision z JOIN public.p2_profile p ON p.id=z.profile_id WHERE p.owner_id=actor AND p.id=profile_id AND z.id=private_revision;
 SELECT q.document::jsonb INTO doc FROM public.p3_group q WHERE q.owner_id=actor AND q.group_id=group_id;
 IF r.id IS NULL OR r.values_json->>'sharedGroup' IS DISTINCT FROM group_id::text OR r.values_json->>'sharedKey' IS DISTINCT FROM bill_id::text OR
   doc IS NULL OR source_stamp IS DISTINCT FROM salapiya_p3.source_stamp(doc->'bills'->bill_id::text)
 THEN PERFORM salapiya_p3.fail('Private source or group evidence changed');END IF;
 INSERT INTO public.p3_private_review(id,owner_id,profile_id,group_id,bill_id,private_revision,source_stamp,reason)
 VALUES(command_id,actor,profile_id,group_id,bill_id,private_revision,source_stamp,reason);
 RETURN jsonb_build_object('id',command_id::text,'outcome','accepted');END $$;
-- Historical receipt resolution needs only the entitled source and transition
-- checks under the group lock, not a hidden current aggregate version.
ALTER FUNCTION salapiya_p3.apply(uuid,uuid,jsonb) RENAME TO apply_v1;
CREATE FUNCTION salapiya_p3.apply(actor uuid,cid uuid,cmd jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g uuid:=(cmd->>'group')::uuid;doc jsonb;me jsonb;result jsonb;BEGIN
 IF cmd->>'op'='resolve' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(g::text,3));
   SELECT document INTO doc FROM salapiya_p3.groups WHERE id=g;
   SELECT p.value INTO me FROM jsonb_each(doc->'people') p WHERE p.value->>'user'=actor::text;
   IF me IS NOT NULL AND NOT(me->>'active')::boolean THEN cmd:=jsonb_set(cmd,'{version}',doc->'version');END IF;
 END IF;
 result:=salapiya_p3.apply_v1(actor,cid,cmd);
 IF (SELECT octet_length(document::text) FROM salapiya_p3.groups WHERE id=g)>10485760 THEN PERFORM salapiya_p3.fail('Group history exceeds the reviewed 10 MiB bound; export and review capacity');END IF;
 RETURN result;END $$;
REVOKE ALL ON FUNCTION salapiya_p3.source_stamp(jsonb),salapiya_p3.apply_v1(uuid,uuid,jsonb),salapiya_p3.apply(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p3_retain_private_evidence(uuid,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p3_retain_private_evidence(uuid,uuid,uuid,uuid,uuid,text,text) TO authenticated;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN GRANT SELECT ON public.p3_private_review TO salapiya_p0_replication;END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN ALTER PUBLICATION powersync ADD TABLE public.p3_private_review;END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
