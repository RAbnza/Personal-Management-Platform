import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import {
  cardInstallment,
  cardInstallmentPlan,
  cardInstallmentRevision,
  cardInstallmentApplication,
} from "@/platform/db/schema";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { statementIdentifierSchema as id } from "../domain/card-statement";
import {
  cardInstallmentCommandSchema,
  cardInstallmentApplicationSchema,
  reverseInstallmentApplicationSchema,
  installmentResultSchema,
  CardInstallmentConflictError,
  CardInstallmentUnavailableError,
} from "../domain/card-installment";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";
import {
  readInstallmentPurchase,
  readInstallmentRoot,
  readInstallmentSnapshot,
  readInstallmentRefundEvidence,
  readInstallmentApplicationSnapshot,
} from "../repositories/card-installment-repository";
import { getCreditCardDetailInTransaction } from "./read-credit-cards";
const actorSchema = z
  .object({ userId: id, workspaceId: id, requestId: id.optional() })
  .strict();
export type CardInstallmentInput = z.input<typeof actorSchema> &
  z.input<typeof cardInstallmentCommandSchema>;
export function recordCardInstallmentPlan(input: CardInstallmentInput) {
  const { userId, workspaceId, requestId, ...raw } = input,
    actor = actorSchema.parse({ userId, workspaceId, requestId }),
    body = cardInstallmentCommandSchema.parse(raw);
  return withDomainTransaction(actor, (t) =>
    recordInTransaction(t, actor, body),
  );
}
async function recordInTransaction(
  t: ScopedTransaction,
  a: z.output<typeof actorSchema>,
  b: z.output<typeof cardInstallmentCommandSchema>,
) {
  await lockActiveFinancialWorkspace(t, a.workspaceId);
  const { clientCommandId, ...intent } = b,
    receipt = await claimFinancialCommandReceipt(t, {
      workspaceId: a.workspaceId,
      clientCommandId,
      commandType: b.planId
        ? "finance.revise_card_installment_plan"
        : "finance.record_card_installment_plan",
      payloadHash: hashFinancialCommandPayload({
        ...intent,
        planId: b.planId ?? null,
        expectedVersion: b.expectedVersion ?? null,
        reason: b.reason ?? null,
      }),
    });
  if (receipt.kind === "replay")
    return installmentResultSchema.parse(receipt.result);
  await getCreditCardDetailInTransaction(t, {
    userId: a.userId,
    workspaceId: a.workspaceId,
    cardId: b.cardId,
  });
  const root = b.planId
    ? await readInstallmentRoot(t, a.workspaceId, b.cardId, b.planId)
    : null;
  if (
    root &&
    (root.version !== b.expectedVersion ||
      root.purchaseActionId !== b.purchaseActionId)
  )
    throw new CardInstallmentConflictError();
  const before = root
    ? await readInstallmentSnapshot(t, a.workspaceId, root.currentRevisionId)
    : null;
  const source = await readInstallmentPurchase(
    t,
    a.workspaceId,
    b.cardId,
    b.purchaseActionId,
    b.purchaseActionRevisionId,
  );
  if (
    BigInt(b.principalMinor) > BigInt(source.amountMinor) ||
    b.installments.some(
      (i) => i.dueDate !== null && i.dueDate < source.transactionDate,
    ) ||
    (b.lifecycle === "active" && !source.current) ||
    (b.lifecycle === "cancelled" &&
      before?.purchaseActionRevisionId !== b.purchaseActionRevisionId)
  )
    throw new CardInstallmentConflictError(
      "Confirm a complete schedule within the recognized purchase, or retain its previous source when cancelling.",
    );
  const occupied = await t.db.execute(
    sql`SELECT p.id FROM finance.card_installment_plan p JOIN finance.card_installment_revision r ON r.workspace_id=p.workspace_id AND r.id=p.current_revision_id AND r.lifecycle='active' WHERE p.workspace_id=${a.workspaceId}::uuid AND p.purchase_action_id=${b.purchaseActionId}::uuid AND p.id IS DISTINCT FROM ${b.planId ?? null}::uuid LIMIT 1`,
  );
  if (b.lifecycle === "active" && occupied.rows.length)
    throw new CardInstallmentConflictError(
      "Revise or cancel the existing active plan for this purchase.",
    );
  const planId = b.planId ?? randomUUID(),
    revisionId = randomUUID(),
    version = (root?.version ?? 0) + 1,
    refundEvidence =
      b.lifecycle === "cancelled"
        ? before!.refundEvidence
        : await readInstallmentRefundEvidence(
            t,
            a.workspaceId,
            b.purchaseActionId,
          );
  if (!root)
    await t.db.insert(cardInstallmentPlan).values({
      id: planId,
      workspaceId: a.workspaceId,
      cardId: b.cardId,
      purchaseActionId: b.purchaseActionId,
    });
  await t.db.insert(cardInstallmentRevision).values({
    id: revisionId,
    workspaceId: a.workspaceId,
    planId,
    revisionNo: version,
    previousRevisionId: root?.currentRevisionId ?? null,
    commandReceiptId: receipt.receiptId,
    purchaseActionRevisionId: b.purchaseActionRevisionId,
    principalMinor: BigInt(b.principalMinor),
    installmentCount: b.installmentCount,
    lifecycle: b.lifecycle,
    providerReference: b.providerReference,
    verificationSource: b.verificationSource,
    verifiedDate: b.verifiedDate,
    notes: b.notes,
    reason: b.reason ?? null,
    refundEvidence,
    recordedByUserId: a.userId,
    requestId: a.requestId ?? null,
  });
  await t.db.insert(cardInstallment).values(
    b.installments.map((i, index) => ({
      ...i,
      principalMinor: BigInt(i.principalMinor),
      interestMinor: i.interestMinor === null ? null : BigInt(i.interestMinor),
      feeMinor: i.feeMinor === null ? null : BigInt(i.feeMinor),
      totalMinor: i.totalMinor === null ? null : BigInt(i.totalMinor),
      workspaceId: a.workspaceId,
      planRevisionId: revisionId,
      sequenceNo: index + 1,
    })),
  );
  const after = await readInstallmentSnapshot(t, a.workspaceId, revisionId);
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "card_installment_plan",
    subjectId: planId,
    subjectVersion: version,
    operation: root ? "replace" : "create",
    beforeJson: before,
    afterJson: after,
    reason: b.reason ?? null,
    effectiveDate: b.verifiedDate,
    recordedByUserId: a.userId,
    actorKind: "user",
    requestId: a.requestId ?? null,
  });
  await t.db.execute(
    sql`UPDATE finance.card_installment_revision SET state='verified',finalized_at=clock_timestamp() WHERE workspace_id=${a.workspaceId}::uuid AND id=${revisionId}::uuid`,
  );
  await t.db.execute(
    sql`UPDATE finance.card_installment_plan SET current_revision_id=${revisionId}::uuid,version=${version} WHERE workspace_id=${a.workspaceId}::uuid AND id=${planId}::uuid`,
  );
  const result = {
    planId,
    revisionId,
    version,
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
}
const applicationActor = actorSchema.extend({ cardId: id, planId: id });
const appResult = z.object({
  applicationId: id,
  financialRevision: z.string().regex(/^\d+$/),
});
export type InstallmentApplicationInput = z.input<typeof applicationActor> &
  z.input<typeof cardInstallmentApplicationSchema>;
export type ReverseInstallmentApplicationInput = z.input<
  typeof applicationActor
> &
  z.input<typeof reverseInstallmentApplicationSchema>;
export function recordInstallmentApplication(i: InstallmentApplicationInput) {
  return executeApplication(i, false);
}
export function reverseInstallmentApplication(
  i: ReverseInstallmentApplicationInput,
) {
  return executeApplication(i, true);
}
function executeApplication(
  input: InstallmentApplicationInput | ReverseInstallmentApplicationInput,
  reversal: boolean,
) {
  const { userId, workspaceId, requestId, cardId, planId, ...raw } = input,
    a = applicationActor.parse({
      userId,
      workspaceId,
      requestId,
      cardId,
      planId,
    }),
    b = (
      reversal
        ? reverseInstallmentApplicationSchema
        : cardInstallmentApplicationSchema
    ).parse(raw);
  return withDomainTransaction(a, async (t) => {
    await lockActiveFinancialWorkspace(t, a.workspaceId);
    const { clientCommandId, ...intent } = b,
      receipt = await claimFinancialCommandReceipt(t, {
        workspaceId: a.workspaceId,
        clientCommandId,
        commandType: reversal
          ? "finance.reverse_card_installment_application"
          : "finance.record_card_installment_application",
        payloadHash: hashFinancialCommandPayload({
          ...intent,
          cardId: a.cardId,
          planId: a.planId,
        }),
      });
    if (receipt.kind === "replay") return appResult.parse(receipt.result);
    const root = await readInstallmentRoot(
      t,
      a.workspaceId,
      a.cardId,
      a.planId,
    );
    let data: typeof cardInstallmentApplication.$inferInsert,
      before: Record<string, unknown> | null = null;
    if ("applicationId" in b) {
      before = await readInstallmentApplicationSnapshot(
        t,
        a.workspaceId,
        b.applicationId,
      );
      if (before.planId !== a.planId || before.cardId !== a.cardId)
        throw new CardInstallmentUnavailableError();
      if (before.reversesApplicationId !== null)
        throw new CardInstallmentConflictError(
          "A reversal cannot be reversed; confirm a fresh application.",
        );
      const already = await t.db.execute(
        sql`SELECT id FROM finance.card_installment_application WHERE workspace_id=${a.workspaceId}::uuid AND reverses_application_id=${b.applicationId}::uuid`,
      );
      if (already.rows.length)
        throw new CardInstallmentConflictError(
          "This application is already reversed.",
        );
      data = {
        workspaceId: a.workspaceId,
        planRevisionId: String(before.planRevisionId),
        installmentNo: Number(before.installmentNo),
        allocationId: String(before.allocationId),
        principalMinor: BigInt(String(before.principalMinor)),
        interestMinor: BigInt(String(before.interestMinor)),
        feeMinor: BigInt(String(before.feeMinor)),
        interestActionRevisionId: before.interestActionRevisionId as
          string | null,
        feeActionRevisionId: before.feeActionRevisionId as string | null,
        confirmationKind: String(before.confirmationKind),
        confirmationSource: b.reason,
        confirmedDate: String(before.confirmedDate),
        reversesApplicationId: b.applicationId,
        commandReceiptId: receipt.receiptId,
        recordedByUserId: a.userId,
        requestId: a.requestId ?? null,
      };
    } else {
      if (root.currentRevisionId !== b.planRevisionId)
        throw new CardInstallmentConflictError();
      const eligible = await t.db.execute<{
        principalMinor: string;
        interestMinor: string | null;
        feeMinor: string | null;
        totalMinor: string | null;
        allocationMinor: string;
        allocationUsed: string;
        principalUsed: string;
        interestUsed: string;
        feeUsed: string;
        eligible: boolean;
        sourceDate: string;
        allocationDate: string;
      }>(
        sql`SELECT i.principal_minor::text AS "principalMinor",i.interest_minor::text AS "interestMinor",i.fee_minor::text AS "feeMinor",i.total_minor::text AS "totalMinor",a.amount_minor::text AS "allocationMinor",p.eligible,payment.transaction_date::text AS "sourceDate",a.confirmed_date::text AS "allocationDate",COALESCE((SELECT sum(x.principal_minor::numeric+x.interest_minor::numeric+x.fee_minor::numeric) FROM finance.effective_card_installment_application_v x WHERE x.workspace_id=a.workspace_id AND x.allocation_id=a.id),0)::text AS "allocationUsed",COALESCE(totals.p,0)::text AS "principalUsed",COALESCE(totals.i,0)::text AS "interestUsed",COALESCE(totals.f,0)::text AS "feeUsed" FROM finance.card_installment_evidence_v p JOIN finance.card_installment i ON i.workspace_id=p.workspace_id AND i.plan_revision_id=p.plan_revision_id AND i.sequence_no=${b.installmentNo} JOIN finance.effective_card_allocation_v a ON a.workspace_id=p.workspace_id AND a.id=${b.allocationId}::uuid JOIN finance.card_statement_revision sr ON sr.workspace_id=a.workspace_id AND sr.id=a.statement_revision_id JOIN finance.card_statement s ON s.workspace_id=sr.workspace_id AND s.id=sr.statement_id AND s.card_id=p.card_id JOIN finance.card_recognized_evidence_v payment ON payment.workspace_id=a.workspace_id AND payment.action_revision_id=a.source_action_revision_id LEFT JOIN LATERAL(SELECT sum(x.principal_minor::numeric) p,sum(x.interest_minor::numeric) i,sum(x.fee_minor::numeric) f FROM finance.effective_card_installment_application_v x WHERE x.workspace_id=i.workspace_id AND x.plan_revision_id=i.plan_revision_id AND x.installment_no=i.sequence_no) totals ON true WHERE p.workspace_id=${a.workspaceId}::uuid AND p.plan_id=${a.planId}::uuid AND p.plan_revision_id=${b.planRevisionId}::uuid`,
      );
      const x = eligible.rows[0];
      if (!x) throw new CardInstallmentUnavailableError();
      const principal = BigInt(b.principalMinor),
        interest = BigInt(b.interestMinor),
        fee = BigInt(b.feeMinor),
        total = principal + interest + fee;
      if (
        !x.eligible ||
        b.confirmedDate < x.sourceDate ||
        b.confirmedDate < x.allocationDate ||
        total + BigInt(x.allocationUsed) > BigInt(x.allocationMinor) ||
        principal + BigInt(x.principalUsed) > BigInt(x.principalMinor) ||
        (interest > 0n &&
          (x.interestMinor === null ||
            interest + BigInt(x.interestUsed) > BigInt(x.interestMinor))) ||
        (fee > 0n &&
          (x.feeMinor === null ||
            fee + BigInt(x.feeUsed) > BigInt(x.feeMinor))) ||
        (x.totalMinor !== null &&
          total +
            BigInt(x.principalUsed) +
            BigInt(x.interestUsed) +
            BigInt(x.feeUsed) >
            BigInt(x.totalMinor))
      )
        throw new CardInstallmentConflictError(
          "Application exceeds the supported schedule or confirmed statement allocation evidence.",
        );
      for (const [kind, revision, amount] of [
        ["card_interest", b.interestActionRevisionId, interest],
        ["card_fee", b.feeActionRevisionId, fee],
      ] as const) {
        if (!revision) continue;
        const charge = await t.db.execute<{
          amountMinor: string;
          usedMinor: string;
          date: string;
        }>(
          sql`SELECT e.amount_minor::text AS "amountMinor",e.transaction_date::text AS date,COALESCE((SELECT sum(CASE WHEN ${kind}='card_interest' THEN c.interest_minor::numeric ELSE c.fee_minor::numeric END) FROM finance.effective_card_installment_application_v c WHERE c.workspace_id=e.workspace_id AND CASE WHEN ${kind}='card_interest' THEN c.interest_action_revision_id ELSE c.fee_action_revision_id END=e.action_revision_id),0)::text AS "usedMinor" FROM finance.card_recognized_evidence_v e JOIN finance.financial_action f ON f.workspace_id=e.workspace_id AND f.id=e.action_id AND f.current_revision_id=e.action_revision_id WHERE e.workspace_id=${a.workspaceId}::uuid AND e.card_id=${a.cardId}::uuid AND e.action_revision_id=${revision}::uuid AND e.action_kind=${kind}`,
        );
        if (!charge.rows[0]) throw new CardInstallmentUnavailableError();
        if (
          b.confirmedDate < charge.rows[0].date ||
          amount + BigInt(charge.rows[0].usedMinor) >
            BigInt(charge.rows[0].amountMinor)
        )
          throw new CardInstallmentConflictError(
            "Application exceeds actual recognized interest or fee evidence.",
          );
      }
      const { clientCommandId: _command, ...fields } = b;
      void _command;
      data = {
        ...fields,
        principalMinor: principal,
        interestMinor: interest,
        feeMinor: fee,
        workspaceId: a.workspaceId,
        reversesApplicationId: null,
        commandReceiptId: receipt.receiptId,
        recordedByUserId: a.userId,
        requestId: a.requestId ?? null,
      };
    }
    const applicationId = randomUUID();
    await t.db
      .insert(cardInstallmentApplication)
      .values({ ...data, id: applicationId });
    const after = await readInstallmentApplicationSnapshot(
      t,
      a.workspaceId,
      applicationId,
    );
    await createPrivateRevision(t, {
      id: randomUUID(),
      workspaceId: a.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "card_installment_application",
      subjectId: applicationId,
      subjectVersion: 1,
      operation: reversal ? "void" : "create",
      beforeJson: before,
      afterJson: after,
      reason: "reason" in b ? b.reason : null,
      effectiveDate: data.confirmedDate,
      recordedByUserId: a.userId,
      actorKind: "user",
      requestId: a.requestId ?? null,
    });
    const result = {
      applicationId,
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
