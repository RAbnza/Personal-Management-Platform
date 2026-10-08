/* Current contractual satisfaction is independent of recognized accounting.
 * Aggregate each path before joining; include only the action's current,
 * posted, nonvoid payment revision. All source tables retain FORCE owner RLS. */
CREATE VIEW finance.current_installment_due_v WITH (security_invoker = true) AS
SELECT i.*,
  COALESCE(direct.amount,0) + COALESCE(mapped.amount,0) AS payment_satisfied_minor,
  CASE WHEN i.disposition='cancelled' THEN 0::numeric ELSE
    i.contractual_minor::numeric - i.opening_satisfied_minor
      - COALESCE(direct.amount,0) - COALESCE(mapped.amount,0)
  END AS remaining_minor
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id
  AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.scheduled_installment i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
LEFT JOIN LATERAL (
  SELECT sum(a.amount_minor::numeric) AS amount
  FROM finance.payment_due_allocation a
  JOIN finance.debt_payment_revision p ON p.workspace_id=a.workspace_id AND p.id=a.payment_revision_id AND p.debt_id=a.debt_id
  JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
  JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
  WHERE a.workspace_id=i.workspace_id AND a.debt_id=i.debt_id AND a.installment_id=i.id
    AND a.schedule_version_id=i.schedule_version_id AND p.paid_against_schedule_version_id=i.schedule_version_id
) direct ON true
LEFT JOIN LATERAL (
  SELECT sum(m.amount_minor::numeric) AS amount
  FROM finance.schedule_allocation_map m
  JOIN finance.debt_payment_revision p ON p.workspace_id=m.workspace_id AND p.id=m.payment_revision_id AND p.debt_id=m.debt_id
  JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
  JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
  WHERE m.workspace_id=i.workspace_id AND m.debt_id=i.debt_id AND m.target_schedule_version_id=i.schedule_version_id
    AND m.target_kind='installment' AND m.target_installment_id=i.id
    AND p.paid_against_schedule_version_id<>i.schedule_version_id
) mapped ON true;
--> statement-breakpoint
REVOKE ALL ON finance.current_installment_due_v FROM PUBLIC,auth_adapter,queue_broker,worker_domain,lifecycle_operator;
GRANT SELECT ON finance.current_installment_due_v TO app_domain;
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
SELECT 'debt_installment'::text, i.obligation_id, 'single'::text,
  d.name || ' · installment ' || i.sequence_no::text,
  v.version_no, 'date'::text, i.due_date, NULL::date,
  NULL::timestamptz, NULL::timestamptz, NULL::text, 'scheduled'::text, d.version
FROM finance.debt d
JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
JOIN finance.current_installment_due_v i ON i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
WHERE d.lifecycle='active' AND i.disposition='scheduled' AND i.remaining_minor>0;
