import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import {
  deriveStatementReconciliation,
  StatementUnavailableError,
} from "../domain/card-statement";
import {
  readStatementSnapshot,
  readStatementCandidates,
  readStatementList,
  readStatementAssociations,
  countUnlinkedStatementPurchases,
} from "../repositories/card-statement-repository";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";
const input = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    cardId: z.uuid(),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export function listCardStatements(i: z.input<typeof input>) {
  const p = input.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: p.userId,
        workspaceId: p.workspaceId,
        cardId: p.cardId,
      });
      return {
        ...detail,
        ...(await readStatementList(t, p.workspaceId, p.cardId, p.offset)),
      };
    },
    { readOnlySnapshot: true },
  );
}
export function getStatementEntrySetup(i: z.input<typeof input>) {
  const p = input.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: p.userId,
        workspaceId: p.workspaceId,
        cardId: p.cardId,
      });
      return {
        ...detail,
        ...(await readStatementCandidates(
          t,
          p.workspaceId,
          p.cardId,
          p.offset,
        )),
      };
    },
    { readOnlySnapshot: true },
  );
}
const detailInput = input.omit({ offset: true }).extend({
  statementId: z.uuid(),
  revisionId: z.uuid().optional(),
  historyOffset: z.number().int().min(0).max(10000).default(0),
});
export function getCardStatement(i: z.input<typeof detailInput>) {
  const p = detailInput.parse(i);
  return withDomainTransaction(
    p,
    async (t) => {
      const detail = await getCreditCardDetailInTransaction(t, {
        userId: p.userId,
        workspaceId: p.workspaceId,
        cardId: p.cardId,
      });
      const root = await t.db.execute<{
        cardId: string;
        currentRevisionId: string;
        version: number;
      }>(
        sql`SELECT card_id AS "cardId",current_revision_id AS "currentRevisionId",version FROM finance.card_statement WHERE workspace_id=${p.workspaceId}::uuid AND id=${p.statementId}::uuid`,
      );
      if (!root.rows[0] || root.rows[0].cardId !== p.cardId)
        throw new StatementUnavailableError();
      const snapshot = await readStatementSnapshot(
        t,
        p.workspaceId,
        p.statementId,
        p.revisionId ?? null,
      );
      if (!snapshot) throw new StatementUnavailableError();
      const associations = await readStatementAssociations(
        t,
        p.workspaceId,
        snapshot.revisionId,
      );
      const candidates = await readStatementCandidates(
        t,
        p.workspaceId,
        p.cardId,
        0,
        { start: snapshot.cycleStart, end: snapshot.cycleEnd },
      );
      const history = await t.db.execute<{
        revisionId: string;
        version: number;
        reason: string | null;
        verifiedDate: string;
        createdAt: string;
        verificationSource: string;
      }>(
        sql`SELECT id AS "revisionId",revision_no AS version,reason,verified_date::text AS "verifiedDate",created_at::text AS "createdAt",verification_source AS "verificationSource" FROM finance.card_statement_revision WHERE workspace_id=${p.workspaceId}::uuid AND statement_id=${p.statementId}::uuid AND state='verified' ORDER BY revision_no DESC LIMIT 26 OFFSET ${p.historyOffset}`,
      );
      return {
        ...detail,
        snapshot,
        currentVersion: root.rows[0].version,
        isCurrent: snapshot.revisionId === root.rows[0].currentRevisionId,
        reconciliation: {
          ...deriveStatementReconciliation(snapshot),
          changedLinkedCount: associations.filter((a) => a.changed).length,
        },
        associations,
        unlinkedRecognized: candidates.items.filter(
          (c) =>
            !c.statementId &&
            c.postingDate >= snapshot.cycleStart &&
            c.postingDate <= snapshot.cycleEnd,
        ),
        candidatesHaveMore: candidates.hasMore,
        unlinkedRecognizedCount: await countUnlinkedStatementPurchases(
          t,
          p.workspaceId,
          p.cardId,
          snapshot.cycleStart,
          snapshot.cycleEnd,
        ),
        history: history.rows.slice(0, 25),
        historyHasMore: history.rows.length > 25,
      };
    },
    { readOnlySnapshot: true },
  );
}
