/* V1 in-app only. Source evidence, clocks and reminder state remain separate. */
REVOKE ALL ON time.reminder_rule FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON time.reminder_rule TO app_domain;
ALTER TABLE time.reminder_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE time.reminder_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY reminder_rule_owner_access ON time.reminder_rule FOR ALL TO app_domain
USING (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'))
WITH CHECK (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'));
CREATE TRIGGER a0_private_domain_write_guard BEFORE INSERT OR UPDATE ON time.reminder_rule FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
--> statement-breakpoint
REVOKE ALL ON time.source_reminder_setting FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON time.source_reminder_setting TO app_domain;
ALTER TABLE time.source_reminder_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE time.source_reminder_setting FORCE ROW LEVEL SECURITY;
CREATE POLICY source_reminder_setting_owner_access ON time.source_reminder_setting FOR ALL TO app_domain
USING (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'))
WITH CHECK (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'));
CREATE TRIGGER a0_private_domain_write_guard BEFORE INSERT OR UPDATE ON time.source_reminder_setting FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
--> statement-breakpoint
REVOKE ALL ON time.reminder_occurrence FROM PUBLIC,app_domain,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT,INSERT,UPDATE ON time.reminder_occurrence TO app_domain;
ALTER TABLE time.reminder_occurrence ENABLE ROW LEVEL SECURITY;
ALTER TABLE time.reminder_occurrence FORCE ROW LEVEL SECURITY;
CREATE POLICY reminder_occurrence_owner_access ON time.reminder_occurrence FOR ALL TO app_domain
USING (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'))
WITH CHECK (workspace_id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id
 WHERE w.id=workspace_id AND w.owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid AND w.state='active' AND u.lifecycle='active'));
CREATE TRIGGER a0_private_domain_write_guard BEFORE INSERT OR UPDATE ON time.reminder_occurrence FOR EACH ROW EXECUTE FUNCTION core.guard_active_private_domain_write();
--> statement-breakpoint
CREATE OR REPLACE VIEW time.agenda_v WITH (security_invoker = true) AS
SELECT 'personal_event'::text AS source_kind, e.id AS source_id,
  'single'::text AS occurrence_key, e.title, e.notification_generation,
  e.temporal_kind, e.event_date, e.end_date_exclusive, e.starts_at, e.ends_at,
  e.timezone, e.status, e.version AS source_version
FROM time.personal_event e WHERE e.status='scheduled'
UNION ALL
SELECT 'application_event'::text, e.id, 'single'::text, e.title,
  e.notification_generation, e.temporal_kind, e.event_date, NULL::date,
  e.starts_at, e.ends_at, e.timezone, e.status, e.version
FROM career.application_event e
JOIN career.job_application a ON a.workspace_id=e.workspace_id AND a.id=e.application_id
WHERE e.status='scheduled' AND e.event_kind IN ('interview','assessment','follow_up') AND a.archived_at IS NULL
UNION ALL
SELECT 'debt_installment'::text, i.obligation_id, ('schedule:' || v.id::text),
  d.name || ' · installment ' || i.sequence_no::text,
  v.version_no, 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.current_installment_due_v i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.remaining_minor>0;

--> statement-breakpoint
CREATE FUNCTION time.guard_reminder_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW.workspace_id,NEW.personal_event_id,NEW.application_event_id,NEW.debt_obligation_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.personal_event_id,OLD.application_event_id,OLD.debt_obligation_id,OLD.created_at) THEN
 RAISE EXCEPTION 'reminder identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='reminder_rule' THEN
  IF ROW(NEW.module_key,NEW.channel,NEW.offset_days,NEW.local_time) IS DISTINCT FROM ROW(OLD.module_key,OLD.channel,OLD.offset_days,OLD.local_time) THEN
   RAISE EXCEPTION 'replace a rule using a new identity' USING ERRCODE='23514'; END IF;
  NEW.generation:=OLD.generation + CASE WHEN NEW.enabled IS DISTINCT FROM OLD.enabled THEN 1 ELSE 0 END;
 ELSIF TG_TABLE_NAME='reminder_occurrence' THEN
  IF ROW(NEW.rule_id,NEW.occurrence_key,NEW.source_generation,NEW.rule_generation,NEW.scheduled_for)
  IS DISTINCT FROM ROW(OLD.rule_id,OLD.occurrence_key,OLD.source_generation,OLD.rule_generation,OLD.scheduled_for) THEN
   RAISE EXCEPTION 'reminder occurrence generation is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION time.guard_reminder_identity() FROM PUBLIC;
CREATE TRIGGER reminder_rule_identity BEFORE UPDATE ON time.reminder_rule FOR EACH ROW EXECUTE FUNCTION time.guard_reminder_identity();
CREATE TRIGGER reminder_setting_identity BEFORE UPDATE ON time.source_reminder_setting FOR EACH ROW EXECUTE FUNCTION time.guard_reminder_identity();
CREATE TRIGGER reminder_occurrence_identity BEFORE UPDATE ON time.reminder_occurrence FOR EACH ROW EXECUTE FUNCTION time.guard_reminder_identity();
--> statement-breakpoint
CREATE FUNCTION time.validate_reminder_relation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r "time".reminder_rule; m text;
BEGIN
 SELECT * INTO r FROM time.reminder_rule WHERE workspace_id=NEW.workspace_id AND id=NEW.rule_id;
 m:=CASE WHEN NEW.personal_event_id IS NOT NULL THEN 'time' WHEN NEW.application_event_id IS NOT NULL THEN 'career' ELSE 'money' END;
 IF r.id IS NULL OR NOT (
 (r.module_key=m AND num_nonnulls(r.personal_event_id,r.application_event_id,r.debt_obligation_id)=0)
 OR (r.module_key IS NULL AND ROW(r.personal_event_id,r.application_event_id,r.debt_obligation_id)
 IS NOT DISTINCT FROM ROW(NEW.personal_event_id,NEW.application_event_id,NEW.debt_obligation_id))) THEN
 RAISE EXCEPTION 'reminder rule must belong to the resolved source/module' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.validate_reminder_relation() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER reminder_occurrence_relation AFTER INSERT OR UPDATE ON time.reminder_occurrence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.validate_reminder_relation();
--> statement-breakpoint
/* Derived cancellation participates in the same source transaction. Deferral
 allows payment allocations, schedule mappings and settlement to finalize first.
 Reads also validate current sources, even before these checks run. */
CREATE FUNCTION time.cancel_stale_reminders() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 UPDATE time.reminder_occurrence o SET state='cancelled',snoozed_until=NULL,dismissed_at=NULL,
 cancellation_reason='Source resolved, rescheduled, replaced or archived; or reminder configuration changed'
 WHERE o.workspace_id=NEW.workspace_id AND o.state<>'cancelled' AND NOT EXISTS (
  SELECT 1 FROM time.agenda_v a JOIN time.reminder_rule r ON r.workspace_id=o.workspace_id AND r.id=o.rule_id
  LEFT JOIN time.source_reminder_setting s ON s.workspace_id=o.workspace_id
   AND ROW(s.personal_event_id,s.application_event_id,s.debt_obligation_id) IS NOT DISTINCT FROM ROW(o.personal_event_id,o.application_event_id,o.debt_obligation_id)
  WHERE a.source_id=COALESCE(o.personal_event_id,o.application_event_id,o.debt_obligation_id)
   AND a.source_kind=CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' ELSE 'debt_installment' END
   AND a.occurrence_key=o.occurrence_key AND a.notification_generation=o.source_generation
   AND r.enabled AND r.generation=o.rule_generation AND COALESCE(s.mode,'inherit')<>'off'
   AND ((COALESCE(s.mode,'inherit')='inherit' AND r.module_key IS NOT NULL) OR (s.mode='override' AND r.module_key IS NULL))
 );
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.cancel_stale_reminders() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER personal_event_reminder_cancellation AFTER INSERT OR UPDATE ON time.personal_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER application_event_reminder_cancellation AFTER INSERT OR UPDATE ON career.application_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER job_application_reminder_cancellation AFTER INSERT OR UPDATE ON career.job_application DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER debt_reminder_cancellation AFTER INSERT OR UPDATE ON finance.debt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER reminder_rule_reminder_cancellation AFTER INSERT OR UPDATE ON time.reminder_rule DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
CREATE CONSTRAINT TRIGGER source_reminder_setting_reminder_cancellation AFTER INSERT OR UPDATE ON time.source_reminder_setting DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders();
