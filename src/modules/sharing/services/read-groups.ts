import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { SharingUnavailableError, id } from "../domain/sharing";
import { readGroupLedger, type GroupLedger } from "./ledger";

export type GroupSummary = {
  id: string;
  name: string;
  version: number;
  archived: boolean;
  active: boolean;
};
export type Participant = {
  id: string;
  displayName: string;
  identityKind: string;
  active: boolean;
  role: string | null;
  paidMinor: string;
  shareMinor: string;
  netMinor: string;
};
export type BillSummary = {
  id: string;
  revisionId: string;
  revisionNo: number;
  description: string;
  expenseDate: string;
  totalMinor: string;
  splitMethod: string;
  creatorId: string;
  categoryLabel: string | null;
  notes: string | null;
};
export type BillRevision = BillSummary & {
  positions: {
    participantId: string;
    paidMinor: string;
    shareMinor: string;
    netMinor: string;
  }[];
  reason: string | null;
  contributions: { participantId: string; amountMinor: string }[];
  shares: {
    participantId: string;
    amountMinor: string;
    roundingRank: number;
    roundingExtraMinor: number;
  }[];
};
export type GroupDetail = {
  ledger?: GroupLedger;
  membershipHistory?: {
    id: string;
    participantId: string;
    role: string;
    joinedAt: string;
    leftAt: string | null;
    exitKind: string | null;
  }[];
  changes?: {
    id: string;
    operation: string;
    version: number;
    actorKind: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    recordedAt: string;
  }[];
  group: GroupSummary & { participantId: string; owner: boolean };
  participants: Participant[];
  bills: BillSummary[];
  nextCursor: string | null;
  invitations: {
    id: string;
    email: string;
    state: string;
    expiresAt: string;
  }[];
};
type Scope = { userId: string; workspaceId: string };
export function listGroups(actor: Scope) {
  return withDomainTransaction(
    actor,
    async (t) =>
      (
        await t.db.execute<GroupSummary>(
          sql`SELECT id,name,version,archived_at IS NOT NULL AS archived,sharing.active(id) AS active FROM sharing.expense_group WHERE sharing.visible(id) ORDER BY name,id LIMIT 100`,
        )
      ).rows,
    { readOnlySnapshot: true },
  );
}
export function getGroup(
  actor: Scope,
  groupId: string,
  cursor?: string,
): Promise<GroupDetail> {
  id.parse(groupId);
  if (cursor) id.parse(cursor);
  return withDomainTransaction(
    actor,
    async (t) => {
      const group = (
        await t.db.execute<GroupDetail["group"]>(
          sql`SELECT id,name,version,archived_at IS NOT NULL AS archived,sharing.actor(id) AS "participantId",sharing.active(id,true) AS owner,sharing.active(id) AS active FROM sharing.expense_group WHERE id=${groupId}::uuid AND sharing.visible(id)`,
        )
      ).rows[0];
      if (!group) throw new SharingUnavailableError();
      const participants = (
        await t.db
          .execute<Participant>(sql`SELECT p.id,p.display_name AS "displayName",p.identity_kind AS "identityKind",EXISTS(SELECT 1 FROM sharing.membership m WHERE m.group_id=p.group_id AND m.participant_id=p.id AND m.left_at IS NULL) AS active,(SELECT m.role FROM sharing.membership m WHERE m.group_id=p.group_id AND m.participant_id=p.id AND m.left_at IS NULL) AS role,coalesce(paid.amount,0)::text AS "paidMinor",coalesce(consumed.amount,0)::text AS "shareMinor",(coalesce(paid.amount,0)-coalesce(consumed.amount,0))::text AS "netMinor"
   FROM sharing.participant p LEFT JOIN LATERAL(SELECT sum(c.amount_minor::numeric) amount FROM sharing.payer_contribution c JOIN sharing.shared_expense e ON e.group_id=c.group_id AND e.current_revision_id=c.expense_revision_id JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' WHERE c.group_id=p.group_id AND c.participant_id=p.id) paid ON true
   LEFT JOIN LATERAL(SELECT sum(c.amount_minor::numeric) amount FROM sharing.participant_share c JOIN sharing.shared_expense e ON e.group_id=c.group_id AND e.current_revision_id=c.expense_revision_id JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id AND r.state='finalized' WHERE c.group_id=p.group_id AND c.participant_id=p.id) consumed ON true WHERE p.group_id=${groupId}::uuid ORDER BY p.id LIMIT 101`)
      ).rows;
      if (participants.length > 100)
        throw new RangeError("Group exceeds the 100-person preview limit.");
      const bills = (
        await t.db.execute<BillSummary>(
          sql`SELECT e.id,r.id AS "revisionId",r.revision_no AS "revisionNo",r.description,r.expense_date::text AS "expenseDate",r.total_minor::text AS "totalMinor",r.split_method AS "splitMethod",e.created_by_participant_id AS "creatorId",r.category_label AS "categoryLabel",r.notes FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.id=e.current_revision_id WHERE e.group_id=${groupId}::uuid AND (${cursor ?? null}::uuid IS NULL OR e.id<${cursor ?? null}::uuid) ORDER BY e.id DESC LIMIT 51`,
        )
      ).rows;
      const invitations = group.owner
        ? (
            await t.db.execute<GroupDetail["invitations"][number]>(
              sql`SELECT id,target_email_normalized AS email,CASE WHEN state='pending' AND expires_at<=clock_timestamp() THEN 'expired' ELSE state END AS state,expires_at::text AS "expiresAt" FROM sharing.invitation WHERE group_id=${groupId}::uuid ORDER BY created_at DESC LIMIT 50`,
            )
          ).rows
        : [];
      const membershipHistory = (
        await t.db.execute<
          NonNullable<GroupDetail["membershipHistory"]>[number]
        >(
          sql`SELECT id,participant_id AS "participantId",role,joined_at::text AS "joinedAt",left_at::text AS "leftAt",exit_kind AS "exitKind" FROM sharing.membership WHERE group_id=${groupId}::uuid ORDER BY joined_at DESC,id LIMIT 100`,
        )
      ).rows;
      const changes = (
        await t.db.execute<NonNullable<GroupDetail["changes"]>[number]>(
          sql`SELECT id,operation,subject_version AS version,actor_kind AS "actorKind",before_json AS before,after_json AS after,created_at::text AS "recordedAt" FROM audit.group_revision WHERE group_id=${groupId}::uuid ORDER BY created_at DESC,id LIMIT 50`,
        )
      ).rows;
      const ledger = await readGroupLedger(t, groupId);
      for (const p of participants)
        p.netMinor =
          ledger.positions.find((x) => x.participantId === p.id)?.netMinor ??
          "0";
      return {
        ledger,
        membershipHistory,
        changes,
        group,
        participants,
        bills: bills.slice(0, 50),
        nextCursor: bills.length > 50 ? bills[49]!.id : null,
        invitations,
      };
    },
    { readOnlySnapshot: true },
  );
}
export function getBill(actor: Scope, groupId: string, expenseId: string) {
  id.parse(groupId);
  id.parse(expenseId);
  return withDomainTransaction(
    actor,
    async (t) => {
      const rows = (
        await t.db
          .execute<BillRevision>(sql`SELECT e.id,r.id AS "revisionId",r.revision_no AS "revisionNo",r.description,r.expense_date::text AS "expenseDate",r.total_minor::text AS "totalMinor",r.split_method AS "splitMethod",e.created_by_participant_id AS "creatorId",r.category_label AS "categoryLabel",r.notes,r.reason,
  coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',c.participant_id,'amountMinor',c.amount_minor::text) ORDER BY c.participant_id) FROM sharing.payer_contribution c WHERE c.group_id=r.group_id AND c.expense_revision_id=r.id),'[]') AS contributions,
  coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',s.participant_id,'amountMinor',s.amount_minor::text,'roundingRank',s.rounding_rank,'roundingExtraMinor',s.rounding_extra_minor) ORDER BY s.rounding_rank) FROM sharing.participant_share s WHERE s.group_id=r.group_id AND s.expense_revision_id=r.id),'[]') AS shares
  FROM sharing.shared_expense e JOIN sharing.expense_revision r ON r.group_id=e.group_id AND r.expense_id=e.id WHERE e.group_id=${groupId}::uuid AND e.id=${expenseId}::uuid ORDER BY r.revision_no DESC LIMIT 101`)
      ).rows;
      if (!rows[0]) throw new SharingUnavailableError();
      if (rows.length > 100)
        throw new RangeError("Bill history exceeds the preview limit.");
      return rows.map((r) => ({
        ...r,
        positions: [
          ...new Set(
            [...r.contributions, ...r.shares].map((p) => p.participantId),
          ),
        ]
          .sort()
          .map((participantId) => {
            const paidMinor =
                r.contributions.find((p) => p.participantId === participantId)
                  ?.amountMinor ?? "0",
              shareMinor =
                r.shares.find((p) => p.participantId === participantId)
                  ?.amountMinor ?? "0";
            return {
              participantId,
              paidMinor,
              shareMinor,
              netMinor: (BigInt(paidMinor) - BigInt(shareMinor)).toString(),
            };
          }),
      }));
    },
    { readOnlySnapshot: true },
  );
}
export const invitationReviewSchema = z.object({
  groupId: id,
  groupName: z.string(),
  version: z.number(),
  invitationId: id,
  claimParticipantId: id.nullable(),
  claimName: z.string().nullable(),
  paidMinor: z.string(),
  shareMinor: z.string(),
  netMinor: z.string(),
  historyPolicyVersion: z.number(),
  historyNotice: z.string(),
  refunds: z
    .array(
      z.object({
        id,
        expenseId: id,
        date: z.string(),
        reason: z.string(),
        receivedMinor: z.string(),
        shareCreditMinor: z.string(),
      }),
    )
    .default([]),
  settlements: z
    .array(
      z.object({
        id,
        senderId: id,
        recipientId: id,
        date: z.string(),
        amountMinor: z.string(),
        advanceMinor: z.string(),
        state: z.string(),
        version: z.number(),
        events: z.array(
          z.object({
            version: z.number(),
            actorId: id,
            confirmationType: z.string(),
            fromState: z.string().nullable(),
            toState: z.string(),
            reason: z.string(),
          }),
        ),
      }),
    )
    .default([]),
  history: z
    .array(
      z.object({
        expenseId: id,
        revisionId: id,
        revisionNo: z.number(),
        description: z.string(),
        date: z.string(),
        reason: z.string().nullable(),
        paidMinor: z.string(),
        shareMinor: z.string(),
      }),
    )
    .default([]),
});
export type InvitationReview = z.infer<typeof invitationReviewSchema>;
