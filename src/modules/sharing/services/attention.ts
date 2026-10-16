import { sql } from "drizzle-orm";
import type { ScopedTransaction } from "@/platform/db";
import { sharingEnabled } from "../domain/sharing";
export async function readSharingAttention(t: ScopedTransaction) {
  if (!sharingEnabled()) return [];
  const pending = (
    await t.db.execute<{
      key: string;
      title: string;
      detail: string;
      href: string;
    }>(
      sql`SELECT 'shared-settlement:'||s.id AS key,CASE WHEN p.identity_kind<>'registered' AND sharing.active(s.group_id,true) THEN 'Shared payment needs recorded manual confirmation' WHEN s.recipient_id=sharing.actor(s.group_id) THEN 'Shared payment needs your confirmation' ELSE 'Shared payment waiting for confirmation' END title,g.name||' · reported '||s.created_at::date::text||'. Pending payments do not change confirmed group balances.' detail,'/sharing/'||s.group_id::text||'#settlement-'||s.id::text href FROM sharing.settlement s JOIN sharing.expense_group g ON g.id=s.group_id JOIN sharing.participant p ON p.group_id=s.group_id AND p.id=s.recipient_id WHERE s.state='pending' AND (sharing.actor(s.group_id) IN(s.sender_id,s.recipient_id) OR sharing.active(s.group_id,true) AND p.identity_kind<>'registered') ORDER BY s.created_at,s.id LIMIT 50`,
    )
  ).rows;
  const stale = (
    await t.db.execute<{
      key: string;
      title: string;
      detail: string;
      href: string;
    }>(
      sql`SELECT 'shared-review:'||l.id AS key,'Review changed shared financial evidence' title,'Your private ledger retains the source you accepted. Review the current shared source independently.' detail,CASE WHEN l.expense_id IS NOT NULL THEN '/sharing/'||l.group_id::text||'/expenses/'||l.expense_id::text ELSE '/sharing/'||l.group_id::text||'/effects/'||CASE WHEN l.refund_id IS NOT NULL THEN 'refund/'||l.refund_id::text ELSE 'settlement/'||l.settlement_id::text END END href FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id LEFT JOIN sharing.shared_expense e ON e.group_id=l.group_id AND e.id=l.expense_id WHERE ((l.expense_id IS NOT NULL AND e.current_revision_id IS DISTINCT FROM r.source_expense_revision_id) OR (l.expense_id IS NULL AND (finance.group_effect_source(l.group_id,l.participant_id,l.refund_id,l.settlement_id)->>'sourceHash')<>r.accepted_source_hash)) AND NOT EXISTS(SELECT 1 FROM finance.private_group_review v WHERE v.link_id=l.id AND v.accepted_link_revision_id=l.current_link_revision_id AND v.source_hash=finance.private_group_review_source(l.id)->>'sourceHash') ORDER BY l.created_at,l.id LIMIT 50`,
    )
  ).rows;
  const unadopted = (
    await t.db.execute<{
      key: string;
      title: string;
      detail: string;
      href: string;
    }>(
      sql`SELECT 'shared-unlinked:'||s.id AS key,'Review your private settlement coverage' title,'Group confirmation records no private funding. Link actual funds once, or continue using the group without private posting.' detail,'/sharing/'||s.group_id::text||'/effects/settlement/'||s.id::text href FROM sharing.settlement s WHERE s.state='confirmed' AND sharing.actor(s.group_id) IN(s.sender_id,s.recipient_id) AND NOT EXISTS(SELECT 1 FROM finance.private_group_link l WHERE l.group_id=s.group_id AND l.settlement_id=s.id) ORDER BY s.created_at,s.id LIMIT 50`,
    )
  ).rows;
  const refunds = (
    await t.db.execute<{
      key: string;
      title: string;
      detail: string;
      href: string;
    }>(
      sql`SELECT 'shared-refund:'||r.id AS key,'Review your shared refund allocation' title,'Shared refunds preserve earlier payments. Review your independently controlled private coverage; no private money was posted automatically.' detail,'/sharing/'||r.group_id::text||'/effects/refund/'||r.id::text href FROM sharing.refund r WHERE EXISTS(SELECT 1 FROM sharing.refund_allocation a WHERE a.group_id=r.group_id AND a.refund_id=r.id AND a.participant_id=sharing.actor(r.group_id)) AND NOT EXISTS(SELECT 1 FROM finance.private_group_link l WHERE l.group_id=r.group_id AND l.refund_id=r.id) ORDER BY r.created_at,r.id LIMIT 50`,
    )
  ).rows;
  const corrections = (
    await t.db.execute<{
      key: string;
      title: string;
      detail: string;
      href: string;
    }>(
      sql`SELECT 'shared-correction:'||e.id AS key,'A shared bill affecting you was corrected' title,'Review its immutable source history. Private financial approval remains independent.' detail,'/sharing/'||e.group_id::text||'/expenses/'||e.id::text href FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id WHERE r.revision_no>1 AND r.created_at>clock_timestamp()-interval '30 days' AND r.actor_participant_id<>sharing.actor(e.group_id) AND (EXISTS(SELECT 1 FROM sharing.payer_contribution c WHERE c.group_id=e.group_id AND c.expense_id=e.id AND c.participant_id=sharing.actor(e.group_id)) OR EXISTS(SELECT 1 FROM sharing.participant_share c WHERE c.group_id=e.group_id AND c.expense_id=e.id AND c.participant_id=sharing.actor(e.group_id))) ORDER BY r.created_at DESC,e.id LIMIT 50`,
    )
  ).rows;
  return [...pending, ...stale, ...unadopted, ...refunds, ...corrections];
}
