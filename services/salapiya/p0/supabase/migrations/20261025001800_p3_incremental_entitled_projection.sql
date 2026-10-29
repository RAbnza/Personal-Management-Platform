BEGIN;
-- Keep the authenticated full API projection and financial validators intact.
-- CDC clients receive small audience metadata plus independently versioned
-- resources, avoiding full-history retransmission on every bill/payment.
ALTER TABLE public.p3_group ADD COLUMN sync_document text NOT NULL DEFAULT '';
CREATE TABLE public.p3_resource(id text PRIMARY KEY,owner_id uuid NOT NULL,group_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('bill','settlement','activity')),source_id text NOT NULL,
 version bigint NOT NULL CHECK(version>0),payload text NOT NULL,
 UNIQUE(owner_id,group_id,kind,source_id),
 FOREIGN KEY(owner_id,group_id) REFERENCES public.p3_group(owner_id,group_id) ON DELETE CASCADE);
CREATE INDEX p3_resource_audience ON public.p3_resource(owner_id,group_id);
ALTER TABLE public.p3_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p3_resource FORCE ROW LEVEL SECURITY;
CREATE POLICY own_p3_resource ON public.p3_resource FOR SELECT TO authenticated USING(owner_id=auth.uid());
REVOKE ALL ON public.p3_resource FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.p3_resource TO authenticated;
ALTER FUNCTION salapiya_p3.publish(uuid) RENAME TO publish_full;
CREATE FUNCTION salapiya_p3.publish(g uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE audience public.p3_group;doc jsonb;resources jsonb;entry record;resource_kind text;resource_source text;digest text;counted bigint;metadata jsonb;BEGIN
 PERFORM salapiya_p3.publish_full(g);
 FOR audience IN SELECT * FROM public.p3_group WHERE group_id=g LOOP
   doc:=audience.document::jsonb;resources:='{}';
   FOR entry IN SELECT * FROM jsonb_each(doc->'bills') LOOP resources:=resources||jsonb_build_object('bill:'||entry.key,entry.value);END LOOP;
   FOR entry IN SELECT * FROM jsonb_each(doc->'settlements') LOOP resources:=resources||jsonb_build_object('settlement:'||entry.key,entry.value);END LOOP;
   FOR entry IN SELECT value->>'id' AS key,value FROM jsonb_array_elements(doc->'activity') LOOP resources:=resources||jsonb_build_object('activity:'||entry.key,entry.value);END LOOP;
   FOR entry IN SELECT * FROM jsonb_each(resources) LOOP
     resource_kind:=split_part(entry.key,':',1);resource_source:=split_part(entry.key,':',2);
     INSERT INTO public.p3_resource VALUES(g::text||':'||audience.owner_id::text||':'||entry.key,audience.owner_id,g,resource_kind,resource_source,1,entry.value::text)
     ON CONFLICT(owner_id,group_id,kind,source_id) DO UPDATE SET payload=excluded.payload,version=p3_resource.version+1
     WHERE p3_resource.payload IS DISTINCT FROM excluded.payload;
   END LOOP;
   DELETE FROM public.p3_resource r WHERE r.owner_id=audience.owner_id AND r.group_id=g AND NOT(resources ? (r.kind||':'||r.source_id));
   SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(r.kind||':'||r.source_id||':'||r.version::text||':'||encode(sha256(convert_to(r.payload,'UTF8')),'hex'),E'\n' ORDER BY r.kind COLLATE "C",r.source_id COLLATE "C"),''),'UTF8')),'hex')
   INTO counted,digest FROM public.p3_resource r WHERE r.owner_id=audience.owner_id AND r.group_id=g;
   metadata:=(doc-ARRAY['bills','settlements','activity'])||jsonb_build_object('projection',2,'audienceVersion',audience.version,'resourceCount',counted,'resourceDigest',digest);
   UPDATE public.p3_group SET sync_document=metadata::text WHERE id=audience.id AND sync_document IS DISTINCT FROM metadata::text;
 END LOOP;
END $$;
-- PostgreSQL permits omitted trailing defaulted columns in the retained full
-- publisher's INSERT. Recompile its callers after installing the new wrapper.
DO $$DECLARE definition text;g record;BEGIN
 definition:=pg_get_functiondef('salapiya_p3.apply_v1(uuid,uuid,jsonb)'::regprocedure);EXECUTE definition;
 FOR g IN SELECT id FROM salapiya_p3.groups ORDER BY id LOOP PERFORM salapiya_p3.publish(g.id);END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.p3_group_boundary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();result jsonb;BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'group_id',g.group_id::text,'version',g.version,
 'digest',encode(sha256(convert_to(g.sync_document,'UTF8')),'hex')) ORDER BY g.id),'[]') INTO result FROM public.p3_group g WHERE g.owner_id=actor;
 RETURN result;END $$;
REVOKE ALL ON FUNCTION salapiya_p3.publish_full(uuid),salapiya_p3.publish(uuid) FROM PUBLIC,anon,authenticated;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='salapiya_p0_replication') THEN GRANT SELECT ON public.p3_resource TO salapiya_p0_replication;END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='powersync') THEN ALTER PUBLICATION powersync ADD TABLE public.p3_resource;END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
