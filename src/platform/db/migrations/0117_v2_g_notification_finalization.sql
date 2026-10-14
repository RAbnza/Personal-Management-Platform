/* Lifecycle locking must not prevent cancelling an unverified recipient. */
CREATE OR REPLACE FUNCTION ops.lock_notification_scope() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM core.user_profile p JOIN core.workspace w ON w.owner_user_id=p.user_id WHERE p.user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND p.lifecycle='active' AND w.state='active' FOR SHARE OF p,w;
 IF NOT FOUND THEN RAISE EXCEPTION 'notification scope inactive' USING ERRCODE='42501'; END IF;
END $$;
--> statement-breakpoint
CREATE POLICY notification_provider_write ON time.notification_delivery TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY notification_provider_write ON time.notification_attempt TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
CREATE POLICY notification_provider_write ON time.notification_provider_event TO migration_owner USING(workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid);
CREATE FUNCTION time.cancel_notification_consent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT NEW.enabled THEN UPDATE time.notification_delivery SET status='cancelled',last_error_code='consent_revoked' WHERE workspace_id=NEW.workspace_id AND status IN('scheduled','failed'); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.cancel_notification_consent() FROM PUBLIC;
CREATE TRIGGER notification_consent_cancellation AFTER INSERT OR UPDATE ON time.notification_preference FOR EACH ROW EXECUTE FUNCTION time.cancel_notification_consent();
--> statement-breakpoint
CREATE FUNCTION ops.record_notification_event(event_id text,message_id text,kind text,occurred timestamptz,tag_id uuid,recipient_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d "time".notification_delivery; p "time".notification_preference; previous_user text:=current_setting('app.user_id',true); previous_workspace text:=current_setting('app.workspace_id',true); BEGIN
 IF kind NOT IN('email.sent','email.delivered','email.bounced','email.failed') OR length(event_id) NOT BETWEEN 1 AND 200 OR length(message_id) NOT BETWEEN 1 AND 200 OR occurred>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid notification event' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM time.notification_delivery WHERE provider_message_id=message_id OR (id=tag_id AND provider_message_id IS NULL AND status IN('attempted','uncertain')) ORDER BY provider_message_id NULLS LAST LIMIT 1;
 IF d.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO p FROM time.notification_preference WHERE workspace_id=d.workspace_id;
 PERFORM set_config('app.user_id',p.user_id::text,true); PERFORM set_config('app.workspace_id',d.workspace_id::text,true);
 SELECT * INTO d FROM time.notification_delivery WHERE id=d.id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM time.notification_attempt a WHERE a.delivery_id=d.id AND a.recipient_fingerprint=recipient_hash AND a.started_at<=occurred+interval '5 minutes') OR d.provider_message_id IS NOT NULL AND d.provider_message_id<>message_id THEN PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RETURN false; END IF;
 INSERT INTO time.notification_provider_event(workspace_id,delivery_id,provider_event_id,event_type,occurred_at) VALUES(d.workspace_id,d.id,event_id,kind,occurred) ON CONFLICT(provider_event_id) DO NOTHING;
 IF NOT FOUND THEN PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RETURN true; END IF;
 IF d.status IN('attempted','uncertain','accepted') THEN
  UPDATE time.notification_delivery SET provider_message_id=message_id,accepted_at=COALESCE(accepted_at,occurred),delivered_at=CASE WHEN kind='email.delivered' THEN occurred ELSE delivered_at END,status=CASE kind WHEN 'email.delivered' THEN 'delivered' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.failed' THEN 'failed' ELSE 'accepted' END,last_error_code=CASE WHEN kind IN('email.bounced','email.failed') THEN 'provider_terminal' ELSE NULL END WHERE id=d.id;
 END IF;
 PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);
 RETURN true;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION ops.record_notification_event(text,text,text,timestamptz,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.record_notification_event(text,text,text,timestamptz,uuid,text) TO auth_adapter,worker_domain;
--> statement-breakpoint
CREATE FUNCTION time.validate_notification_graph() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d "time".notification_delivery; p "time".notification_preference; c core.command_receipt; BEGIN
 IF TG_TABLE_NAME='notification_preference' THEN
  SELECT * INTO p FROM time.notification_preference WHERE id=NEW.id;
  SELECT * INTO c FROM core.command_receipt WHERE id=p.command_receipt_id AND workspace_id=p.workspace_id;
  IF c.state IS DISTINCT FROM 'completed' OR c.result_json IS DISTINCT FROM jsonb_build_object('saved',true,'version',p.version) OR NOT EXISTS(SELECT 1 FROM audit.private_revision a WHERE a.workspace_id=p.workspace_id AND a.command_receipt_id=c.id AND a.subject_kind='notification_preference' AND a.subject_id=p.id AND a.subject_version=p.version AND a.recorded_by_user_id=p.user_id) THEN RAISE EXCEPTION 'notification preference command or audit incomplete' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO d FROM time.notification_delivery WHERE id=NEW.id;
  IF d.status IN('attempted','uncertain','accepted','delivered','bounced','failed') AND NOT EXISTS(SELECT 1 FROM time.notification_attempt WHERE delivery_id=d.id) THEN RAISE EXCEPTION 'notification attempt evidence missing' USING ERRCODE='23514'; END IF;
  IF d.status IN('accepted','delivered','bounced') AND (d.accepted_at IS NULL OR d.provider_message_id IS NULL OR NOT (EXISTS(SELECT 1 FROM time.notification_attempt WHERE delivery_id=d.id AND outcome='accepted') OR EXISTS(SELECT 1 FROM time.notification_provider_event WHERE delivery_id=d.id))) THEN RAISE EXCEPTION 'provider acceptance evidence missing' USING ERRCODE='23514'; END IF;
  IF d.status='delivered' AND (d.delivered_at IS NULL OR NOT EXISTS(SELECT 1 FROM time.notification_provider_event WHERE delivery_id=d.id AND event_type='email.delivered')) THEN RAISE EXCEPTION 'provider delivery evidence missing' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.validate_notification_graph() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER notification_preference_graph AFTER INSERT OR UPDATE ON time.notification_preference DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.validate_notification_graph();
CREATE CONSTRAINT TRIGGER notification_delivery_graph AFTER INSERT OR UPDATE ON time.notification_delivery DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.validate_notification_graph();

