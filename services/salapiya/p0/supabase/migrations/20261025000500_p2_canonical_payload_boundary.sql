-- A caller may not publish semantically valid but unreadable noncanonical
-- recipes into an owner's replica. Use PostgreSQL JSON encoding, not a custom
-- OAuth/transport/financial parser. Existing native payload bytes are unchanged.
BEGIN;
CREATE FUNCTION salapiya_p2.canonical_payload(cmd jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE values_text text; BEGIN
 IF jsonb_typeof(cmd->'values') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'invalid financial payload' USING ERRCODE='22023'; END IF;
 SELECT string_agg(to_json(e.key)::text||':'||e.value::text,',' ORDER BY e.key COLLATE "C")
 INTO values_text FROM jsonb_each(cmd->'values') e;
 RETURN '{"contract":1,"authority":"local","owner":'||to_json(cmd->>'owner')::text||
   ',"expectedVersion":'||(cmd->>'expectedVersion')||',"kind":'||to_json(cmd->>'kind')::text||
   ',"values":{'||coalesce(values_text,'')||'}}';
END $$;
CREATE OR REPLACE FUNCTION public.p2_submit_command(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); envelope jsonb; BEGIN
 IF command_payload IS NULL OR octet_length(command_payload)>1048576 THEN RAISE EXCEPTION 'invalid command size' USING ERRCODE='22023'; END IF;
 envelope:=command_payload::jsonb;
 IF envelope->>'payload' IS DISTINCT FROM salapiya_p2.canonical_payload((envelope->>'payload')::jsonb)
 THEN RAISE EXCEPTION 'noncanonical financial payload' USING ERRCODE='22023'; END IF;
 RETURN salapiya_p2.submit(actor,command_id,envelope);
END $$;
ALTER FUNCTION public.p2_stage_enrollment(uuid,uuid,text,jsonb) SET SCHEMA salapiya_p2;
REVOKE ALL ON FUNCTION salapiya_p2.p2_stage_enrollment(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.p2_stage_enrollment(enrollment_id uuid,profile_id uuid,display_name text,snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; BEGIN
 PERFORM salapiya_p0.require_current_session();
 IF jsonb_typeof(snapshot) IS DISTINCT FROM 'array' OR octet_length(snapshot::text)>33554432 OR jsonb_array_length(snapshot)>20000
 THEN RAISE EXCEPTION 'invalid enrollment size' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(snapshot) LOOP
   IF item->>'payload' IS DISTINCT FROM salapiya_p2.canonical_payload((item->>'payload')::jsonb)
   THEN RAISE EXCEPTION 'noncanonical enrollment payload' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN salapiya_p2.p2_stage_enrollment(enrollment_id,profile_id,display_name,snapshot);
END $$;
REVOKE ALL ON FUNCTION salapiya_p2.canonical_payload(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.p2_stage_enrollment(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p2_stage_enrollment(uuid,uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
