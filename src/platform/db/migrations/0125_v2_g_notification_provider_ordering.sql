/* Preserve both delivery and later bounce evidence without allowing replay. */
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('time.guard_notification_evidence()'::regprocedure) INTO definition;
 definition:=replace(definition,'OLD.status IN(''delivered'',''bounced'',''suppressed'',''cancelled'')','OLD.status IN(''bounced'',''suppressed'',''cancelled'')');
 EXECUTE definition;
END $$;
CREATE FUNCTION time.guard_notification_delivery_finality() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.status='delivered' AND NEW.status NOT IN('delivered','bounced') OR OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN RAISE EXCEPTION 'provider history cannot be rewritten or replayed' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time.guard_notification_delivery_finality() FROM PUBLIC;
CREATE TRIGGER notification_delivery_finality BEFORE UPDATE ON time.notification_delivery FOR EACH ROW EXECUTE FUNCTION time.guard_notification_delivery_finality();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ops.record_notification_event(event_id text,message_id text,kind text,occurred timestamptz,tag_id uuid,recipient_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d "time".notification_delivery; p "time".notification_preference; existing "time".notification_provider_event; previous_user text:=current_setting('app.user_id',true); previous_workspace text:=current_setting('app.workspace_id',true); BEGIN
 IF kind NOT IN('email.sent','email.delivered','email.bounced','email.failed') OR length(event_id) NOT BETWEEN 1 AND 200 OR length(message_id) NOT BETWEEN 1 AND 200 OR occurred>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid notification event' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM time.notification_delivery WHERE provider_message_id=message_id OR (id=tag_id AND provider_message_id IS NULL AND status IN('attempted','uncertain')) ORDER BY provider_message_id NULLS LAST LIMIT 1;
 IF d.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO p FROM time.notification_preference WHERE workspace_id=d.workspace_id;
 PERFORM set_config('app.user_id',p.user_id::text,true);PERFORM set_config('app.workspace_id',d.workspace_id::text,true);
 SELECT * INTO d FROM time.notification_delivery WHERE id=d.id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM time.notification_attempt a WHERE a.delivery_id=d.id AND a.recipient_fingerprint=recipient_hash AND a.started_at<=occurred+interval '5 minutes') OR d.provider_message_id IS NOT NULL AND d.provider_message_id<>message_id THEN
  PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RETURN false;
 END IF;
 INSERT INTO time.notification_provider_event(workspace_id,delivery_id,provider_event_id,event_type,occurred_at) VALUES(d.workspace_id,d.id,event_id,kind,occurred) ON CONFLICT(provider_event_id) DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO existing FROM time.notification_provider_event WHERE provider_event_id=event_id;
  IF existing.delivery_id IS DISTINCT FROM d.id OR existing.event_type IS DISTINCT FROM kind OR existing.occurred_at IS DISTINCT FROM occurred THEN RAISE EXCEPTION 'provider event identity conflict' USING ERRCODE='23514'; END IF;
 ELSE
  UPDATE time.notification_attempt SET outcome='accepted',finished_at=clock_timestamp() WHERE delivery_id=d.id AND outcome='attempted';
  IF d.status IN('attempted','uncertain','accepted') OR d.status='delivered' AND kind='email.bounced' THEN
   UPDATE time.notification_delivery SET provider_message_id=message_id,accepted_at=COALESCE(accepted_at,occurred),delivered_at=CASE WHEN kind='email.delivered' THEN COALESCE(delivered_at,occurred) ELSE delivered_at END,status=CASE kind WHEN 'email.delivered' THEN 'delivered' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.failed' THEN 'failed' ELSE 'accepted' END,last_error_code=CASE WHEN kind IN('email.bounced','email.failed') THEN 'provider_terminal' ELSE NULL END WHERE id=d.id;
  END IF;
 END IF;
 PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RETURN true;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RAISE;
END $$;
--> statement-breakpoint
CREATE FUNCTION ops.notification_backlog() RETURNS TABLE(due_count bigint,age_ms double precision,uncertain_count bigint,failed_count bigint) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(*) FILTER(WHERE status='scheduled' AND scheduled_at<=clock_timestamp()),COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(scheduled_at) FILTER(WHERE status='scheduled' AND scheduled_at<=clock_timestamp()))*1000,0)::double precision,count(*) FILTER(WHERE status IN('attempted','uncertain')),count(*) FILTER(WHERE status='failed') FROM time.notification_delivery
$$;
REVOKE ALL ON FUNCTION ops.notification_backlog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.notification_backlog() TO worker_domain;
