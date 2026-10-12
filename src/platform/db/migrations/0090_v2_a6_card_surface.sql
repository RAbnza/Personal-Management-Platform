/* Derived card evidence remains separate from recognized financial postings. */
CREATE VIEW finance.card_statement_due_v WITH(security_invoker=true) AS
SELECT s.workspace_id,s.id AS statement_id,s.card_id,s.version,r.id AS revision_id,r.statement_date,r.due_date,r.balance_minor,r.minimum_due_minor,r.provider_reference,
 COALESCE(a.amount,0)::numeric AS allocated_minor,
 GREATEST(r.balance_minor::numeric-COALESCE(a.amount,0),0) AS remaining_due_minor,
 GREATEST(-r.balance_minor::numeric,0) AS statement_credit_minor,
 COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.card_statement_allocation x JOIN finance.card_statement_revision old_revision ON old_revision.workspace_id=x.workspace_id AND old_revision.id=x.statement_revision_id WHERE old_revision.workspace_id=s.workspace_id AND old_revision.statement_id=s.id AND x.reverses_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.card_statement_allocation u WHERE u.workspace_id=x.workspace_id AND u.reverses_allocation_id=x.id) AND NOT EXISTS(SELECT 1 FROM finance.effective_card_allocation_v e WHERE e.workspace_id=x.workspace_id AND e.id=x.id)),0) AS unresolved_allocation_minor,
 (SELECT count(*) FROM finance.card_statement_entry line LEFT JOIN finance.financial_action f ON f.workspace_id=line.workspace_id AND f.current_revision_id=line.action_revision_id WHERE line.workspace_id=r.workspace_id AND line.statement_revision_id=r.id AND (line.action_revision_id IS NULL OR f.id IS NULL)) AS unresolved_entry_count
FROM finance.card_statement s JOIN finance.card_statement_revision r ON r.workspace_id=s.workspace_id AND r.id=s.current_revision_id AND r.state='verified'
LEFT JOIN LATERAL(SELECT sum(x.amount_minor::numeric) amount FROM finance.effective_card_allocation_v x WHERE x.workspace_id=r.workspace_id AND x.statement_revision_id=r.id) a ON true;
CREATE VIEW finance.card_installment_due_v WITH(security_invoker=true) AS
SELECT i.workspace_id,i.id AS installment_id,e.plan_id,e.card_id,e.plan_revision_id AS revision_id,e.revision_no AS version,i.sequence_no,i.due_date,e.lifecycle,e.eligible,i.principal_minor,i.interest_minor,i.fee_minor,i.total_minor,
 CASE WHEN e.eligible THEN i.principal_minor::numeric-COALESCE(a.p,0) END AS remaining_principal_minor,
 CASE WHEN e.eligible AND i.interest_minor IS NOT NULL THEN i.interest_minor::numeric-COALESCE(a.i,0) END AS remaining_interest_minor,
 CASE WHEN e.eligible AND i.fee_minor IS NOT NULL THEN i.fee_minor::numeric-COALESCE(a.f,0) END AS remaining_fee_minor,
 CASE WHEN e.eligible THEN COALESCE(i.total_minor::numeric,CASE WHEN i.interest_minor IS NOT NULL AND i.fee_minor IS NOT NULL THEN i.principal_minor::numeric+i.interest_minor::numeric+i.fee_minor::numeric END)-COALESCE(a.p,0)-COALESCE(a.i,0)-COALESCE(a.f,0) END AS remaining_total_minor
FROM finance.card_installment_evidence_v e JOIN finance.card_installment i ON i.workspace_id=e.workspace_id AND i.plan_revision_id=e.plan_revision_id
LEFT JOIN LATERAL(SELECT sum(x.principal_minor::numeric) p,sum(x.interest_minor::numeric) i,sum(x.fee_minor::numeric) f FROM finance.effective_card_installment_application_v x WHERE x.workspace_id=i.workspace_id AND x.plan_revision_id=i.plan_revision_id AND x.installment_no=i.sequence_no) a ON true;
REVOKE ALL ON finance.card_statement_due_v,finance.card_installment_due_v FROM PUBLIC;
GRANT SELECT ON finance.card_statement_due_v,finance.card_installment_due_v TO app_domain,lifecycle_operator;
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
  (v.version_no + COALESCE(reminder_setting.notification_generation,1) - 1), 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.current_installment_due_v i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
LEFT JOIN time.source_reminder_setting reminder_setting ON reminder_setting.workspace_id=d.workspace_id AND reminder_setting.debt_obligation_id=i.obligation_id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.remaining_minor>0
UNION ALL SELECT 'card_statement',d.statement_id,'statement:'||d.revision_id::text,c.name||' - verified statement due',
 d.version+COALESCE(setting.notification_generation,1)-1,'date',d.due_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled',d.version
FROM finance.card_statement_due_v d JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.id=d.card_id
LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=d.workspace_id AND setting.card_statement_id=d.statement_id WHERE d.remaining_due_minor>0
UNION ALL SELECT 'card_installment',d.installment_id,'plan:'||d.revision_id::text,c.name||' - projected installment '||d.sequence_no::text,
 d.version+COALESCE(setting.notification_generation,1)-1,'date',d.due_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled',d.version
FROM finance.card_installment_due_v d JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.id=d.card_id
LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=d.workspace_id AND setting.card_installment_id=d.installment_id WHERE d.eligible AND d.due_date IS NOT NULL AND (d.remaining_total_minor IS NULL OR d.remaining_total_minor>0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION time.guard_reminder_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW.workspace_id,NEW.personal_event_id,NEW.application_event_id,NEW.debt_obligation_id,NEW.card_statement_id,NEW.card_installment_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.personal_event_id,OLD.application_event_id,OLD.debt_obligation_id,OLD.card_statement_id,OLD.card_installment_id,OLD.created_at) THEN
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



--> statement-breakpoint
CREATE OR REPLACE FUNCTION time.validate_reminder_relation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r "time".reminder_rule; m text;
BEGIN
 SELECT * INTO r FROM time.reminder_rule WHERE workspace_id=NEW.workspace_id AND id=NEW.rule_id;
 m:=CASE WHEN NEW.personal_event_id IS NOT NULL THEN 'time' WHEN NEW.application_event_id IS NOT NULL THEN 'career' ELSE 'money' END;
 IF r.id IS NULL OR NOT (
 (r.module_key=m AND num_nonnulls(r.personal_event_id,r.application_event_id,r.debt_obligation_id,r.card_statement_id,r.card_installment_id)=0)
 OR (r.module_key IS NULL AND ROW(r.personal_event_id,r.application_event_id,r.debt_obligation_id,r.card_statement_id,r.card_installment_id)
 IS NOT DISTINCT FROM ROW(NEW.personal_event_id,NEW.application_event_id,NEW.debt_obligation_id,NEW.card_statement_id,NEW.card_installment_id))) THEN
 RAISE EXCEPTION 'reminder rule must belong to the resolved source/module' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION time.validate_reminder_relation() FROM PUBLIC;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION time.cancel_stale_reminders() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
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
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['card_statement','card_statement_allocation','card_installment_plan','card_installment_application','financial_action'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER card_reminder_cancellation AFTER INSERT OR UPDATE ON finance.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION time.cancel_stale_reminders()',relation);
 END LOOP;
END $$;
