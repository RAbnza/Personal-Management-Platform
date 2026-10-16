import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import {
  calculateBalances,
  type SourcePosition,
  type Settlement,
} from "../domain/balances";

export type SettlementRecord = Settlement & {
  paymentDate: string;
  note: string | null;
  mode: string;
  version: number;
  reportedBy: string;
  createdAt: string;
  events: {
    version: number;
    actorId: string;
    fromState: string | null;
    toState: string;
    confirmationType: string;
    reason: string;
    createdAt: string;
  }[];
};
export type RefundRecord = {
  id: string;
  expenseId: string;
  sourceRevisionId: string;
  totalMinor: string;
  refundDate: string;
  reason: string;
  actorId: string;
  allocations: { participantId: string; axis: string; amountMinor: string }[];
};
/** All projections share one bounded, scoped snapshot. Never calculate a total
 * from the UI's paginated bill list. RLS also limits former-member snapshots. */
export async function readGroupLedger(t: ScopedTransaction, groupId: string) {
  const sources = (
    await t.db.execute<SourcePosition>(sql`
    WITH current_bills AS MATERIALIZED (SELECT e.id,e.current_revision_id FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' WHERE e.group_id=${groupId}::uuid), amounts AS (
      SELECT c.expense_id,c.participant_id,c.amount_minor::numeric paid,0::numeric share,0::numeric received,0::numeric credit FROM sharing.payer_contribution c JOIN current_bills e ON e.current_revision_id=c.expense_revision_id WHERE c.group_id=${groupId}::uuid
      UNION ALL SELECT c.expense_id,c.participant_id,0,c.amount_minor::numeric,0,0 FROM sharing.participant_share c JOIN current_bills e ON e.current_revision_id=c.expense_revision_id WHERE c.group_id=${groupId}::uuid
      UNION ALL SELECT r.expense_id,a.participant_id,0,0,CASE WHEN a.axis='received' THEN a.amount_minor::numeric ELSE 0 END,CASE WHEN a.axis='share_credit' THEN a.amount_minor::numeric ELSE 0 END FROM sharing.refund_allocation a JOIN sharing.refund r ON r.group_id=a.group_id AND r.id=a.refund_id WHERE a.group_id=${groupId}::uuid
    ) SELECT e.id AS "expenseId",e.current_revision_id AS "revisionId",a.participant_id AS "participantId",sum(paid)::text AS "paidMinor",sum(share)::text AS "shareMinor",sum(received)::text AS "refundReceivedMinor",sum(credit)::text AS "refundShareMinor" FROM amounts a JOIN current_bills e ON e.id=a.expense_id GROUP BY e.id,e.current_revision_id,a.participant_id ORDER BY e.id,a.participant_id LIMIT 10001`)
  ).rows;
  const settlements = (
    await t.db
      .execute<SettlementRecord>(sql`SELECT s.id,s.sender_id AS "senderId",s.recipient_id AS "recipientId",s.reported_by AS "reportedBy",s.amount_minor::text AS "amountMinor",s.advance_minor::text AS "advanceMinor",s.state,s.version,s.mode,s.payment_date::text AS "paymentDate",s.note,s.created_at::text AS "createdAt",
    coalesce((SELECT jsonb_agg(jsonb_build_object('expenseId',a.expense_id,'sourceRevisionId',a.source_revision_id,'amountMinor',a.amount_minor::text) ORDER BY a.expense_id) FROM sharing.settlement_allocation a WHERE a.group_id=s.group_id AND a.settlement_id=s.id),'[]') allocations,
    coalesce((SELECT jsonb_agg(jsonb_build_object('version',e.version,'actorId',e.actor_id,'fromState',e.from_state,'toState',e.to_state,'confirmationType',e.confirmation_type,'reason',e.reason,'createdAt',e.created_at) ORDER BY e.version) FROM sharing.settlement_event e WHERE e.group_id=s.group_id AND e.settlement_id=s.id),'[]') events
    FROM sharing.settlement s WHERE s.group_id=${groupId}::uuid ORDER BY s.created_at DESC,s.id LIMIT 1001`)
  ).rows;
  const refunds = (
    await t.db.execute<RefundRecord>(
      sql`SELECT r.id,r.expense_id AS "expenseId",r.source_revision_id AS "sourceRevisionId",r.total_minor::text AS "totalMinor",r.refund_date::text AS "refundDate",r.reason,r.actor_id AS "actorId",coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',a.participant_id,'axis',a.axis,'amountMinor',a.amount_minor::text) ORDER BY a.axis,a.participant_id) FROM sharing.refund_allocation a WHERE a.group_id=r.group_id AND a.refund_id=r.id),'[]') allocations FROM sharing.refund r WHERE r.group_id=${groupId}::uuid ORDER BY r.created_at DESC,r.id LIMIT 1001`,
    )
  ).rows;
  if (
    sources.length > 10000 ||
    settlements.length > 1000 ||
    refunds.length > 1000
  )
    throw new RangeError(
      "Group reporting exceeds the reviewed limit (10,000 source positions, 1,000 settlements/refunds). Export history before further activity.",
    );
  return {
    sources,
    settlements,
    refunds,
    ...calculateBalances(sources, settlements),
    projected: calculateBalances(
      sources,
      settlements.map((s) => ({
        ...s,
        state: s.state === "pending" ? "confirmed" : s.state,
      })),
    ),
  };
}
export type GroupLedger = Awaited<ReturnType<typeof readGroupLedger>>;
