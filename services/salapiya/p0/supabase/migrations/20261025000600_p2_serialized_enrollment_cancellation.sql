-- Cancellation must serialize with stage/publication, including a request that
-- reaches the server late after a client restart. Never roll back published money.
BEGIN;
CREATE TABLE salapiya_p2.enrollment_cancel (
  owner_id uuid NOT NULL,id uuid NOT NULL,profile_id uuid NOT NULL,
  PRIMARY KEY(owner_id,id)
);
REVOKE ALL ON salapiya_p2.enrollment_cancel FROM PUBLIC,anon,authenticated;
CREATE TRIGGER p2_enrollment_cancel_immutable BEFORE UPDATE OR DELETE ON salapiya_p2.enrollment_cancel
 FOR EACH ROW EXECUTE FUNCTION salapiya_p0.immutable();

CREATE OR REPLACE FUNCTION public.p2_stage_enrollment(enrollment_id uuid,profile_id uuid,display_name text,snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); item jsonb; canceled salapiya_p2.enrollment_cancel; BEGIN
 IF jsonb_typeof(snapshot) IS DISTINCT FROM 'array' OR octet_length(snapshot::text)>33554432 OR jsonb_array_length(snapshot)>20000
 THEN RAISE EXCEPTION 'invalid enrollment size' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(snapshot) LOOP
   IF item->>'payload' IS DISTINCT FROM salapiya_p2.canonical_payload((item->>'payload')::jsonb)
   THEN RAISE EXCEPTION 'noncanonical enrollment payload' USING ERRCODE='22023'; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO canceled FROM salapiya_p2.enrollment_cancel c WHERE c.owner_id=actor AND c.id=enrollment_id;
 IF FOUND THEN
   IF canceled.profile_id<>profile_id THEN RAISE EXCEPTION 'canceled enrollment identity mismatch' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('outcome','cancelled','profile_id',profile_id::text);
 END IF;
 RETURN salapiya_p2.p2_stage_enrollment(enrollment_id,profile_id,display_name,snapshot);
END $$;

ALTER FUNCTION public.p2_publish_enrollment(uuid) SET SCHEMA salapiya_p2;
REVOKE ALL ON FUNCTION salapiya_p2.p2_publish_enrollment(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.p2_publish_enrollment(enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); canceled salapiya_p2.enrollment_cancel; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO canceled FROM salapiya_p2.enrollment_cancel c WHERE c.owner_id=actor AND c.id=enrollment_id;
 IF FOUND THEN RETURN jsonb_build_object('outcome','cancelled','profile_id',canceled.profile_id::text); END IF;
 RETURN salapiya_p2.p2_publish_enrollment(enrollment_id);
END $$;

CREATE FUNCTION public.p2_cancel_enrollment(enrollment_id uuid,profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); staged salapiya_p2.enrollment; prior salapiya_p2.enrollment_cancel; BEGIN
 IF enrollment_id IS NULL OR profile_id IS NULL THEN RAISE EXCEPTION 'enrollment identity required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,2));
 SELECT * INTO staged FROM salapiya_p2.enrollment e WHERE e.owner_id=actor AND e.id=enrollment_id FOR UPDATE;
 IF FOUND AND staged.profile_id<>profile_id THEN RAISE EXCEPTION 'enrollment identity mismatch' USING ERRCODE='22023'; END IF;
 IF staged.published OR EXISTS(SELECT 1 FROM public.p2_profile p WHERE p.owner_id=actor AND p.id=profile_id)
 THEN RETURN jsonb_build_object('outcome','published','profile_id',profile_id::text); END IF;
 SELECT * INTO prior FROM salapiya_p2.enrollment_cancel c WHERE c.owner_id=actor AND c.id=enrollment_id;
 IF FOUND AND prior.profile_id<>profile_id THEN RAISE EXCEPTION 'canceled enrollment identity mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO salapiya_p2.enrollment_cancel VALUES(actor,enrollment_id,profile_id) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('outcome','cancelled','profile_id',profile_id::text);
END $$;
REVOKE ALL ON FUNCTION public.p2_publish_enrollment(uuid),public.p2_cancel_enrollment(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p2_publish_enrollment(uuid),public.p2_cancel_enrollment(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
