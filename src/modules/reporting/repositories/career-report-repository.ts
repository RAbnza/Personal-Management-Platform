import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type { ReportPeriod } from "../domain/period";

export type CohortApplication = {
  applicationId: string;
  company: string;
  role: string;
  source: string | null;
  appliedDate: string;
  stage: string | null;
  outcome: string | null;
  archived: boolean;
  version: number;
  historyId: string | null;
};
export type CareerReportEvent = {
  eventId: string;
  applicationId: string;
  title: string;
  kind: string;
  date: string;
  startsAt: string | null;
  status: string;
  version: number;
  inCohort: boolean;
  inPeriod: boolean;
  source: string | null;
};
export type CareerStageDuration = {
  historyId: string;
  applicationId: string;
  stage: string;
  outcome: string | null;
  sequenceNo: number;
  effectiveOrder: number;
  effectiveDate: string;
  endDate: string;
  elapsedDays: number;
  open: boolean;
};

/** Independent application/history/event grains. Current corrected knowledge,
 * not a historical database reconstruction. Cohort events extend past the
 * submission period; event-period activity remains distinct. No contacts,
 * salary, notes or private revision snapshots enter this read. */
export async function readCareerReport(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
  asOfDate: string,
) {
  const cohort = await t.db.execute<CohortApplication>(sql`
    SELECT a.id AS "applicationId",a.company_name AS company,a.role_title AS role,a.source_name AS source,a.applied_date::text AS "appliedDate",
      h.stage,h.outcome,h.id AS "historyId",a.archived_at IS NOT NULL AS archived,a.version
    FROM career.job_application a
    LEFT JOIN LATERAL (SELECT x.* FROM career.application_stage_history x WHERE x.workspace_id=a.workspace_id AND x.application_id=a.id AND x.effective_date<=${asOfDate}::date
      AND NOT EXISTS(SELECT 1 FROM career.application_stage_history c WHERE c.workspace_id=x.workspace_id AND c.supersedes_history_id=x.id)
      ORDER BY x.effective_date DESC,x.effective_order DESC,x.id DESC LIMIT 1) h ON TRUE
    WHERE a.workspace_id=${workspaceId}::uuid AND a.applied_date>=${period.startDate}::date AND a.applied_date<${period.endDateExclusive}::date AND a.applied_date<=${asOfDate}::date
    ORDER BY a.applied_date DESC,a.id LIMIT 10001`);
  const events = await t.db.execute<CareerReportEvent>(sql`
    WITH dated AS (
      SELECT e.id AS "eventId",e.application_id AS "applicationId",e.title,e.event_kind AS kind,
        CASE WHEN e.temporal_kind='date' THEN e.event_date ELSE (e.starts_at AT TIME ZONE w.timezone)::date END AS local_date,
        to_char(e.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",e.status,e.version,a.source_name AS source,
        (a.applied_date>=${period.startDate}::date AND a.applied_date<${period.endDateExclusive}::date AND a.applied_date<=${asOfDate}::date) IS TRUE AS "inCohort"
      FROM career.application_event e JOIN career.job_application a ON a.workspace_id=e.workspace_id AND a.id=e.application_id
      JOIN core.workspace w ON w.id=e.workspace_id WHERE e.workspace_id=${workspaceId}::uuid
    ) SELECT "eventId","applicationId",title,kind,local_date::text AS date,"startsAt",status,version,source,"inCohort",
      local_date>=${period.startDate}::date AND local_date<${period.endDateExclusive}::date AS "inPeriod"
    FROM dated WHERE (local_date>=${period.startDate}::date AND local_date<${period.endDateExclusive}::date)
      OR ("inCohort" AND local_date<=${asOfDate}::date)
    ORDER BY local_date,"eventId" LIMIT 10001`);
  const stages = await t.db.execute<CareerStageDuration>(sql`
    WITH resolved AS (SELECT h.*,lead(h.effective_date) OVER(PARTITION BY h.application_id ORDER BY h.effective_date,h.effective_order,h.id) AS next_date
      FROM career.application_stage_history h JOIN career.job_application a ON a.workspace_id=h.workspace_id AND a.id=h.application_id
      WHERE h.workspace_id=${workspaceId}::uuid AND a.applied_date>=${period.startDate}::date AND a.applied_date<${period.endDateExclusive}::date AND a.applied_date<=${asOfDate}::date
        AND h.effective_date<=${asOfDate}::date AND NOT EXISTS(SELECT 1 FROM career.application_stage_history c WHERE c.workspace_id=h.workspace_id AND c.supersedes_history_id=h.id))
    SELECT id AS "historyId",application_id AS "applicationId",stage,outcome,sequence_no AS "sequenceNo",effective_order AS "effectiveOrder",effective_date::text AS "effectiveDate",COALESCE(next_date,${asOfDate}::date)::text AS "endDate",
      CASE WHEN outcome IS NOT NULL THEN 0 ELSE GREATEST(COALESCE(next_date,${asOfDate}::date)-effective_date,0) END AS "elapsedDays",
      next_date IS NULL AND outcome IS NULL AS open FROM resolved ORDER BY application_id,effective_date,effective_order,id LIMIT 10001`);
  return {
    applications: cohort.rows,
    events: events.rows,
    stages: stages.rows,
  };
}
