import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { cardStatementAllocation } from "@/platform/db/schema";
import {
  cardAllocationBodySchema,
  reverseCardAllocationBodySchema,
  CardEvidenceConflictError,
  CardEvidenceUnavailableError,
} from "../domain/card-command";
import { statementIdentifierSchema as id } from "../domain/card-statement";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
const actor = z
  .object({ userId: id, workspaceId: id, requestId: id.optional(), cardId: id })
  .strict();
const resultSchema = z.object({
  allocationId: id,
  financialRevision: z.string().regex(/^\d+$/),
});
type Actor = z.input<typeof actor>;
export function recordCardAllocation(
  input: Actor & z.input<typeof cardAllocationBodySchema>,
) {
  return execute(input, false);
}
export function reverseCardAllocation(
  input: Actor & z.input<typeof reverseCardAllocationBodySchema>,
) {
  return execute(input, true);
}
function execute(
  input: Actor &
    (
      | z.input<typeof cardAllocationBodySchema>
      | z.input<typeof reverseCardAllocationBodySchema>
    ),
  reversal: boolean,
) {
  const { userId, workspaceId, requestId, cardId, ...raw } = input,
    a = actor.parse({ userId, workspaceId, requestId, cardId }),
    b = (
      reversal ? reverseCardAllocationBodySchema : cardAllocationBodySchema
    ).parse(raw);
  return withDomainTransaction(a, async (t) => {
    await lockActiveFinancialWorkspace(t, a.workspaceId);
    const { clientCommandId, ...intent } = b,
      receipt = await claimFinancialCommandReceipt(t, {
        workspaceId: a.workspaceId,
        clientCommandId,
        commandType: reversal
          ? "finance.reverse_card_allocation"
          : "finance.record_card_allocation",
        payloadHash: hashFinancialCommandPayload({
          cardId: a.cardId,
          ...intent,
        }),
      });
    if (receipt.kind === "replay") return resultSchema.parse(receipt.result);
    let data: {
      statementRevisionId: string;
      sourceActionRevisionId: string;
      amountMinor: string;
      confirmationKind: string;
      confirmationSource: string;
      confirmedDate: string;
      reversesAllocationId: string | null;
    };
    let before: Record<string, unknown> | undefined;
    if ("allocationId" in b) {
      const r = await t.db.execute<{
        statementRevisionId: string;
        sourceActionRevisionId: string;
        amountMinor: string;
        confirmationKind: string;
        confirmationSource: string;
        confirmedDate: string;
        reversesAllocationId: string | null;
      }>(
        sql`SELECT x.statement_revision_id AS "statementRevisionId",x.source_action_revision_id AS "sourceActionRevisionId",x.amount_minor::text AS "amountMinor",x.confirmation_kind AS "confirmationKind",x.confirmation_source AS "confirmationSource",x.confirmed_date::text AS "confirmedDate",x.reverses_allocation_id AS "reversesAllocationId" FROM finance.card_statement_allocation x JOIN finance.card_statement_revision r ON r.workspace_id=x.workspace_id AND r.id=x.statement_revision_id JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id WHERE x.workspace_id=${a.workspaceId}::uuid AND x.id=${b.allocationId}::uuid AND s.card_id=${a.cardId}::uuid`,
      );
      const original = r.rows[0];
      if (!original) throw new CardEvidenceUnavailableError();
      if (original.reversesAllocationId)
        throw new CardEvidenceConflictError(
          "A reversal cannot be reversed. Record a fresh confirmed allocation.",
        );
      const already = await t.db.execute(
        sql`SELECT id FROM finance.card_statement_allocation WHERE workspace_id=${a.workspaceId}::uuid AND reverses_allocation_id=${b.allocationId}::uuid`,
      );
      if (already.rows.length)
        throw new CardEvidenceConflictError(
          "This allocation is already reversed.",
        );
      before = { ...original, allocationId: b.allocationId, cardId: a.cardId };
      data = {
        ...original,
        confirmationSource: b.reason,
        reversesAllocationId: b.allocationId,
      };
    } else {
      const r = await t.db.execute<{
        balanceMinor: string;
        amountMinor: string;
        statementUsed: string;
        sourceUsed: string;
        statementCurrent: boolean;
        sourceCurrent: boolean;
        sourceKind: string;
        sourceCardId: string;
      }>(
        sql`SELECT r.balance_minor::text AS "balanceMinor",e.amount_minor::text AS "amountMinor",s.current_revision_id=r.id AS "statementCurrent",f.current_revision_id=e.action_revision_id AS "sourceCurrent",e.action_kind AS "sourceKind",e.card_id AS "sourceCardId",COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.effective_card_allocation_v x WHERE x.workspace_id=r.workspace_id AND x.statement_revision_id=r.id),0)::text AS "statementUsed",COALESCE((SELECT sum(x.amount_minor::numeric) FROM finance.effective_card_allocation_v x WHERE x.workspace_id=r.workspace_id AND x.source_action_revision_id=e.action_revision_id),0)::text AS "sourceUsed" FROM finance.card_statement_revision r JOIN finance.card_statement s ON s.workspace_id=r.workspace_id AND s.id=r.statement_id JOIN finance.card_recognized_evidence_v e ON e.workspace_id=r.workspace_id AND e.action_revision_id=${b.sourceActionRevisionId}::uuid JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id WHERE r.workspace_id=${a.workspaceId}::uuid AND r.id=${b.statementRevisionId}::uuid AND r.state='verified' AND s.card_id=${a.cardId}::uuid`,
      );
      const x = r.rows[0];
      if (!x) throw new CardEvidenceUnavailableError();
      if (
        !x.statementCurrent ||
        !x.sourceCurrent ||
        x.sourceCardId !== a.cardId ||
        !["card_payment", "card_refund"].includes(x.sourceKind) ||
        BigInt(b.amountMinor) + BigInt(x.sourceUsed) > BigInt(x.amountMinor) ||
        BigInt(b.amountMinor) + BigInt(x.statementUsed) > BigInt(x.balanceMinor)
      )
        throw new CardEvidenceConflictError(
          "Allocation requires current same-card payment/refund evidence within its unapplied amount and statement balance.",
        );
      data = {
        statementRevisionId: b.statementRevisionId,
        sourceActionRevisionId: b.sourceActionRevisionId,
        amountMinor: b.amountMinor,
        confirmationKind: b.confirmationKind,
        confirmationSource: b.confirmationSource,
        confirmedDate: b.confirmedDate,
        reversesAllocationId: null,
      };
    }
    const allocationId = randomUUID();
    await t.db.insert(cardStatementAllocation).values({
      ...data,
      amountMinor: BigInt(data.amountMinor),
      id: allocationId,
      workspaceId: a.workspaceId,
      commandReceiptId: receipt.receiptId,
      recordedByUserId: a.userId,
      requestId: a.requestId ?? null,
    });
    await createPrivateFinancialRevision(t, {
      id: randomUUID(),
      workspaceId: a.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "card_allocation",
      subjectId: allocationId,
      subjectVersion: 1,
      operation: reversal ? "void" : "create",
      beforeJson: before,
      afterJson: { ...data, allocationId, cardId: a.cardId },
      reason: "reason" in b ? b.reason : undefined,
      effectiveDate: data.confirmedDate,
      recordedByUserId: a.userId,
      requestId: a.requestId ?? null,
    });
    const result = {
      allocationId,
      financialRevision: await advanceWorkspaceFinancialRevision(
        t,
        a.workspaceId,
      ),
    };
    await completeFinancialCommandReceipt(t, {
      workspaceId: a.workspaceId,
      receiptId: receipt.receiptId,
      result,
    });
    await enforceDeferredFinancialConstraints(t);
    return result;
  });
}
