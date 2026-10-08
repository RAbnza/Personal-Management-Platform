import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { reconciliationStatus } from "@/modules/finance/domain/reconciliation";

export async function readDashboardDebts(
  t: ScopedTransaction,
  workspaceId: string,
  horizon: string,
) {
  const r = await t.db.execute<{
    debtId: string;
    name: string;
    liabilityMinor: string;
    clearingMinor: string;
    unclassifiedLiabilityMinor: string;
    unappliedMinor: string;
    breakdownStatus: string;
    lifecycle: string;
    cutoffDate: string | null;
    scheduledMinor: string | null;
    upcomingMinor: string;
    overdueMinor: string;
    dueDate: string | null;
  }>(sql`
    WITH balances AS (
      SELECT p.ledger_account_id,sum(p.amount_minor::numeric) AS amount,
        sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='unclassified') AS unclassified FROM finance.posting p
      JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
      JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
      WHERE p.workspace_id=${workspaceId}::uuid GROUP BY p.ledger_account_id
    ) SELECT d.id AS "debtId",d.name,(-COALESCE(b.amount,0))::text AS "liabilityMinor",COALESCE(c.amount,0)::text AS "clearingMinor",
      d.breakdown_status AS "breakdownStatus",d.lifecycle,d.opening_cutoff_date::text AS "cutoffDate",s.total::text AS "scheduledMinor",
      (-COALESCE(b.unclassified,0))::text AS "unclassifiedLiabilityMinor",
      (COALESCE(u.amount,0)-COALESCE(st.resolved_unapplied_minor,0))::text AS "unappliedMinor",
      COALESCE(s.upcoming,0)::text AS "upcomingMinor",COALESCE(s.overdue,0)::text AS "overdueMinor",s.due_date::text AS "dueDate"
    FROM finance.debt d LEFT JOIN balances b ON b.ledger_account_id=d.liability_ledger_account_id
    LEFT JOIN balances c ON c.ledger_account_id=d.clearing_ledger_account_id
    LEFT JOIN finance.debt_settlement st ON st.workspace_id=d.workspace_id AND st.debt_id=d.id AND st.closing_schedule_version_id=d.current_schedule_version_id
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN p.paid_against_schedule_version_id=d.current_schedule_version_id THEN p.unapplied_contractual_minor::numeric ELSE
        COALESCE((SELECT sum(m.amount_minor::numeric) FROM finance.schedule_allocation_map m WHERE m.workspace_id=p.workspace_id AND m.debt_id=d.id
          AND m.payment_revision_id=p.id AND m.target_schedule_version_id=d.current_schedule_version_id AND m.target_kind='unapplied'),0) END) AS amount
      FROM finance.debt_payment_revision p JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
      JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
      WHERE p.workspace_id=d.workspace_id AND p.debt_id=d.id
    ) u ON TRUE
    LEFT JOIN LATERAL (
      SELECT sum(i.remaining_minor) AS total,
        sum(i.remaining_minor) FILTER (WHERE i.due_date BETWEEN (transaction_timestamp() AT TIME ZONE w.timezone)::date AND ${horizon}::date) AS upcoming,
        sum(i.remaining_minor) FILTER (WHERE i.due_date<(transaction_timestamp() AT TIME ZONE w.timezone)::date) AS overdue,
        min(i.due_date) FILTER (WHERE i.remaining_minor>0) AS due_date
      FROM finance.current_installment_due_v i JOIN core.workspace w ON w.id=i.workspace_id
      WHERE i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=d.current_schedule_version_id AND i.disposition='scheduled' AND d.lifecycle='active'
    ) s ON TRUE WHERE d.workspace_id=${workspaceId}::uuid ORDER BY d.name,d.id
  `);
  return r.rows;
}

export async function readReconciliationAttention(
  t: ScopedTransaction,
  workspaceId: string,
) {
  const r = await t.db.execute<{
    accountId: string;
    name: string;
    observedMinor: string;
    calculatedMinor: string;
    sourceJournalCount: string;
    currentCalculatedMinor: string;
    currentSourceJournalCount: string;
    cutoffDate: string;
  }>(sql`
    SELECT a.id AS "accountId",a.name,r.observed_minor::text AS "observedMinor",r.calculated_minor::text AS "calculatedMinor",r.source_journal_count::text AS "sourceJournalCount",
      COALESCE(b.amount,0)::text AS "currentCalculatedMinor",COALESCE(b.sources,0)::text AS "currentSourceJournalCount",r.cutoff_date::text AS "cutoffDate"
    FROM finance.financial_account a
    JOIN LATERAL (SELECT x.* FROM finance.reconciliation x WHERE x.workspace_id=a.workspace_id AND x.financial_account_id=a.id
      AND NOT EXISTS(SELECT 1 FROM finance.reconciliation s WHERE s.workspace_id=x.workspace_id AND s.supersedes_reconciliation_id=x.id)
      ORDER BY x.cutoff_date DESC,x.created_at DESC,x.id DESC LIMIT 1) r ON TRUE
    LEFT JOIN LATERAL (SELECT sum(p.amount_minor::numeric) AS amount,count(DISTINCT j.id) AS sources FROM finance.posting p
      JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
      JOIN finance.action_revision ar ON ar.workspace_id=p.workspace_id AND ar.id=p.action_revision_id AND ar.state='posted'
      WHERE p.workspace_id=a.workspace_id AND p.ledger_account_id=a.ledger_account_id AND j.effective_date<=r.cutoff_date) b ON TRUE
    WHERE a.workspace_id=${workspaceId}::uuid ORDER BY a.name,a.id
  `);
  return r.rows
    .map((row) => ({
      ...row,
      ...reconciliationStatus({ ...row, supersededByReconciliationId: null }),
    }))
    .filter((row) => row.status !== "verified");
}

export async function readCareerSnapshot(
  t: ScopedTransaction,
  workspaceId: string,
  today: string,
  horizon: string,
) {
  const applications = await t.db.execute<{
    applicationId: string;
    company: string;
    role: string;
    stage: string;
    active: boolean;
  }>(sql`
    SELECT id AS "applicationId",company_name AS company,role_title AS role,current_stage AS stage,
      (current_stage<>'saved' AND current_outcome IS NULL) AS active
    FROM career.job_application WHERE workspace_id=${workspaceId}::uuid AND archived_at IS NULL AND current_outcome IS NULL ORDER BY company_name,id
  `);
  const events = await t.db.execute<{
    eventId: string;
    applicationId: string;
    title: string;
    kind: string;
    date: string;
  }>(sql`
    SELECT e.id AS "eventId",e.application_id AS "applicationId",e.title,e.event_kind AS kind,
      CASE WHEN e.temporal_kind='date' THEN e.event_date ELSE (e.starts_at AT TIME ZONE w.timezone)::date END::text AS date
    FROM career.application_event e JOIN career.job_application a ON a.workspace_id=e.workspace_id AND a.id=e.application_id AND a.archived_at IS NULL
    JOIN core.workspace w ON w.id=e.workspace_id
    WHERE e.workspace_id=${workspaceId}::uuid AND e.status='scheduled' AND e.event_kind IN ('interview','assessment','follow_up')
      AND ((e.temporal_kind='date' AND e.event_date BETWEEN ${today}::date AND ${horizon}::date)
        OR (e.temporal_kind='timed' AND e.starts_at>=(${today}::date::timestamp AT TIME ZONE w.timezone) AND e.starts_at<((${horizon}::date+1)::timestamp AT TIME ZONE w.timezone)))
    ORDER BY date,e.id
  `);
  return { applications: applications.rows, events: events.rows };
}

export async function readRecentActivity(
  t: ScopedTransaction,
  workspaceId: string,
) {
  const r = await t.db.execute<{
    key: string;
    title: string;
    href: string;
    recordedAt: string;
    detail: string;
  }>(sql`
    SELECT key,title,href,to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",detail FROM (
      SELECT f.id::text AS key,f.description AS title,'/money/actions/'||f.id AS href,r.created_at AS recorded_at,
        replace(r.action_kind,'_',' ')||' · revision '||r.revision_no||CASE WHEN r.change_kind='void' THEN ' · reversed' ELSE '' END AS detail
      FROM finance.financial_action f JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.id=f.current_revision_id AND r.state='posted' WHERE f.workspace_id=${workspaceId}::uuid
      UNION ALL
      SELECT key,title,href,recorded_at,detail FROM (
        SELECT DISTINCT ON (v.subject_kind,v.subject_id) v.subject_kind||':'||v.subject_id AS key,
          COALESCE(a.company_name||' · '||a.role_title,e.title,p.title) AS title,
          CASE WHEN v.subject_kind='personal_event' THEN '/calendar/events/'||p.id ELSE '/career/applications/'||COALESCE(a.id,e.application_id) END AS href,
          v.created_at AS recorded_at,replace(v.subject_kind,'_',' ')||' · version '||v.subject_version AS detail
        FROM audit.private_revision v
        LEFT JOIN career.job_application a ON v.subject_kind='job_application' AND a.workspace_id=v.workspace_id AND a.id=v.subject_id
        LEFT JOIN career.application_event e ON v.subject_kind='application_event' AND e.workspace_id=v.workspace_id AND e.id=v.subject_id
        LEFT JOIN time.personal_event p ON v.subject_kind='personal_event' AND p.workspace_id=v.workspace_id AND p.id=v.subject_id
        WHERE v.workspace_id=${workspaceId}::uuid AND v.subject_kind IN ('job_application','application_event','personal_event')
        ORDER BY v.subject_kind,v.subject_id,v.created_at DESC,v.id DESC
      ) source_changes WHERE href IS NOT NULL
    ) activity ORDER BY recorded_at DESC,key DESC LIMIT 10
  `);
  return r.rows;
}
