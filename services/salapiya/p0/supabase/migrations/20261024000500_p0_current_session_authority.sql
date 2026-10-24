-- Preserve the reviewed financial cores; require live session authority at RPC entry.
BEGIN;
CREATE FUNCTION salapiya_p0.require_current_session() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    WHERE s.user_id=actor AND s.id::text=auth.jwt()->>'session_id'
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
    FOR SHARE OF s,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'current session required' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION salapiya_p0.require_current_session() FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.p0_submit_expense(uuid,text) SET SCHEMA salapiya_p0;
ALTER FUNCTION public.p0_stage_enrollment(uuid,uuid,jsonb) SET SCHEMA salapiya_p0;
ALTER FUNCTION public.p0_publish_enrollment(uuid) SET SCHEMA salapiya_p0;
ALTER FUNCTION public.p0_review_command(uuid,text) SET SCHEMA salapiya_p0;
REVOKE ALL ON FUNCTION salapiya_p0.p0_submit_expense(uuid,text),
 salapiya_p0.p0_stage_enrollment(uuid,uuid,jsonb),salapiya_p0.p0_publish_enrollment(uuid),
 salapiya_p0.p0_review_command(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.p0_submit_expense(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM salapiya_p0.require_current_session();
 RETURN salapiya_p0.p0_submit_expense(command_id,command_payload); END $$;
CREATE FUNCTION public.p0_stage_enrollment(enrollment_id uuid,profile_id uuid,snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM salapiya_p0.require_current_session();
 RETURN salapiya_p0.p0_stage_enrollment(enrollment_id,profile_id,snapshot); END $$;
CREATE FUNCTION public.p0_publish_enrollment(enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM salapiya_p0.require_current_session();
 RETURN salapiya_p0.p0_publish_enrollment(enrollment_id); END $$;
CREATE FUNCTION public.p0_review_command(command_id uuid,command_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM salapiya_p0.require_current_session();
 RETURN salapiya_p0.p0_review_command(command_id,command_payload); END $$;
REVOKE ALL ON FUNCTION public.p0_submit_expense(uuid,text),public.p0_stage_enrollment(uuid,uuid,jsonb),
 public.p0_publish_enrollment(uuid),public.p0_review_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_submit_expense(uuid,text),public.p0_stage_enrollment(uuid,uuid,jsonb),
 public.p0_publish_enrollment(uuid),public.p0_review_command(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
