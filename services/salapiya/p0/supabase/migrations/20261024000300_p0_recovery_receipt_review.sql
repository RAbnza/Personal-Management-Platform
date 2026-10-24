BEGIN;
-- Owner-scoped read only. Restored intent cannot infer a receipt from an ID alone.
CREATE FUNCTION public.p0_review_command(command_id uuid, command_payload text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); prior salapiya_p0.receipt; data jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF command_id IS NULL OR command_payload IS NULL OR octet_length(command_payload)>4096 THEN
    RAISE EXCEPTION 'invalid command review' USING ERRCODE='22023'; END IF;
  data:=command_payload::jsonb;
  IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR data->>'owner_id' IS DISTINCT FROM actor::text THEN
    RAISE EXCEPTION 'owner mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM salapiya_p0.receipt WHERE owner_id=actor AND id=command_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('id',command_id,'owner_id',actor,'outcome','missing'); END IF;
  IF prior.payload != data THEN
    RETURN jsonb_build_object('id',command_id,'owner_id',actor,'outcome','mismatch'); END IF;
  RETURN prior.result;
END $$;
REVOKE ALL ON FUNCTION public.p0_review_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_review_command(uuid,text) TO authenticated;
COMMIT;
