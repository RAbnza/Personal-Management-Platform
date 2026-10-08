import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";

/** One statement supplies a consistent snapshot. Liability and schedule sums
 * are aggregated independently so their joins cannot multiply money. Never
 * filter originals out of posted correction chains. */
export async function readDebts(
  transaction: ScopedTransaction,
  input: { workspaceId: string; debtId?: string; after?: string | undefined },
) {
  const result = await transaction.db.execute<{
    financial_revision: string;
    items: unknown;
  }>(sql`
    SELECT w.financial_revision::text AS financial_revision, COALESCE((
      SELECT jsonb_agg(item ORDER BY id) FROM (
        SELECT d.id,jsonb_build_object(
          'debtId',d.id,'name',d.name,'lenderName',d.lender_name,'productName',d.product_name,
          'debtType',d.debt_type,'currency',d.currency,'startDate',d.start_date::text,
          'openingCutoffDate',d.opening_cutoff_date::text,'originalPrincipalMinor',d.original_principal_minor::text,
          'breakdownStatus',d.breakdown_status,'lifecycle',d.lifecycle,'notes',d.notes,'version',d.version,
          'recognizedLiabilityMinor',COALESCE(b.total,0)::text,
          'outstandingPrincipalMinor',CASE WHEN COALESCE(b.unknown,0)=0 AND d.breakdown_status='known' THEN COALESCE(b.principal,0)::text ELSE NULL END,
          'unclassifiedLiabilityMinor',COALESCE(b.unknown,0)::text,
          'recognizedLiabilityComponents',jsonb_build_object('principal',COALESCE(b.principal,0)::text,'interest',COALESCE(b.interest,0)::text,
            'fee',COALESCE(b.fee,0)::text,'penalty',COALESCE(b.penalty,0)::text,'unclassified',COALESCE(b.unknown,0)::text),
          'remainingScheduledMinor',s.remaining::text,'installmentCount',COALESCE(s.count,0),
          'scheduleVersionId',v.id,'scheduleReason',v.reason,
          'paymentClearingMinor',COALESCE(c.balance,0)::text,
          'unappliedContractualMinor',(COALESCE(u.amount,0)-COALESCE((SELECT st.resolved_unapplied_minor FROM finance.debt_settlement st WHERE st.workspace_id=d.workspace_id AND st.debt_id=d.id AND st.closing_schedule_version_id=v.id),0))::text
        ) AS item
        FROM finance.debt d
        LEFT JOIN LATERAL (
          SELECT -sum(p.amount_minor::numeric) AS total,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='principal') AS principal,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='interest') AS interest,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='fee') AS fee,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='penalty') AS penalty,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='unclassified') AS unknown
          FROM finance.posting p
          JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
          JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
          WHERE p.workspace_id=d.workspace_id AND p.ledger_account_id=d.liability_ledger_account_id
        ) b ON true
        LEFT JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(*)>0 THEN COALESCE(sum(i.remaining_minor) FILTER (WHERE i.disposition='scheduled'),0) ELSE NULL END AS remaining, count(*)::integer AS count
          FROM finance.current_installment_due_v i WHERE i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT sum(p.amount_minor::numeric) AS balance FROM finance.posting p
          JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted'
          JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
          WHERE p.workspace_id=d.workspace_id AND p.ledger_account_id=d.clearing_ledger_account_id
        ) c ON true
        LEFT JOIN LATERAL (
          SELECT sum(CASE WHEN p.paid_against_schedule_version_id=v.id THEN p.unapplied_contractual_minor::numeric ELSE
            COALESCE((SELECT sum(m.amount_minor::numeric) FROM finance.schedule_allocation_map m
              WHERE m.workspace_id=p.workspace_id AND m.debt_id=d.id AND m.payment_revision_id=p.id AND m.target_schedule_version_id=v.id AND m.target_kind='unapplied'),0) END) AS amount
          FROM finance.debt_payment_revision p
          JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id AND f.current_revision_id=p.action_revision_id
          JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted' AND r.change_kind<>'void'
          WHERE p.workspace_id=d.workspace_id AND p.debt_id=d.id
        ) u ON true
        WHERE d.workspace_id=w.id
          ${input.debtId ? sql`AND d.id=${input.debtId}::uuid` : sql``}
          ${input.after ? sql`AND d.id>${input.after}::uuid` : sql``}
        ORDER BY d.id LIMIT 51
      ) page
    ),'[]'::jsonb) AS items
    FROM core.workspace w JOIN core.user_profile u ON u.user_id=w.owner_user_id AND u.lifecycle='active'
    WHERE w.id=${input.workspaceId}::uuid AND w.state='active'
  `);
  return result.rows[0] ?? null;
}

export async function readDebtInstallments(
  transaction: ScopedTransaction,
  input: { workspaceId: string; debtId: string; scheduleVersionId: string },
) {
  const result = await transaction.db.execute<{ item: unknown }>(sql`
    SELECT jsonb_build_object('installmentId',id,'obligationId',obligation_id,'sequenceNo',sequence_no,'dueDate',due_date::text,
      'contractualMinor',contractual_minor::text,'openingSatisfiedMinor',opening_satisfied_minor::text,
      'paymentSatisfiedMinor',payment_satisfied_minor::text,'remainingMinor',remaining_minor::text,'disposition',disposition,'cancellationReason',cancellation_reason,
      'knownPrincipalMinor',known_principal_minor::text,'knownInterestMinor',known_interest_minor::text,
      'knownFeeMinor',known_fee_minor::text,'breakdownComplete',breakdown_complete,'notes',notes) AS item
    FROM finance.current_installment_due_v
    WHERE workspace_id=${input.workspaceId}::uuid AND debt_id=${input.debtId}::uuid AND schedule_version_id=${input.scheduleVersionId}::uuid
    ORDER BY sequence_no,id
  `);
  return result.rows.map((row) => row.item);
}

/** Revision history, including superseded and void evidence, is separate from
 * the effective totals above. Cursor is an owned revision within this debt. */
export async function readDebtPaymentHistory(
  transaction: ScopedTransaction,
  input: { workspaceId: string; debtId: string; after?: string | undefined },
) {
  const result = await transaction.db.execute<{ item: unknown }>(sql`
    SELECT jsonb_build_object('paymentId',p.id,'actionId',f.id,'actionRevisionId',r.id,
      'revisionNo',r.revision_no,'changeKind',r.change_kind,'current',f.current_revision_id=r.id,
      'paymentDate',r.primary_effective_date::text,'recordedAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'payingAccountName',a.name,'actualPaidMinor',pr.actual_paid_minor::text,'contractualMinor',pr.contractual_minor::text,
      'externalFeeMinor',pr.external_fee_minor::text,'unappliedContractualMinor',pr.unapplied_contractual_minor::text,
      'allocationCertainty',pr.allocation_certainty,'description',f.description,'reference',f.reference,
      'confirmationSource',audit.after_json->>'confirmationSource','confirmationNote',audit.after_json->>'confirmationNote',
      'negativeBalanceAcknowledged',COALESCE((audit.after_json->>'acknowledgeNegativeBalance')::boolean,false),
      'components',COALESCE((SELECT jsonb_agg(jsonb_build_object('disposition',c.disposition,'amountMinor',c.amount_minor::text,
        'liabilityComponent',x.liability_component,'label',x.memo) ORDER BY x.line_no)
        FROM finance.payment_component c JOIN finance.posting x ON x.workspace_id=c.workspace_id AND x.id=c.posting_id
        WHERE c.workspace_id=pr.workspace_id AND c.payment_revision_id=pr.id),'[]'::jsonb),
      'dueAllocations',COALESCE((SELECT jsonb_agg(jsonb_build_object('installmentId',i.id,'sequenceNo',i.sequence_no,
        'dueDate',i.due_date::text,'amountMinor',da.amount_minor::text) ORDER BY i.sequence_no)
        FROM finance.payment_due_allocation da JOIN finance.scheduled_installment i ON i.workspace_id=da.workspace_id AND i.id=da.installment_id
        WHERE da.workspace_id=pr.workspace_id AND da.payment_revision_id=pr.id),'[]'::jsonb)) AS item
    FROM finance.debt_payment p JOIN finance.financial_action f ON f.workspace_id=p.workspace_id AND f.id=p.action_id
    JOIN finance.action_revision r ON r.workspace_id=f.workspace_id AND r.action_id=f.id AND r.state='posted'
    LEFT JOIN finance.debt_payment_revision pr ON pr.workspace_id=r.workspace_id AND pr.action_revision_id=r.id
    LEFT JOIN finance.financial_account a ON a.workspace_id=pr.workspace_id AND a.id=pr.paying_account_id
    LEFT JOIN LATERAL (SELECT after_json FROM audit.private_revision ar WHERE ar.workspace_id=r.workspace_id
      AND ar.command_receipt_id=r.command_receipt_id AND ar.subject_kind='financial_action' AND ar.subject_id=f.id
      AND ar.subject_version=r.revision_no ORDER BY ar.created_at,ar.id LIMIT 1) audit ON true
    WHERE p.workspace_id=${input.workspaceId}::uuid AND p.debt_id=${input.debtId}::uuid
      ${
        input.after
          ? sql`AND (r.created_at,r.id)<(SELECT cr.created_at,cr.id FROM finance.action_revision cr
        JOIN finance.debt_payment cp ON cp.workspace_id=cr.workspace_id AND cp.action_id=cr.action_id
        WHERE cr.workspace_id=${input.workspaceId}::uuid AND cr.id=${input.after}::uuid AND cp.debt_id=${input.debtId}::uuid)`
          : sql``
      }
    ORDER BY r.created_at DESC,r.id DESC LIMIT 51
  `);
  return result.rows.map((row) => row.item);
}
