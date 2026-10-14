/* Signed-webhook adapter has no private schema access. Deferred graph checks
 * resolve their scope from persisted delivery ownership, then restore context. */
CREATE FUNCTION time.validate_notification_delivery_graph() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d "time".notification_delivery; p "time".notification_preference; previous_user text:=current_setting('app.user_id',true); previous_workspace text:=current_setting('app.workspace_id',true); BEGIN
 SELECT * INTO d FROM time.notification_delivery WHERE id=NEW.id;
 IF d.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM time.notification_preference WHERE workspace_id=d.workspace_id;
 PERFORM set_config('app.user_id',p.user_id::text,true);PERFORM set_config('app.workspace_id',d.workspace_id::text,true);
 IF d.status IN('attempted','uncertain','accepted','delivered','bounced','failed') AND NOT EXISTS(SELECT 1 FROM time.notification_attempt WHERE delivery_id=d.id) THEN RAISE EXCEPTION 'notification attempt evidence missing' USING ERRCODE='23514'; END IF;
 IF d.status IN('accepted','delivered','bounced') AND (d.accepted_at IS NULL OR d.provider_message_id IS NULL OR NOT (EXISTS(SELECT 1 FROM time.notification_attempt WHERE delivery_id=d.id AND outcome='accepted') OR EXISTS(SELECT 1 FROM time.notification_provider_event WHERE delivery_id=d.id))) THEN RAISE EXCEPTION 'provider acceptance evidence missing' USING ERRCODE='23514'; END IF;
 IF d.status='delivered' AND (d.delivered_at IS NULL OR NOT EXISTS(SELECT 1 FROM time.notification_provider_event WHERE delivery_id=d.id AND event_type='email.delivered')) THEN RAISE EXCEPTION 'provider delivery evidence missing' USING ERRCODE='23514'; END IF;
 PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RETURN NULL;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.user_id',COALESCE(previous_user,''),true);PERFORM set_config('app.workspace_id',COALESCE(previous_workspace,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION time.validate_notification_delivery_graph() FROM PUBLIC;
DROP TRIGGER notification_delivery_graph ON time.notification_delivery;
CREATE CONSTRAINT TRIGGER notification_delivery_graph AFTER INSERT OR UPDATE ON time.notification_delivery DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.validate_notification_delivery_graph();
