/* Reviewed lifecycle path. Runtime can request/cancel only its own deletion.
 * Purge is a separate operator connection, never SET ROLE/BYPASSRLS/disabled
 * triggers. Deletion requests themselves are the durable lifecycle intent. */
REVOKE ALL ON auth.session_assurance FROM PUBLIC,app_domain,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE,DELETE ON auth.session_assurance TO auth_adapter;
GRANT USAGE ON SCHEMA ops TO lifecycle_operator;
REVOKE ALL ON ops.deletion_request,ops.deletion_tombstone FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON ops.deletion_request TO app_domain;
GRANT SELECT,UPDATE ON ops.deletion_request TO lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON ops.deletion_tombstone TO lifecycle_operator;
ALTER TABLE ops.deletion_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.deletion_request FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.deletion_tombstone ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.deletion_tombstone FORCE ROW LEVEL SECURITY;
CREATE POLICY deletion_owner ON ops.deletion_request TO app_domain
 USING(target_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(target_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY deletion_operator ON ops.deletion_request TO lifecycle_operator USING(true) WITH CHECK(true);
CREATE POLICY tombstone_operator ON ops.deletion_tombstone TO lifecycle_operator USING(true) WITH CHECK(true);
--> statement-breakpoint
CREATE FUNCTION ops.assert_recent_auth(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.session s JOIN auth.session_assurance a ON a.session_id=s.id
   JOIN auth."user" u ON u.id=s.user_id
   WHERE s.id=p_session_id AND s.user_id=NULLIF(current_setting('app.user_id',true),'')::uuid
   AND u.email_verified AND s.expires_at>clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '30 days'
   AND a.method='password' AND a.verified_at<=clock_timestamp()
   AND a.verified_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'Recent password verification required' USING ERRCODE='P0001';
 END IF;
END $$;
REVOKE ALL ON FUNCTION ops.assert_recent_auth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.assert_recent_auth(uuid) TO app_domain;
--> statement-breakpoint
CREATE FUNCTION ops.guard_deletion_request() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF current_user<>'app_domain' OR NEW.state<>'pending' OR NEW.requested_at IS DISTINCT FROM transaction_timestamp()
     OR NEW.purge_after IS DISTINCT FROM NEW.requested_at+interval '7 days'
     OR NOT EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id
       WHERE w.id=NEW.target_workspace_id AND p.user_id=NEW.target_user_id AND w.state='active' AND p.lifecycle='active') THEN
     RAISE EXCEPTION 'Invalid deletion scope' USING ERRCODE='23514';
   END IF;
   PERFORM ops.assert_recent_auth(NULLIF(current_setting('app.session_id',true),'')::uuid);
   RETURN NEW;
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
  OR NEW.target_workspace_id IS DISTINCT FROM OLD.target_workspace_id OR NEW.client_command_id IS DISTINCT FROM OLD.client_command_id
  OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR NEW.scope_hash IS DISTINCT FROM OLD.scope_hash
  OR NEW.requested_at IS DISTINCT FROM OLD.requested_at OR NEW.purge_after IS DISTINCT FROM OLD.purge_after THEN
   RAISE EXCEPTION 'Deletion identity and cutoff are immutable' USING ERRCODE='23514';
 END IF;
 IF current_user='app_domain' THEN
   IF OLD.state<>'pending' OR NEW.state<>'cancelled' OR clock_timestamp()>=OLD.purge_after
     OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN
     RAISE EXCEPTION 'Only pending deletion can be cancelled during grace' USING ERRCODE='23514';
   END IF;
   PERFORM ops.assert_recent_auth(NULLIF(current_setting('app.session_id',true),'')::uuid);
 ELSIF current_user='lifecycle_operator' THEN
   IF OLD.state='cancelled' AND NEW.state='cancelled' AND NEW.user_id IS NULL AND NEW.workspace_id IS NULL AND NEW.scope_manifest='{}'::jsonb
     AND EXISTS(SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
     AND r.target_user_id=OLD.target_user_id AND r.target_workspace_id=OLD.target_workspace_id AND r.state='purging') THEN RETURN NEW; END IF;
   IF OLD.state IN ('completed','cancelled') OR clock_timestamp()<OLD.purge_after
     OR NEW.state NOT IN ('purging','failed','completed') THEN
     RAISE EXCEPTION 'Deletion cannot purge before grace or reopen' USING ERRCODE='23514';
   END IF;
 ELSE RAISE EXCEPTION 'Unauthorized lifecycle transition' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ops.guard_deletion_request() FROM PUBLIC;
CREATE TRIGGER deletion_request_guard BEFORE INSERT OR UPDATE ON ops.deletion_request FOR EACH ROW EXECUTE FUNCTION ops.guard_deletion_request();
--> statement-breakpoint
CREATE FUNCTION ops.guard_owner_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE uid uuid; wid uuid; old_state text; new_state text;
BEGIN
 IF TG_TABLE_NAME='user_profile' THEN
   uid:=OLD.user_id; old_state:=OLD.lifecycle; new_state:=NEW.lifecycle;
   SELECT id INTO wid FROM core.workspace WHERE owner_user_id=uid;
 ELSE uid:=OLD.owner_user_id; wid:=OLD.id; old_state:=OLD.state; new_state:=NEW.state; END IF;
 IF new_state IS NOT DISTINCT FROM old_state THEN RETURN NEW; END IF;
 IF current_user='app_domain' THEN
   IF (old_state='active' AND new_state='deletion_pending' AND EXISTS(
       SELECT 1 FROM ops.deletion_request r WHERE r.target_user_id=uid AND r.target_workspace_id=wid AND r.state='pending'))
     OR (old_state='deletion_pending' AND new_state='active' AND EXISTS(
       SELECT 1 FROM ops.deletion_request r WHERE r.target_user_id=uid AND r.target_workspace_id=wid AND r.state='cancelled'
       AND r.requested_at=(SELECT max(requested_at) FROM ops.deletion_request WHERE target_user_id=uid))) THEN
     PERFORM ops.assert_recent_auth(NULLIF(current_setting('app.session_id',true),'')::uuid); RETURN NEW;
   END IF;
 ELSIF current_user='lifecycle_operator' AND old_state IN ('deletion_pending','purging') AND new_state='purging'
   AND EXISTS(SELECT 1 FROM ops.deletion_request r WHERE r.target_user_id=uid AND r.target_workspace_id=wid AND r.state='purging' AND r.purge_after<=clock_timestamp()) THEN RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Lifecycle transition requires an authorized deletion request' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION ops.guard_owner_lifecycle() FROM PUBLIC;
CREATE TRIGGER owner_lifecycle_guard BEFORE UPDATE ON core.user_profile FOR EACH ROW EXECUTE FUNCTION ops.guard_owner_lifecycle();
CREATE TRIGGER owner_lifecycle_guard BEFORE UPDATE ON core.workspace FOR EACH ROW EXECUTE FUNCTION ops.guard_owner_lifecycle();
--> statement-breakpoint
CREATE FUNCTION ops.purge_scope_allowed(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT current_user='lifecycle_operator' AND EXISTS(SELECT 1 FROM ops.deletion_request r
 WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_workspace_id=p_workspace_id AND r.state='purging' AND r.purge_after<=transaction_timestamp())
$$;
REVOKE ALL ON FUNCTION ops.purge_scope_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.purge_scope_allowed(uuid) TO lifecycle_operator,app_domain;
--> statement-breakpoint
/* Add scoped operator policies to the closed implemented private-table set.
 * app_domain grants/policies stay intact. New tables require a later reviewed
 * migration; runtime catalog discovery does not grant future tables access. */
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('core','finance','career','time','audit','ops')
  AND c.relname NOT IN ('deletion_request','deletion_tombstone')
  AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='workspace_id' AND NOT a.attisdropped)
 LOOP
   EXECUTE format('GRANT USAGE ON SCHEMA %I TO lifecycle_operator',t.nspname);
   EXECUTE format('GRANT SELECT,DELETE ON %I.%I TO lifecycle_operator',t.nspname,t.relname);
   EXECUTE format('CREATE POLICY lifecycle_purge_scope ON %I.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',t.nspname,t.relname);
 END LOOP;
END $$;
GRANT SELECT,DELETE ON core.workspace,core.user_profile TO lifecycle_operator;
GRANT UPDATE(state,version,updated_at) ON core.workspace TO lifecycle_operator;
GRANT UPDATE(lifecycle,version,updated_at) ON core.user_profile TO lifecycle_operator;
CREATE POLICY workspace_lifecycle_scope ON core.workspace TO lifecycle_operator USING(ops.purge_scope_allowed(id));
CREATE POLICY profile_lifecycle_scope ON core.user_profile TO lifecycle_operator USING(EXISTS(
 SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_user_id=user_id AND r.state='purging' AND r.purge_after<=transaction_timestamp()));
CREATE POLICY workspace_lifecycle_lock ON core.workspace FOR SELECT TO lifecycle_operator USING(EXISTS(
 SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_workspace_id=id AND r.state IN ('pending','failed','purging') AND r.purge_after<=transaction_timestamp()));
CREATE POLICY profile_lifecycle_lock ON core.user_profile FOR SELECT TO lifecycle_operator USING(EXISTS(
 SELECT 1 FROM ops.deletion_request r WHERE r.id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND r.target_user_id=user_id AND r.state IN ('pending','failed','purging') AND r.purge_after<=transaction_timestamp()));
GRANT USAGE ON SCHEMA auth TO lifecycle_operator;
GRANT DELETE ON auth."user",auth.session,auth.account,auth.verification TO lifecycle_operator;
GRANT SELECT(id) ON auth."user" TO lifecycle_operator;
GRANT SELECT(user_id) ON auth.session,auth.account TO lifecycle_operator;
GRANT SELECT(value,identifier) ON auth.verification TO lifecycle_operator;
CREATE FUNCTION ops.guard_auth_purge() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE uid uuid; BEGIN
 IF current_user<>'lifecycle_operator' THEN RETURN OLD; END IF;
 SELECT target_user_id INTO uid FROM ops.deletion_request WHERE id=NULLIF(current_setting('ops.deletion_request_id',true),'')::uuid
 AND state='purging' AND purge_after<=transaction_timestamp();
 IF uid IS NULL OR (TG_TABLE_NAME='user' AND OLD.id<>uid)
   OR (TG_TABLE_NAME IN ('session','account') AND OLD.user_id<>uid)
   OR (TG_TABLE_NAME='verification' AND OLD.value<>uid::text) THEN
   RAISE EXCEPTION 'Auth purge is outside approved identity' USING ERRCODE='42501';
 END IF; RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION ops.guard_auth_purge() FROM PUBLIC;
CREATE TRIGGER user_lifecycle_delete BEFORE DELETE ON auth."user" FOR EACH ROW EXECUTE FUNCTION ops.guard_auth_purge();
CREATE TRIGGER session_lifecycle_delete BEFORE DELETE ON auth.session FOR EACH ROW EXECUTE FUNCTION ops.guard_auth_purge();
CREATE TRIGGER account_lifecycle_delete BEFORE DELETE ON auth.account FOR EACH ROW EXECUTE FUNCTION ops.guard_auth_purge();
CREATE TRIGGER verification_lifecycle_delete BEFORE DELETE ON auth.verification FOR EACH ROW EXECUTE FUNCTION ops.guard_auth_purge();
--> statement-breakpoint
/* Preserve every original trigger body. The sole new early-return is DELETE
 * by the separate operator, within a confirmed, expired-grace purge request.
 * Ordinary immutable-evidence and financial guards are not weakened. */
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT DISTINCT p.oid FROM pg_proc p JOIN pg_trigger tr ON tr.tgfoid=p.oid
  JOIN pg_class c ON c.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT tr.tgisinternal AND n.nspname IN ('core','finance','career','time','audit','ops')
  AND c.relname NOT IN ('deletion_request','deletion_tombstone','workspace','user_profile')
 LOOP
   definition:=pg_get_functiondef(f.oid);
   definition:=regexp_replace(definition,'\mBEGIN\M',
    'BEGIN IF TG_OP=''DELETE'' AND current_user=''lifecycle_operator'' AND ops.purge_scope_allowed((to_jsonb(OLD)->>''workspace_id'')::uuid) THEN RETURN OLD; END IF;', 'i');
   EXECUTE definition;
 END LOOP;
END $$;
--> statement-breakpoint
/* Cancelled request links cannot prevent a later whole-identity purge. */
ALTER TABLE ops.deletion_request DROP CONSTRAINT deletion_request_user_id_user_id_fk;
ALTER TABLE ops.deletion_request ADD CONSTRAINT deletion_request_user_id_user_id_fk FOREIGN KEY(user_id) REFERENCES auth."user"(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ops.deletion_request DROP CONSTRAINT deletion_request_workspace_id_workspace_id_fk;
ALTER TABLE ops.deletion_request ADD CONSTRAINT deletion_request_workspace_id_workspace_id_fk FOREIGN KEY(workspace_id) REFERENCES core.workspace(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
