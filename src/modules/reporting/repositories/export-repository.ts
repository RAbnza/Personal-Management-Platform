import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import type { ReportPeriod } from "../domain/period";
import { postingFacts } from "./posting-facts";
export type ExportRow = Record<string, string | number | boolean | null>;
export type ExportKind =
  | "transactions"
  | "debt-schedules"
  | "debt-payments"
  | "applications"
  | "report";
export async function readExportRows(
  t: ScopedTransaction,
  workspaceId: string,
  period: ReportPeriod,
  kind: Exclude<ExportKind, "report">,
  asOfDate: string,
) {
  if (kind === "transactions")
    return (
      await t.db.execute<ExportRow>(sql`${postingFacts(workspaceId)}
    SELECT 'posting' AS record_type,id::text AS posting_id,action_id::text,action_revision_id::text,journal_id::text,ledger_account_id::text,
      effective_date::text,amount::text AS amount_minor,ledger_kind,ledger_name,description,category_id::text,category,
      journal_role,revision_no,action_kind,expense_class,income_class,cash_flow_kind,cash_flow_direction,liability_component,
      classification_posting_id::text,classification_revision_id::text,source_amount::text AS source_amount_minor,
      charge_kind,payment_disposition,debt_linked,waiver,transfer_source
    FROM facts WHERE effective_date>=${period.startDate}::date AND effective_date<${period.endDateExclusive}::date ORDER BY effective_date,id LIMIT 10001`)
    ).rows;
  if (kind === "debt-schedules")
    return (
      await t.db.execute<ExportRow>(sql`
    SELECT 'schedule_entry' AS record_type,i.id::text AS installment_id,i.debt_id::text,d.name AS debt_name,i.obligation_id::text,i.schedule_version_id::text,v.version_no,
      (d.current_schedule_version_id=v.id) AS is_current_version,v.revision_kind,i.due_date::text,i.contractual_minor::text,i.opening_satisfied_minor::text,
      i.known_principal_minor::text,i.known_interest_minor::text,i.known_fee_minor::text,i.breakdown_complete,i.disposition,i.cancellation_reason,
      c.payment_satisfied_minor::text AS current_payment_satisfied_minor,c.remaining_minor::text AS current_remaining_minor
    FROM finance.scheduled_installment i JOIN finance.debt_schedule_version v ON v.workspace_id=i.workspace_id AND v.id=i.schedule_version_id AND v.state='finalized'
    JOIN finance.debt d ON d.workspace_id=i.workspace_id AND d.id=i.debt_id LEFT JOIN finance.current_installment_due_v c ON c.workspace_id=i.workspace_id AND c.id=i.id
    WHERE i.workspace_id=${workspaceId}::uuid AND i.due_date>=${period.startDate}::date AND i.due_date<${period.endDateExclusive}::date ORDER BY i.due_date,i.debt_id,v.version_no,i.id LIMIT 10001`)
    ).rows;
  if (kind === "debt-payments")
    return (
      await t.db.execute<ExportRow>(sql`
    SELECT 'payment_revision' AS record_type,p.id::text AS payment_revision_id,p.payment_id::text,p.action_id::text,p.action_revision_id::text,p.debt_id::text,d.name AS debt_name,p.paying_account_id::text,
      r.revision_no,r.change_kind,(a.current_revision_id=r.id AND r.change_kind<>'void') AS is_current_revision,r.primary_effective_date::text AS payment_date,
      p.paid_against_schedule_version_id::text,p.actual_paid_minor::text,p.contractual_minor::text,p.external_fee_minor::text,p.unapplied_contractual_minor::text,p.allocation_certainty,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('component_id',c.id,'posting_id',c.posting_id,'disposition',c.disposition,'amount_minor',c.amount_minor::text) ORDER BY c.id) FROM finance.payment_component c WHERE c.workspace_id=p.workspace_id AND c.payment_revision_id=p.id),'[]'::jsonb)::text AS accounting_components_json,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('allocation_id',x.id,'installment_id',x.installment_id,'schedule_version_id',x.schedule_version_id,'amount_minor',x.amount_minor::text) ORDER BY x.id) FROM finance.payment_due_allocation x WHERE x.workspace_id=p.workspace_id AND x.payment_revision_id=p.id),'[]'::jsonb)::text AS direct_allocations_json,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('map_id',m.id,'target_schedule_version_id',m.target_schedule_version_id,'target_kind',m.target_kind,'target_installment_id',m.target_installment_id,'amount_minor',m.amount_minor::text) ORDER BY m.id) FROM finance.schedule_allocation_map m WHERE m.workspace_id=p.workspace_id AND m.payment_revision_id=p.id),'[]'::jsonb)::text AS historical_maps_json
    FROM finance.debt_payment_revision p JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
    JOIN finance.financial_action a ON a.workspace_id=p.workspace_id AND a.id=p.action_id JOIN finance.debt d ON d.workspace_id=p.workspace_id AND d.id=p.debt_id
    WHERE p.workspace_id=${workspaceId}::uuid AND r.primary_effective_date>=${period.startDate}::date AND r.primary_effective_date<${period.endDateExclusive}::date ORDER BY r.primary_effective_date,p.payment_id,r.revision_no LIMIT 10001`)
    ).rows;
  return (
    await t.db.execute<ExportRow>(sql`
    WITH cohort AS (SELECT a.* FROM career.job_application a WHERE a.workspace_id=${workspaceId}::uuid AND a.applied_date>=${period.startDate}::date AND a.applied_date<${period.endDateExclusive}::date AND a.applied_date<=${asOfDate}::date), history AS (
      SELECT 'stage_observation' AS record_type,h.id AS source_id,a.id AS application_id,a.company_name,a.role_title,a.source_name,a.applied_date::text,h.effective_date::text,h.sequence_no AS source_version,
        h.stage,h.outcome,h.supersedes_history_id::text,
        EXISTS(SELECT 1 FROM career.application_stage_history c WHERE c.workspace_id=h.workspace_id AND c.supersedes_history_id=h.id) AS superseded,h.reason,
        to_char(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded_at,NULL::text AS event_snapshot_json
      FROM cohort a JOIN career.application_stage_history h ON h.workspace_id=a.workspace_id AND h.application_id=a.id AND h.effective_date<=${asOfDate}::date
      UNION ALL
      SELECT 'event_revision',v.id,a.id,a.company_name,a.role_title,a.source_name,a.applied_date::text,v.effective_date::text,v.subject_version,
        NULL,NULL,NULL,false,v.reason,to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        jsonb_build_object('event_id',e.id,'operation',v.operation,'before',v.before_json,'after',v.after_json)::text
      FROM cohort a JOIN career.application_event e ON e.workspace_id=a.workspace_id AND e.application_id=a.id
      JOIN audit.private_revision v ON v.workspace_id=e.workspace_id AND v.subject_kind='application_event' AND v.subject_id=e.id
    ) SELECT * FROM history ORDER BY application_id,record_type,source_version,source_id LIMIT 10001`)
  ).rows;
}

export async function readExportHistory(
  t: ScopedTransaction,
  workspaceId: string,
) {
  return (
    await t.db.execute<{
      exportRunId: string;
      kind: string;
      generatedAt: string;
      rowCount: string;
      financialRevision: string;
    }>(sql`
    SELECT id AS "exportRunId",filters_json->>'exportKind' AS kind,to_char(generated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "generatedAt",row_count::text AS "rowCount",snapshot_financial_revision::text AS "financialRevision"
    FROM ops.export_run WHERE workspace_id=${workspaceId}::uuid AND created_at>=transaction_timestamp()-interval '30 days' ORDER BY created_at DESC,id DESC LIMIT 10`)
  ).rows;
}
