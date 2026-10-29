-- Permanent application deletion is atomic. Provider Auth removal is a separate
-- retryable admin-API step; the deletion register denies all future enrollment.
BEGIN;
CREATE FUNCTION salapiya_lifecycle.permits_private_erasure(row_data jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account d
 WHERE d.owner_id::text=coalesce(row_data->>'owner_id',row_data->>'actor')
 OR d.profile_id::text=row_data->>'profile_id')
$$;
REVOKE ALL ON FUNCTION salapiya_lifecycle.permits_private_erasure(jsonb) FROM PUBLIC,anon,authenticated;

-- No mutable flag or client setting bypasses immutability. Only DELETE on the
-- enumerated private tables for a permanently tombstoned identity is permitted.
CREATE OR REPLACE FUNCTION salapiya_p0.immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' AND TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME=ANY(ARRAY[
 'salapiya_p0.evidence','public.p0_accepted','public.p2_command',
 'salapiya_p2.revision','salapiya_p2.posting','salapiya_p2.receipt','salapiya_p2.enrollment_cancel'])
 AND salapiya_lifecycle.permits_private_erasure(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'immutable financial evidence';
END $$;
CREATE OR REPLACE FUNCTION salapiya_p3.immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' AND TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME=ANY(ARRAY['public.p3_private_review','salapiya_p3.receipt'])
 AND salapiya_lifecycle.permits_private_erasure(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'immutable shared command evidence';
END $$;
CREATE OR REPLACE FUNCTION salapiya_p5.immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' AND TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME=ANY(ARRAY['public.p5_command','salapiya_p5.receipt'])
 AND salapiya_lifecycle.permits_private_erasure(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'immutable Life evidence';
END $$;

-- Extract the existing minimum-necessary group closure into an internal helper
-- used both by provider identity deletion and the application deletion request.
CREATE FUNCTION salapiya_lifecycle.close_shared_identity(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g record;doc jsonb;p record;person jsonb;stamp text:=clock_timestamp()::text;
BEGIN
 FOR g IN SELECT id FROM salapiya_p3.groups x WHERE EXISTS(
 SELECT 1 FROM jsonb_each(x.document->'people') e WHERE e.value->>'user'=actor::text) ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(g.id::text,3));
  SELECT document INTO doc FROM salapiya_p3.groups WHERE id=g.id FOR UPDATE;
  FOR p IN SELECT * FROM jsonb_each(doc->'people') WHERE value->>'user'=actor::text LOOP
   person:=p.value||jsonb_build_object('name','Deleted participant','user',NULL,'kind','deleted','active',false,
   'entitled',(SELECT coalesce(jsonb_agg(k),'[]') FROM jsonb_object_keys(doc->'bills') k),
   'intervals',p.value->'intervals'||jsonb_build_array(jsonb_build_object('left',stamp,'reason','Connected account deleted')));
   doc:=jsonb_set(doc,ARRAY['people',p.key],person);
   IF doc->>'owner'=p.key THEN doc:=jsonb_set(doc,'{archived}','true'); END IF;
  END LOOP;
  doc:=jsonb_set(doc,'{version}',to_jsonb((doc->>'version')::bigint+1));
  doc:=jsonb_set(doc,'{activity}',doc->'activity'||jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid()::text,'op','identity_deleted','actor',actor::text,'at',stamp,
  'reason','Shared evidence retained; ownerless administration archived')));
  UPDATE salapiya_p3.groups SET document=doc,version=(doc->>'version')::bigint WHERE id=g.id;
  DELETE FROM public.p3_group WHERE owner_id=actor AND group_id=g.id;
  PERFORM salapiya_p3.publish(g.id);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION salapiya_lifecycle.close_shared_identity(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION salapiya_p3.identity_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
 PERFORM salapiya_lifecycle.close_shared_identity(OLD.id);
 IF TG_OP='DELETE' THEN
  UPDATE salapiya_lifecycle.deleted_account SET auth_cleanup_completed_at=clock_timestamp() WHERE owner_id=OLD.id;
  RETURN OLD;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION salapiya_lifecycle.purge_deleted_account(v_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile uuid;v_email text;
BEGIN
 SELECT profile_id INTO v_profile FROM salapiya_lifecycle.deleted_account WHERE owner_id=v_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'permanent deletion register required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.users WHERE id=v_actor FOR UPDATE;
 SELECT to_jsonb(u)->>'email' INTO v_email FROM auth.users u WHERE id=v_actor;
 PERFORM salapiya_lifecycle.close_shared_identity(v_actor);
 DELETE FROM salapiya_p3.invite WHERE inviter=v_actor OR used_by=v_actor OR lower(invite.email)=lower(v_email);
 DELETE FROM salapiya_p3.receipt WHERE receipt.actor=v_actor;
 DELETE FROM public.p3_private_review WHERE owner_id=v_actor;
 DELETE FROM public.p3_group WHERE owner_id=v_actor;
 DELETE FROM salapiya_p5.record WHERE owner_id=v_actor;
 DELETE FROM salapiya_p5.receipt WHERE owner_id=v_actor;
 DELETE FROM public.p5_command WHERE owner_id=v_actor;
 DELETE FROM salapiya_p2.posting WHERE profile_id=v_profile;
 DELETE FROM salapiya_p2.revision WHERE profile_id=v_profile;
 DELETE FROM salapiya_p2.account WHERE profile_id=v_profile;
 DELETE FROM salapiya_p2.category WHERE profile_id=v_profile;
 DELETE FROM public.p2_command WHERE owner_id=v_actor;
 DELETE FROM salapiya_p2.receipt WHERE owner_id=v_actor;
 DELETE FROM salapiya_p2.enrollment WHERE owner_id=v_actor;
 DELETE FROM salapiya_p2.enrollment_cancel WHERE owner_id=v_actor;
 DELETE FROM public.p2_profile WHERE owner_id=v_actor;
 DELETE FROM salapiya_p0.evidence WHERE owner_id=v_actor;
 DELETE FROM public.p0_accepted WHERE owner_id=v_actor;
 DELETE FROM salapiya_p0.receipt WHERE owner_id=v_actor;
 DELETE FROM salapiya_p0.enrollment WHERE owner_id=v_actor;
 DELETE FROM public.p0_profile WHERE owner_id=v_actor;
 UPDATE salapiya_lifecycle.device_session SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE owner_id=v_actor;
 DELETE FROM auth.sessions WHERE user_id=v_actor;
END $$;
REVOKE ALL ON FUNCTION salapiya_lifecycle.purge_deleted_account(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.p7_delete_account(confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_profile uuid;v_email text;auth_time numeric;
BEGIN
 IF v_actor IS NULL OR confirmation IS DISTINCT FROM 'DELETE CONNECTED ACCOUNT'
 THEN RAISE EXCEPTION 'explicit account deletion confirmation required' USING ERRCODE='42501'; END IF;
 -- Idempotent receipt after response loss grants no restored authority.
 IF EXISTS(SELECT 1 FROM salapiya_lifecycle.deleted_account WHERE owner_id=v_actor)
 THEN RETURN jsonb_build_object('application_deleted',true,'auth_cleanup_pending',EXISTS(
 SELECT 1 FROM auth.users WHERE id=v_actor)); END IF;
 PERFORM salapiya_p0.require_current_session();
 SELECT max((x->>'timestamp')::numeric) INTO auth_time FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) x
 WHERE x->>'method'='oauth' AND x->>'timestamp' ~ '^[0-9]{1,12}$';
 IF auth_time IS NULL OR auth_time<extract(epoch FROM clock_timestamp())-300
 OR auth_time>extract(epoch FROM clock_timestamp())+30
 THEN RAISE EXCEPTION 'recent Google reauthentication required' USING ERRCODE='42501'; END IF;
 -- Serializes against all existing guarded command/enrollment sessions.
 PERFORM 1 FROM auth.users WHERE id=v_actor FOR UPDATE;
 SELECT id INTO v_profile FROM public.p2_profile WHERE owner_id=v_actor;
 SELECT to_jsonb(u)->>'email' INTO v_email FROM auth.users u WHERE id=v_actor;
 INSERT INTO salapiya_lifecycle.deleted_account(owner_id,profile_id) VALUES(v_actor,v_profile);
 PERFORM salapiya_lifecycle.purge_deleted_account(v_actor);
 RETURN jsonb_build_object('application_deleted',true,'auth_cleanup_pending',true);
END $$;
REVOKE ALL ON FUNCTION public.p7_delete_account(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p7_delete_account(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
