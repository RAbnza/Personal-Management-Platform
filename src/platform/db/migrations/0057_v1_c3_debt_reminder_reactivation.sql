/* A cleared contractual due can be reopened by a released financial correction
 in the same immutable schedule. Advance only reminder metadata on resolution;
 never mutate obligation, schedule, payment or opening-satisfaction evidence. */
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
  (v.version_no + COALESCE(reminder_setting.notification_generation,1) - 1), 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.current_installment_due_v i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
LEFT JOIN time.source_reminder_setting reminder_setting ON reminder_setting.workspace_id=d.workspace_id AND reminder_setting.debt_obligation_id=i.obligation_id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.remaining_minor>0;


--> statement-breakpoint
CREATE OR REPLACE FUNCTION time.cancel_stale_reminders() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 WITH cancelled AS (UPDATE time.reminder_occurrence o SET state='cancelled',snoozed_until=NULL,dismissed_at=NULL,
 cancellation_reason='Source resolved, rescheduled, replaced or archived; or reminder configuration changed'
 WHERE o.workspace_id=NEW.workspace_id AND o.state<>'cancelled' AND NOT EXISTS (
  SELECT 1 FROM time.agenda_v a JOIN time.reminder_rule r ON r.workspace_id=o.workspace_id AND r.id=o.rule_id
  LEFT JOIN time.source_reminder_setting s ON s.workspace_id=o.workspace_id
   AND ROW(s.personal_event_id,s.application_event_id,s.debt_obligation_id) IS NOT DISTINCT FROM ROW(o.personal_event_id,o.application_event_id,o.debt_obligation_id)
  WHERE a.source_id=COALESCE(o.personal_event_id,o.application_event_id,o.debt_obligation_id)
   AND a.source_kind=CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' ELSE 'debt_installment' END
   AND a.occurrence_key=o.occurrence_key AND a.notification_generation=o.source_generation
   AND r.enabled AND r.generation=o.rule_generation
 ) RETURNING o.workspace_id,o.debt_obligation_id)
 INSERT INTO time.source_reminder_setting AS setting(workspace_id,debt_obligation_id,notification_generation)
 SELECT c.workspace_id,c.debt_obligation_id,2 FROM cancelled c
 WHERE c.debt_obligation_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM time.agenda_v a WHERE a.source_kind='debt_installment' AND a.source_id=c.debt_obligation_id)
 GROUP BY c.workspace_id,c.debt_obligation_id
 ON CONFLICT ON CONSTRAINT uq_reminder_setting_source DO UPDATE
 SET notification_generation=setting.notification_generation+1;
 RETURN NULL;
END $$;

--> statement-breakpoint
/* Repair any same-schedule reactivation already present when applying C3.
 Rule-generation cancellations are excluded; their rule itself advances. */
INSERT INTO time.source_reminder_setting AS setting(workspace_id,debt_obligation_id,notification_generation)
SELECT o.workspace_id,o.debt_obligation_id,2 FROM time.reminder_occurrence o
JOIN time.agenda_v a ON a.source_kind='debt_installment' AND a.source_id=o.debt_obligation_id
 AND a.occurrence_key=o.occurrence_key AND a.notification_generation=o.source_generation
JOIN time.reminder_rule r ON r.workspace_id=o.workspace_id AND r.id=o.rule_id AND r.enabled AND r.generation=o.rule_generation
WHERE o.state='cancelled' AND o.debt_obligation_id IS NOT NULL
GROUP BY o.workspace_id,o.debt_obligation_id
ON CONFLICT ON CONSTRAINT uq_reminder_setting_source DO UPDATE SET notification_generation=setting.notification_generation+1;
