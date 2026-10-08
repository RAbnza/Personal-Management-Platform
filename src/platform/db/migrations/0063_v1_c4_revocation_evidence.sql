-- Custom SQL migration file, put your code below! --
CREATE FUNCTION ops.assert_prior_sessions_revoked(p_user_id uuid,p_requested_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid
   OR EXISTS(SELECT 1 FROM auth.session WHERE user_id=p_user_id AND created_at<=p_requested_at) THEN
   RAISE EXCEPTION 'Ordinary session revocation is incomplete' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION ops.assert_prior_sessions_revoked(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.assert_prior_sessions_revoked(uuid,timestamptz) TO app_domain;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('ops.guard_deletion_request()'::regprocedure);
 definition:=regexp_replace(definition,'\mBEGIN\M',
  'BEGIN IF TG_OP=''UPDATE'' AND current_user=''app_domain'' AND OLD.state=''pending'' AND NEW.state=''pending'' AND (to_jsonb(NEW)-''progress_json'') IS NOT DISTINCT FROM (to_jsonb(OLD)-''progress_json'') AND NEW.progress_json=''{"ordinarySessionsRevoked":true}''::jsonb THEN PERFORM ops.assert_prior_sessions_revoked(OLD.target_user_id,OLD.requested_at); RETURN NEW; END IF;', 'i');
 EXECUTE definition;
END $$;
