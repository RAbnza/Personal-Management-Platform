/* Email opt-in is separate from mandatory authentication email. */
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['notification_preference','notification_delivery','notification_attempt','notification_provider_event'] LOOP
  EXECUTE format('REVOKE ALL ON time.%I FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator',t);
  EXECUTE format('ALTER TABLE time.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE time.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON time.%I TO app_domain',t);
  EXECUTE format('GRANT SELECT,DELETE ON time.%I TO lifecycle_operator',t);
  EXECUTE format('CREATE POLICY notification_owner ON time.%I TO app_domain,worker_domain USING(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active'')) WITH CHECK(workspace_id=NULLIF(current_setting(''app.workspace_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting(''app.user_id'',true),'''')::uuid AND w.state=''active'' AND p.lifecycle=''active''))',t);
  EXECUTE format('CREATE POLICY lifecycle_purge_scope ON time.%I TO lifecycle_operator USING(ops.purge_scope_allowed(workspace_id))',t);
 END LOOP;
END $$;
GRANT INSERT,UPDATE ON time.notification_preference TO app_domain;
GRANT SELECT ON time.notification_preference TO worker_domain;
GRANT SELECT,INSERT,UPDATE ON time.notification_delivery,time.notification_attempt TO worker_domain;
GRANT SELECT,INSERT ON time.notification_provider_event TO worker_domain;
--> statement-breakpoint
/* Grant only SELECT to the source graph needed by the existing reminder reader.
 * Its financial security-invoker views recursively preserve owner RLS. */
DO $$ DECLARE r record; p record; BEGIN
 FOR r IN WITH RECURSIVE dependencies(oid) AS (
 SELECT unnest(ARRAY['time.agenda_v'::regclass,'finance.current_installment_due_v'::regclass,'finance.card_statement_due_v'::regclass,'finance.card_installment_due_v'::regclass,'planning.occurrence_due_v'::regclass,'core.workspace'::regclass,'core.user_profile'::regclass,'core.module_preference'::regclass,'time.reminder_rule'::regclass,'time.source_reminder_setting'::regclass,'time.reminder_occurrence'::regclass,'audit.private_revision'::regclass])::oid
 UNION SELECT d.refobjid FROM dependencies x JOIN pg_rewrite rw ON rw.ev_class=x.oid JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass WHERE d.refobjid<>x.oid
 ) SELECT c.oid,n.nspname schema,c.relname name,c.relkind FROM dependencies x JOIN pg_class c ON c.oid=x.oid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','v') AND n.nspname IN('core','finance','career','time','planning','audit') LOOP
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO worker_domain',r.schema);
  EXECUTE format('GRANT SELECT ON %I.%I TO worker_domain',r.schema,r.name);
  IF r.relkind='r' THEN
   FOR p IN SELECT polname,pg_get_expr(polqual,polrelid) qual FROM pg_policy WHERE polrelid=r.oid AND 'app_domain'::regrole=ANY(polroles) AND polcmd IN('r','*') LOOP
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT TO worker_domain USING(%s)','notification_read_'||p.polname,r.schema,r.name,p.qual);
   END LOOP;
  END IF;
 END LOOP;
END $$;
GRANT INSERT,UPDATE ON time.reminder_rule,time.reminder_occurrence TO worker_domain;
CREATE POLICY notification_materialization ON time.reminder_rule FOR ALL TO worker_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'));
CREATE POLICY notification_materialization ON time.reminder_occurrence FOR ALL TO worker_domain USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(SELECT 1 FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active'));
--> statement-breakpoint
/* Narrow discovery/identity functions: no worker SELECT on auth identities. */
CREATE POLICY notification_discovery ON time.notification_preference FOR SELECT TO migration_owner USING(true);
CREATE POLICY notification_delivery_lookup ON time.notification_delivery FOR SELECT TO migration_owner USING(true);
CREATE POLICY notification_identity_workspace ON core.workspace FOR SELECT TO migration_owner USING(id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY notification_identity_profile ON core.user_profile FOR SELECT TO migration_owner USING(user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE FUNCTION ops.notification_scopes(after_id uuid DEFAULT '00000000-0000-0000-0000-000000000000') RETURNS TABLE(user_id uuid,workspace_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT user_id,workspace_id FROM time.notification_preference WHERE enabled AND workspace_id>after_id ORDER BY workspace_id LIMIT 100 $$;
CREATE FUNCTION ops.notification_scope(delivery uuid) RETURNS TABLE(user_id uuid,workspace_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT p.user_id,p.workspace_id FROM time.notification_delivery d JOIN time.notification_preference p ON p.workspace_id=d.workspace_id WHERE d.id=delivery $$;
CREATE FUNCTION ops.notification_recipient() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT u.email FROM core.workspace w JOIN core.user_profile p ON p.user_id=w.owner_user_id JOIN auth."user" u ON u.id=p.user_id
 WHERE w.id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND p.lifecycle='active' AND u.email_verified
$$;
CREATE FUNCTION ops.lock_notification_scope() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM core.user_profile WHERE user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND lifecycle='active' FOR SHARE;
 IF NOT FOUND OR ops.notification_recipient() IS NULL THEN RAISE EXCEPTION 'notification identity unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION ops.notification_scopes(uuid),ops.notification_scope(uuid),ops.notification_recipient(),ops.lock_notification_scope() FROM PUBLIC;
GRANT USAGE ON SCHEMA ops TO worker_domain;
GRANT EXECUTE ON FUNCTION ops.notification_scopes(uuid),ops.notification_scope(uuid),ops.lock_notification_scope() TO worker_domain;
GRANT EXECUTE ON FUNCTION ops.notification_recipient() TO worker_domain,app_domain;
--> statement-breakpoint
CREATE FUNCTION time.guard_notification_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE receipt core.command_receipt; BEGIN
 IF TG_OP='DELETE' THEN
  IF current_user='lifecycle_operator' AND ops.purge_scope_allowed(OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'notification history requires approved purge' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.workspace_id) IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id) THEN RAISE EXCEPTION 'notification identity immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='notification_preference' THEN
  IF NEW.user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id',true),'')::uuid OR NEW.timezone IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'notification preference identity or timezone invalid' USING ERRCODE='23514'; END IF;
  SELECT * INTO receipt FROM core.command_receipt WHERE workspace_id=NEW.workspace_id AND id=NEW.command_receipt_id;
  IF receipt.state IS DISTINCT FROM 'claimed' OR receipt.command_type IS DISTINCT FROM 'time.notification.preferences' THEN RAISE EXCEPTION 'notification consent requires command' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
   IF ROW(NEW.user_id,NEW.version) IS DISTINCT FROM ROW(OLD.user_id,OLD.version+1) OR NEW.command_receipt_id=OLD.command_receipt_id THEN RAISE EXCEPTION 'notification preference revision invalid' USING ERRCODE='23514'; END IF;
   NEW.enabled_at:=CASE WHEN NOT NEW.enabled THEN NULL WHEN OLD.enabled THEN OLD.enabled_at ELSE clock_timestamp() END;
  ELSE NEW.enabled_at:=CASE WHEN NEW.enabled THEN clock_timestamp() ELSE NULL END;
  END IF;
  IF NEW.enabled AND ops.notification_recipient() IS NULL THEN RAISE EXCEPTION 'verified owned email required' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=clock_timestamp();
 ELSIF TG_TABLE_NAME='notification_delivery' THEN
  IF TG_OP='UPDATE' AND ROW(NEW.reminder_occurrence_id,NEW.logical_key,NEW.created_at) IS DISTINCT FROM ROW(OLD.reminder_occurrence_id,OLD.logical_key,OLD.created_at) THEN RAISE EXCEPTION 'delivery identity immutable' USING ERRCODE='23514'; END IF;
  IF NEW.logical_key<>'email/'||NEW.reminder_occurrence_id::text THEN RAISE EXCEPTION 'delivery logical key invalid' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN('delivered','bounced','suppressed','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'terminal notification cannot replay' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN RAISE EXCEPTION 'provider identity immutable' USING ERRCODE='23514'; END IF;
  NEW.updated_at:=clock_timestamp();
 ELSIF TG_TABLE_NAME='notification_attempt' THEN
  IF TG_OP='UPDATE' AND (OLD.outcome<>'attempted' OR ROW(NEW.delivery_id,NEW.attempt_no,NEW.recipient_fingerprint,NEW.started_at) IS DISTINCT FROM ROW(OLD.delivery_id,OLD.attempt_no,OLD.recipient_fingerprint,OLD.started_at)) THEN RAISE EXCEPTION 'attempt evidence immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_OP='UPDATE' THEN RAISE EXCEPTION 'provider evidence immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time.guard_notification_evidence() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['notification_preference','notification_delivery','notification_attempt','notification_provider_event'] LOOP
 EXECUTE format('CREATE TRIGGER notification_guard BEFORE INSERT OR UPDATE OR DELETE ON time.%I FOR EACH ROW EXECUTE FUNCTION time.guard_notification_evidence()',t);
END LOOP; END $$;
CREATE TRIGGER notification_preference_lifecycle BEFORE INSERT OR UPDATE ON time.notification_preference FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
