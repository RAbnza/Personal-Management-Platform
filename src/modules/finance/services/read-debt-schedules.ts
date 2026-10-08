import { z } from "zod";
import { sql } from "drizzle-orm";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { readDebts } from "../repositories/debt-read-repository";
import { DebtUnavailableError, getDebtDetailInTransaction } from "./read-debts";
import {
  scheduleHistoryItemSchema,
  type ScheduleHistoryResult,
} from "../domain/debt-schedule-history";
export async function listDebtSchedulesInTransaction(
  t: ScopedTransaction,
  input: { workspaceId: string; debtId: string; after?: string | undefined },
): Promise<ScheduleHistoryResult> {
  const header = await readDebts(t, {
    workspaceId: input.workspaceId,
    debtId: input.debtId,
  });
  if (!header || !Array.isArray(header.items) || !header.items.length)
    throw new DebtUnavailableError();
  const r = await t.db.execute<{
    item: unknown;
  }>(sql`SELECT jsonb_build_object('scheduleVersionId',v.id,'versionNo',v.version_no,'previousVersionId',v.previous_version_id,
    'effectiveDate',v.effective_date::text,'revisionKind',v.revision_kind,'reason',v.reason,'frequency',v.frequency,
    'finalizedAt',to_char(v.finalized_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'recordedByUserId',v.recorded_by_user_id,
    'current',d.current_schedule_version_id=v.id,'chargeActionId',a.after_json->>'chargeActionId',
    'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('installmentId',i.id,'obligationId',i.obligation_id,'sequenceNo',i.sequence_no,
      'dueDate',i.due_date::text,'contractualMinor',i.contractual_minor::text,'openingSatisfiedMinor',i.opening_satisfied_minor::text,
      'disposition',i.disposition,'cancellationReason',i.cancellation_reason,'knownPrincipalMinor',i.known_principal_minor::text,
      'knownInterestMinor',i.known_interest_minor::text,'knownFeeMinor',i.known_fee_minor::text,'breakdownComplete',i.breakdown_complete,'notes',i.notes) ORDER BY i.sequence_no)
      FROM finance.scheduled_installment i WHERE i.workspace_id=v.workspace_id AND i.schedule_version_id=v.id),'[]'::jsonb),
    'mappings',COALESCE((SELECT jsonb_agg(jsonb_build_object('paymentRevisionId',m.payment_revision_id,'sourceAllocationId',m.source_allocation_id,
      'targetInstallmentId',m.target_installment_id,'amountMinor',m.amount_minor::text) ORDER BY m.payment_revision_id,m.source_allocation_id,m.target_installment_id)
      FROM finance.schedule_allocation_map m WHERE m.workspace_id=v.workspace_id AND m.target_schedule_version_id=v.id),'[]'::jsonb)) AS item
    FROM finance.debt_schedule_version v JOIN finance.debt d ON d.workspace_id=v.workspace_id AND d.id=v.debt_id
    LEFT JOIN LATERAL (SELECT after_json FROM audit.private_revision a WHERE a.workspace_id=v.workspace_id AND a.subject_kind='debt_schedule_version'
      AND a.subject_id=v.id AND a.subject_version=v.version_no ORDER BY a.created_at LIMIT 1) a ON true
    WHERE v.workspace_id=${input.workspaceId}::uuid AND v.debt_id=${input.debtId}::uuid AND v.state='finalized'
      ${input.after ? sql`AND v.version_no<(SELECT c.version_no FROM finance.debt_schedule_version c WHERE c.workspace_id=v.workspace_id AND c.debt_id=v.debt_id AND c.id=${input.after}::uuid)` : sql``}
    ORDER BY v.version_no DESC LIMIT 11`);
  const items = r.rows.map((r) => scheduleHistoryItemSchema.parse(r.item));
  return {
    financialRevision: header.financial_revision,
    items: items.slice(0, 10),
    nextCursor: items.length > 10 ? items[9]!.scheduleVersionId : null,
  };
}
export function listDebtSchedules(input: {
  userId: string;
  workspaceId: string;
  debtId: string;
  after?: string | undefined;
}) {
  const parsed = z
    .object({
      userId: z.uuid(),
      workspaceId: z.uuid(),
      debtId: z.uuid(),
      after: z.uuid().optional(),
    })
    .strict()
    .parse(input);
  return withDomainTransaction(
    parsed,
    (t) => listDebtSchedulesInTransaction(t, parsed),
    { readOnlySnapshot: true },
  );
}
export function getDebtWithScheduleHistory(input: {
  userId: string;
  workspaceId: string;
  debtId: string;
}) {
  const parsed = z
    .object({ userId: z.uuid(), workspaceId: z.uuid(), debtId: z.uuid() })
    .strict()
    .parse(input);
  return withDomainTransaction(
    parsed,
    async (t) => ({
      detail: await getDebtDetailInTransaction(t, parsed),
      history: await listDebtSchedulesInTransaction(t, parsed),
    }),
    { readOnlySnapshot: true },
  );
}
