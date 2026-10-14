/* Egress worker cannot fabricate inbound provider events. Only the narrow
 * authenticated-webhook adapter records them; RLS still scopes status reads. */
REVOKE INSERT ON time.notification_provider_event FROM worker_domain;
REVOKE EXECUTE ON FUNCTION ops.record_notification_event(text,text,text,timestamptz,uuid,text) FROM worker_domain;
CREATE FUNCTION time.guard_notification_delivery_origin() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='INSERT' AND (NEW.status NOT IN('scheduled','suppressed') OR NEW.provider_message_id IS NOT NULL OR NEW.accepted_at IS NOT NULL OR NEW.delivered_at IS NOT NULL) THEN RAISE EXCEPTION 'delivery starts with scheduling evidence' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.status='bounced' AND NOT EXISTS(SELECT 1 FROM time.notification_provider_event WHERE workspace_id=NEW.workspace_id AND delivery_id=NEW.id AND event_type='email.bounced') THEN RAISE EXCEPTION 'bounce requires provider evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time.guard_notification_delivery_origin() FROM PUBLIC;
CREATE TRIGGER notification_delivery_origin BEFORE INSERT OR UPDATE ON time.notification_delivery FOR EACH ROW EXECUTE FUNCTION time.guard_notification_delivery_origin();
