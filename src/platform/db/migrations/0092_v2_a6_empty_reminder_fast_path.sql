CREATE OR REPLACE FUNCTION time.cancel_stale_reminders() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- A cancellation and its epoch advance require a surviving stored occurrence.
 -- Avoid rebuilding source projections for ordinary writes with empty history.
 IF NOT EXISTS(SELECT 1 FROM time.reminder_occurrence o WHERE o.workspace_id=app.workspace_id() AND o.state<>'cancelled') THEN RETURN NULL; END IF;
 WITH cancelled AS (UPDATE time.reminder_occurrence o SET state='cancelled',snoozed_until=NULL,dismissed_at=NULL,
 cancellation_reason='Source resolved, superseded or requires reconciliation; or reminder rule changed'
 WHERE o.workspace_id=NEW.workspace_id AND o.state<>'cancelled' AND NOT EXISTS(
  SELECT 1 FROM time.agenda_v a JOIN time.reminder_rule r ON r.workspace_id=o.workspace_id AND r.id=o.rule_id
  WHERE a.source_id=COALESCE(o.personal_event_id,o.application_event_id,o.debt_obligation_id,o.card_statement_id,o.card_installment_id) AND a.source_kind=CASE WHEN o.personal_event_id IS NOT NULL THEN 'personal_event' WHEN o.application_event_id IS NOT NULL THEN 'application_event' WHEN o.debt_obligation_id IS NOT NULL THEN 'debt_installment' WHEN o.card_statement_id IS NOT NULL THEN 'card_statement' ELSE 'card_installment' END
   AND a.occurrence_key=o.occurrence_key AND a.notification_generation=o.source_generation AND r.enabled AND r.generation=o.rule_generation
 ) RETURNING o.workspace_id,o.debt_obligation_id,o.card_statement_id,o.card_installment_id)
 INSERT INTO time.source_reminder_setting AS setting(workspace_id,debt_obligation_id,card_statement_id,card_installment_id,notification_generation)
 SELECT c.workspace_id,c.debt_obligation_id,c.card_statement_id,c.card_installment_id,2 FROM cancelled c
 WHERE num_nonnulls(c.debt_obligation_id,c.card_statement_id,c.card_installment_id)=1 AND NOT EXISTS(
  SELECT 1 FROM time.agenda_v a WHERE a.source_id=COALESCE(c.debt_obligation_id,c.card_statement_id,c.card_installment_id) AND a.source_kind=CASE WHEN c.debt_obligation_id IS NOT NULL THEN 'debt_installment' WHEN c.card_statement_id IS NOT NULL THEN 'card_statement' ELSE 'card_installment' END)
 GROUP BY c.workspace_id,c.debt_obligation_id,c.card_statement_id,c.card_installment_id
 ON CONFLICT ON CONSTRAINT uq_reminder_setting_source DO UPDATE SET notification_generation=setting.notification_generation+1;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.cancel_stale_reminders() FROM PUBLIC;
