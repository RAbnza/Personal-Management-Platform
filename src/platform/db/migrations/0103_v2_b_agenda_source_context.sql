/* Emit source-owned calendar context once; avoid repeated RLS joins during projection. */
CREATE OR REPLACE VIEW time.agenda_v WITH (security_invoker = true) AS
SELECT 'personal_event'::text AS source_kind, e.id AS source_id,
  'single'::text AS occurrence_key, e.title, e.notification_generation,
  e.temporal_kind, e.event_date, e.end_date_exclusive, e.starts_at, e.ends_at,
  e.timezone, e.status, e.version AS source_version, NULL::text AS definition_timezone
FROM time.personal_event e WHERE e.status='scheduled'
UNION ALL
SELECT 'application_event'::text, e.id, 'single'::text, e.title,
  e.notification_generation, e.temporal_kind, e.event_date, NULL::date,
  e.starts_at, e.ends_at, e.timezone, e.status, e.version, NULL::text
FROM career.application_event e
JOIN career.job_application a ON a.workspace_id=e.workspace_id AND a.id=e.application_id
WHERE e.status='scheduled' AND e.event_kind IN ('interview','assessment','follow_up') AND a.archived_at IS NULL
UNION ALL
SELECT 'debt_installment'::text, i.obligation_id, ('schedule:' || v.id::text),
  d.name || ' · installment ' || i.sequence_no::text,
  (v.version_no + COALESCE(reminder_setting.notification_generation,1) - 1), 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version, NULL::text
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.current_installment_due_v i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
LEFT JOIN time.source_reminder_setting reminder_setting ON reminder_setting.workspace_id=d.workspace_id AND reminder_setting.debt_obligation_id=i.obligation_id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.remaining_minor>0
UNION ALL SELECT 'card_statement',d.statement_id,'statement:'||d.revision_id::text,c.name||' - verified statement due',
 d.version+COALESCE(setting.notification_generation,1)-1,'date',d.due_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled',d.version,NULL::text
FROM finance.card_statement_due_v d JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.id=d.card_id
LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=d.workspace_id AND setting.card_statement_id=d.statement_id WHERE d.remaining_due_minor>0
UNION ALL SELECT 'card_installment',d.installment_id,'plan:'||d.revision_id::text,c.name||' - projected installment '||d.sequence_no::text,
 d.version+COALESCE(setting.notification_generation,1)-1,'date',d.due_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled',d.version,NULL::text
FROM finance.card_installment_due_v d JOIN finance.credit_card c ON c.workspace_id=d.workspace_id AND c.id=d.card_id
LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=d.workspace_id AND setting.card_installment_id=d.installment_id WHERE d.eligible AND d.due_date IS NOT NULL AND (d.remaining_total_minor IS NULL OR d.remaining_total_minor>0)
UNION ALL SELECT 'expected_occurrence',o.id,'expected:'||o.generation::text,o.name||' - planned recurring '||o.kind,
 o.notification_generation+COALESCE(setting.notification_generation,1)-1,'date',o.due_date,NULL::date,NULL::timestamptz,NULL::timestamptz,NULL::text,'scheduled',o.version,o.timezone
FROM planning.occurrence_due_v o LEFT JOIN time.source_reminder_setting setting ON setting.workspace_id=o.workspace_id AND setting.expected_occurrence_id=o.id WHERE o.state IN('planned','linked') AND o.remaining_minor>0;
