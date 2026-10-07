/* Project only current, unpaid imported obligations. Stable obligation IDs
 * survive schedule revisions. This remains an invoker-security view: the
 * runtime role's table grants and forced owner RLS govern every source. */
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
SELECT 'debt_installment'::text, i.obligation_id, 'single'::text,
  d.name || ' · installment ' || i.sequence_no::text,
  v.version_no, 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.scheduled_installment i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.contractual_minor>i.opening_satisfied_minor;
