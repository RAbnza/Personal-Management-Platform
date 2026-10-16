import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  id,
  SharingConflictError,
  SharingUnavailableError,
} from "@/modules/sharing/domain/sharing";
import {
  lockGroup,
  type SharingActor,
} from "@/modules/sharing/services/groups";
import {
  lockActiveFinancialWorkspace,
  createPrivateFinancialRevision,
} from "../repositories/financial-write-repository";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import { hashFinancialCommandPayload } from "../domain/financial-command";
export const privateSourceReviewSchema = z
  .object({
    clientCommandId: id,
    groupId: id,
    linkId: id,
    expectedLinkRevisionId: id,
    expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedFinancialRevision: z.string().regex(/^(0|[1-9]\d*)$/),
    approved: z.literal(true),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type RetainedSourceReview = {
  id: string;
  reason: string;
  reviewedAt: string;
};
export async function readPrivateLinkAmounts(
  t: ScopedTransaction,
  linkId: string,
) {
  return (
    await t.db.execute<{
      fundingMinor: string;
      spendingMinor: string;
      groupMinor: string;
      clearingMinor: string;
    }>(
      sql`SELECT coalesce(sum(p.amount_minor::numeric) FILTER(WHERE a.kind IN('cash_asset','card_liability')),0)::text AS "fundingMinor",coalesce(sum(p.amount_minor::numeric) FILTER(WHERE a.kind='expense'),0)::text AS "spendingMinor",coalesce(sum(p.amount_minor::numeric) FILTER(WHERE a.kind IN('group_receivable_asset','group_payable_liability')),0)::text AS "groupMinor",coalesce(sum(p.amount_minor::numeric) FILTER(WHERE a.kind='payment_clearing_asset'),0)::text AS "clearingMinor" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id JOIN finance.journal j ON j.workspace_id=r.workspace_id AND j.action_revision_id=r.action_revision_id AND j.role='economic' LEFT JOIN finance.posting p ON p.workspace_id=j.workspace_id AND p.journal_id=j.id LEFT JOIN finance.ledger_account a ON a.workspace_id=p.workspace_id AND a.id=p.ledger_account_id WHERE l.id=${linkId}::uuid`,
    )
  ).rows[0]!;
}
export async function readRetainedSourceReview(
  t: ScopedTransaction,
  linkId: string,
  linkRevisionId: string,
  sourceHash: string,
) {
  return (
    (
      await t.db.execute<RetainedSourceReview>(
        sql`SELECT id,reason,created_at::text AS "reviewedAt" FROM finance.private_group_review WHERE link_id=${linkId}::uuid AND accepted_link_revision_id=${linkRevisionId}::uuid AND source_hash=${sourceHash} ORDER BY created_at DESC,id DESC LIMIT 1`,
      )
    ).rows[0] ?? null
  );
}
export function reviewGroupSource(actor: SharingActor, raw: unknown) {
  const c = privateSourceReviewSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    await lockGroup(t, c.groupId, true);
    await lockActiveFinancialWorkspace(t, actor.workspaceId);
    const receipt = await claimFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      clientCommandId: c.clientCommandId,
      commandType: "finance.review_group_source",
      payloadHash: hashFinancialCommandPayload(c),
    });
    if (receipt.kind === "replay") return receipt.result;
    const link = (
      await t.db.execute<{ revisionId: string; sourceHash: string }>(
        sql`SELECT l.current_link_revision_id AS "revisionId",r.accepted_source_hash AS "sourceHash" FROM finance.private_group_link l JOIN finance.private_group_link_revision r ON r.workspace_id=l.workspace_id AND r.id=l.current_link_revision_id WHERE l.id=${c.linkId}::uuid AND l.group_id=${c.groupId}::uuid`,
      )
    ).rows[0];
    if (!link) throw new SharingUnavailableError();
    const source = (
        await t.db.execute<{ v: Record<string, unknown> }>(
          sql`SELECT finance.private_group_review_source(${c.linkId}::uuid) v`,
        )
      ).rows[0]!.v,
      financialRevision = (
        await t.db.execute<{ v: string }>(
          sql`SELECT financial_revision::text v FROM core.workspace WHERE id=${actor.workspaceId}::uuid`,
        )
      ).rows[0]!.v;
    if (
      link.revisionId !== c.expectedLinkRevisionId ||
      source.sourceHash !== c.expectedSourceHash ||
      financialRevision !== c.expectedFinancialRevision
    )
      throw new SharingConflictError();
    if (link.sourceHash === source.sourceHash)
      throw new RangeError(
        "This source already matches your private acceptance.",
      );
    const reviewId = randomUUID();
    await t.db.execute(
      sql`INSERT INTO finance.private_group_review(id,workspace_id,link_id,accepted_link_revision_id,source_hash,reviewed_source_json,reason,command_receipt_id) VALUES(${reviewId}::uuid,${actor.workspaceId}::uuid,${c.linkId}::uuid,${link.revisionId}::uuid,${c.expectedSourceHash},${JSON.stringify(source)}::jsonb,${c.reason},${receipt.receiptId}::uuid)`,
    );
    await createPrivateFinancialRevision(t, {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "private_group_review",
      subjectId: reviewId,
      subjectVersion: 1,
      operation: "retain_private_evidence",
      reason: c.reason,
      afterJson: {
        linkId: c.linkId,
        acceptedLinkRevisionId: link.revisionId,
        sourceHash: c.expectedSourceHash,
        decision: "retain_private_evidence",
        source,
      },
      effectiveDate: null,
      recordedByUserId: actor.userId,
      requestId: actor.requestId ?? null,
    });
    const result = { reviewId, linkId: c.linkId };
    await completeFinancialCommandReceipt(t, {
      workspaceId: actor.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    return result;
  });
}
