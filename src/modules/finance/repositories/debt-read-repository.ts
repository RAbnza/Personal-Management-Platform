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
          'remainingScheduledMinor',s.remaining::text,'installmentCount',COALESCE(s.count,0),
          'scheduleVersionId',v.id,'scheduleReason',v.reason
        ) AS item
        FROM finance.debt d
        LEFT JOIN LATERAL (
          SELECT -sum(p.amount_minor::numeric) AS total,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='principal') AS principal,
            -sum(p.amount_minor::numeric) FILTER (WHERE p.liability_component='unclassified') AS unknown
          FROM finance.posting p
          JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.action_revision_id=p.action_revision_id AND j.state='posted'
          JOIN finance.action_revision r ON r.workspace_id=p.workspace_id AND r.id=p.action_revision_id AND r.state='posted'
          WHERE p.workspace_id=d.workspace_id AND p.ledger_account_id=d.liability_ledger_account_id
        ) b ON true
        LEFT JOIN finance.debt_schedule_version v ON v.workspace_id=d.workspace_id AND v.debt_id=d.id AND v.id=d.current_schedule_version_id AND v.state='finalized'
        LEFT JOIN LATERAL (
          SELECT sum(i.contractual_minor::numeric-i.opening_satisfied_minor) FILTER (WHERE i.disposition='scheduled') AS remaining, count(*)::integer AS count
          FROM finance.scheduled_installment i WHERE i.workspace_id=d.workspace_id AND i.debt_id=d.id AND i.schedule_version_id=v.id
        ) s ON true
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
    SELECT jsonb_build_object('installmentId',id,'sequenceNo',sequence_no,'dueDate',due_date::text,
      'contractualMinor',contractual_minor::text,'openingSatisfiedMinor',opening_satisfied_minor::text,
      'remainingMinor',(contractual_minor-opening_satisfied_minor)::text,
      'knownPrincipalMinor',known_principal_minor::text,'knownInterestMinor',known_interest_minor::text,
      'knownFeeMinor',known_fee_minor::text,'breakdownComplete',breakdown_complete,'notes',notes) AS item
    FROM finance.scheduled_installment
    WHERE workspace_id=${input.workspaceId}::uuid AND debt_id=${input.debtId}::uuid AND schedule_version_id=${input.scheduleVersionId}::uuid
    ORDER BY sequence_no,id
  `);
  return result.rows.map((row) => row.item);
}
