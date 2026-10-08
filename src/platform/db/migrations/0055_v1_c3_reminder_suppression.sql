/* Preference suppression retains acknowledgement independently of source lifecycle. */
CREATE OR REPLACE FUNCTION time.cancel_stale_reminders() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
   AND r.enabled AND r.generation=o.rule_generation
 );
 RETURN NULL;
END $$;
