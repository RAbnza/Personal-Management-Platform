BEGIN;
CREATE TABLE salapiya_p0.enrollment (
  id uuid NOT NULL, owner_id uuid NOT NULL, profile_id uuid NOT NULL,
  snapshot jsonb NOT NULL, published boolean NOT NULL DEFAULT false,
  PRIMARY KEY(owner_id,id)
);
CREATE FUNCTION public.p0_stage_enrollment(enrollment_id uuid, profile_id uuid, snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); prior salapiya_p0.enrollment; item jsonb; seen uuid[]:='{}';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(snapshot) IS DISTINCT FROM 'array' OR octet_length(snapshot::text)>65536 THEN
    RAISE EXCEPTION 'invalid snapshot'; END IF;
  IF jsonb_array_length(snapshot)>100 THEN RAISE EXCEPTION 'snapshot too large'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot) LOOP
    IF jsonb_typeof(item) != 'object' OR item - ARRAY['id','amount_minor'] != '{}'::jsonb
      OR NOT(item ?& ARRAY['id','amount_minor']) OR jsonb_typeof(item->'id') != 'string'
      OR jsonb_typeof(item->'amount_minor') != 'string'
      OR (item->>'amount_minor') !~ '^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'invalid snapshot action'; END IF;
    IF (item->>'amount_minor')::bigint>100000000000 OR (item->>'id')::uuid=ANY(seen) THEN
      RAISE EXCEPTION 'invalid snapshot amount or duplicate id'; END IF;
    seen:=array_append(seen,(item->>'id')::uuid);
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,1));
  SELECT * INTO prior FROM salapiya_p0.enrollment e WHERE e.owner_id=actor AND e.id=enrollment_id;
  IF FOUND THEN
    IF prior.profile_id != profile_id OR prior.snapshot != snapshot THEN RAISE EXCEPTION 'enrollment payload mismatch'; END IF;
    RETURN jsonb_build_object('outcome',CASE WHEN prior.published THEN 'published' ELSE 'staged' END);
  END IF;
  IF EXISTS(SELECT 1 FROM public.p0_profile p WHERE p.owner_id=actor) THEN
    RETURN jsonb_build_object('outcome','collision'); END IF;
  INSERT INTO salapiya_p0.enrollment VALUES(enrollment_id,actor,profile_id,snapshot,false);
  RETURN jsonb_build_object('outcome','staged');
END $$;

CREATE FUNCTION public.p0_publish_enrollment(enrollment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); staged salapiya_p0.enrollment; item jsonb; receipt jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,1));
  SELECT * INTO staged FROM salapiya_p0.enrollment e WHERE e.owner_id=actor AND e.id=enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found'; END IF;
  IF staged.published THEN RETURN jsonb_build_object('outcome','published','profile_id',staged.profile_id); END IF;
  IF EXISTS(SELECT 1 FROM public.p0_profile p WHERE p.owner_id=actor OR p.id=staged.profile_id) THEN
    RETURN jsonb_build_object('outcome','collision'); END IF;
  INSERT INTO public.p0_profile(id,owner_id) VALUES(staged.profile_id,actor);
  FOR item IN SELECT value FROM jsonb_array_elements(staged.snapshot) LOOP
    receipt:=public.p0_submit_expense((item->>'id')::uuid,
      -- Match Dart's fixed, sorted proof payload representation exactly.
      '{"amount_minor":' || to_json(item->>'amount_minor')::text || ',"expected_revision":0,"kind":"expense","owner_id":' ||
      to_json(actor::text)::text || ',"version":1}');
    IF receipt->>'outcome' != 'accepted' THEN RAISE EXCEPTION 'enrollment graph rejected'; END IF;
  END LOOP;
  UPDATE salapiya_p0.enrollment e SET published=true WHERE e.owner_id=actor AND e.id=enrollment_id;
  RETURN jsonb_build_object('outcome','published','profile_id',staged.profile_id);
END $$;
REVOKE ALL ON FUNCTION public.p0_stage_enrollment(uuid,uuid,jsonb),public.p0_publish_enrollment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_stage_enrollment(uuid,uuid,jsonb),public.p0_publish_enrollment(uuid) TO authenticated;
COMMIT;
