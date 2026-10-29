-- A device is an authenticated provider session, never a caller-supplied UUID.
-- Archives do not contain sessions. Revocation does not erase offline copies.
BEGIN;
CREATE SCHEMA salapiya_lifecycle;
REVOKE ALL ON SCHEMA salapiya_lifecycle FROM PUBLIC,anon,authenticated;
CREATE TABLE salapiya_lifecycle.device_session (
 session_id uuid PRIMARY KEY, owner_id uuid NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 100),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz, revoked_by_session uuid
);
CREATE TABLE salapiya_lifecycle.deleted_account (
 owner_id uuid PRIMARY KEY, profile_id uuid,
 deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 policy_version integer NOT NULL DEFAULT 1 CHECK(policy_version=1),
 auth_cleanup_completed_at timestamptz
);
REVOKE ALL ON ALL TABLES IN SCHEMA salapiya_lifecycle FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION salapiya_p0.require_current_session() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.user_id=actor AND s.id::text=auth.jwt()->>'session_id'
 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
 FOR SHARE OF s,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'current session required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=actor)
 OR EXISTS(SELECT 1 FROM salapiya_lifecycle.device_session
 WHERE session_id::text=auth.jwt()->>'session_id' AND (owner_id<>actor OR revoked_at IS NOT NULL))
 THEN RAISE EXCEPTION 'current session revoked or account deleted' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;

CREATE FUNCTION public.p7_register_device(device_label text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
BEGIN
 IF device_label IS NULL OR length(btrim(device_label)) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'device label required' USING ERRCODE='22023'; END IF;
 INSERT INTO salapiya_lifecycle.device_session(session_id,owner_id,label)
 VALUES(sid,actor,btrim(device_label)) ON CONFLICT(session_id) DO UPDATE
 SET last_seen_at=clock_timestamp() WHERE device_session.owner_id=actor AND device_session.revoked_at IS NULL;
 RETURN jsonb_build_object('session_id',sid);
END $$;

CREATE FUNCTION public.p7_devices() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',d.session_id,'label',d.label,
 'registered_at',d.registered_at,'last_seen_at',d.last_seen_at,'revoked_at',d.revoked_at,
 'current',d.session_id::text=auth.jwt()->>'session_id',
 'active',d.revoked_at IS NULL AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=d.session_id AND s.user_id=actor))
 ORDER BY d.registered_at),'[]') INTO result FROM (SELECT d.* FROM salapiya_lifecycle.device_session d WHERE d.owner_id=actor
 UNION ALL SELECT s.id,s.user_id,'Earlier sign-in; device unknown',NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::uuid
 FROM auth.sessions s WHERE s.user_id=actor AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.device_session d WHERE d.session_id=s.id)) d;
 RETURN result;
END $$;

CREATE FUNCTION public.p7_revoke_device(target_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=salapiya_p0.require_current_session();
BEGIN
 -- No arbitrary account or installation identifier is accepted.
 INSERT INTO salapiya_lifecycle.device_session(session_id,owner_id,label)
 SELECT s.id,s.user_id,'Earlier sign-in; device unknown' FROM auth.sessions s
 WHERE s.id=target_session AND s.user_id=actor ON CONFLICT(session_id) DO NOTHING;
 UPDATE salapiya_lifecycle.device_session SET revoked_at=coalesce(revoked_at,clock_timestamp()),
 revoked_by_session=coalesce(revoked_by_session,(auth.jwt()->>'session_id')::uuid)
 WHERE session_id=target_session AND owner_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'owned registered session required' USING ERRCODE='42501'; END IF;
 -- Removing this provider session also invalidates its refresh-token chain.
 DELETE FROM auth.sessions WHERE id=target_session AND user_id=actor;
 RETURN jsonb_build_object('revoked',true,'session_id',target_session);
END $$;

-- RLS now checks live session state as well as ownership. CDC does not use RLS:
-- existing PowerSync JWTs retain their separately documented expiry window.
CREATE FUNCTION public.p7_session_active() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=auth.uid())
 AND NOT EXISTS(SELECT 1 FROM salapiya_lifecycle.device_session
 WHERE session_id::text=auth.jwt()->>'session_id' AND (owner_id<>auth.uid() OR revoked_at IS NOT NULL));
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['p0_profile','p0_accepted','p2_profile','p2_command','p3_group','p3_resource','p3_private_review','p5_command'] LOOP
  EXECUTE format('CREATE POLICY p7_live_session ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT public.p7_session_active()))',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.p7_register_device(text),public.p7_devices(),public.p7_revoke_device(uuid),public.p7_session_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p7_register_device(text),public.p7_devices(),public.p7_revoke_device(uuid),public.p7_session_active() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
