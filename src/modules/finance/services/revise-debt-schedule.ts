import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withDomainTransaction, type ScopedTransaction } from "@/platform/db";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import {
  buildScheduleRevisionPreview,
  reviseDebtScheduleBodySchema,
  revisionResultSchema,
  SchedulePreviewStaleError,
  type RevisionBody,
} from "../domain/debt-schedule-revision";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  readScheduleContext,
  readSchedulePaymentPools,
  insertScheduleRevision,
  insertRevisionCharge,
  activateScheduleRevision,
} from "../repositories/debt-schedule-repository";
import {
  lockActiveFinancialWorkspace,
  advanceWorkspaceFinancialRevision,
  enforceDeferredFinancialConstraints,
  createPrivateFinancialRevision,
  finalizeActionRevision,
  finalizeJournal,
} from "../repositories/financial-write-repository";
import {
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
} from "../repositories/expense-repository";
import { resolvePaymentDebt } from "../repositories/debt-payment-repository";
import { getDebtDetailInTransaction, DebtUnavailableError } from "./read-debts";
const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type ReviseDebtScheduleInput = z.input<
  typeof reviseDebtScheduleBodySchema
> &
  z.input<typeof actorSchema>;
function normalize(input: ReviseDebtScheduleInput) {
  const { userId, workspaceId, requestId, ...body } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: reviseDebtScheduleBodySchema.parse(body),
  };
}
async function execute(
  t: ScopedTransaction,
  actor: z.output<typeof actorSchema>,
  body: RevisionBody,
) {
  const workspace = await lockActiveFinancialWorkspace(t, actor.workspaceId);
  const { clientCommandId, ...intent } = body;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    clientCommandId,
    commandType: "finance.revise_debt_schedule",
    payloadHash: hashFinancialCommandPayload(intent),
  });
  if (receipt.kind === "replay")
    return revisionResultSchema.parse(receipt.result);
  const detail = await getDebtDetailInTransaction(t, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
    debtId: body.debtId,
  });
  if (
    detail.debt.version !== body.expectedDebtVersion ||
    detail.debt.scheduleVersionId !== body.expectedScheduleVersionId ||
    detail.financialRevision !== body.expectedFinancialRevision
  )
    throw new SchedulePreviewStaleError();
  if (detail.debt.lifecycle !== "active")
    throw new RangeError("Schedule revisions require an active debt.");
  if (
    body.effectiveDate < detail.debt.startDate ||
    (detail.debt.openingCutoffDate &&
      body.effectiveDate <= detail.debt.openingCutoffDate)
  )
    throw new RangeError(
      "A revision must follow the opening cutoff and cannot precede the debt start date.",
    );
  const context = await readScheduleContext(t, {
    workspaceId: actor.workspaceId,
    debtId: body.debtId,
    scheduleVersionId: body.expectedScheduleVersionId,
  });
  const pools = await readSchedulePaymentPools(t, {
    workspaceId: actor.workspaceId,
    debtId: body.debtId,
    scheduleVersionId: body.expectedScheduleVersionId,
  });
  const setup = { detail, frequency: context.frequency, pools };
  buildScheduleRevisionPreview(body, setup);
  let chargeActionId: string | null = null;
  if (body.recognizedCharge) {
    const debt = await resolvePaymentDebt(t, {
      workspaceId: actor.workspaceId,
      debtId: body.debtId,
    });
    if (!debt) throw new DebtUnavailableError();
    if (body.recognizedCharge.categoryId)
      await ensureActiveExpenseCategory(t, {
        workspaceId: actor.workspaceId,
        categoryId: body.recognizedCharge.categoryId,
      });
    const expenseLedgerId = await getOrCreateSharedExpenseLedger(t, {
      workspaceId: actor.workspaceId,
      currency: workspace.currency,
    });
    const ids = await insertRevisionCharge(t, {
      ...actor,
      requestId: actor.requestId ?? null,
      receiptId: receipt.receiptId,
      currency: workspace.currency,
      liabilityLedgerId: debt.liability_ledger_account_id,
      expenseLedgerId,
      body,
    });
    chargeActionId = ids.actionId;
    await createPrivateFinancialRevision(t, {
      id: randomUUID(),
      workspaceId: actor.workspaceId,
      commandReceiptId: receipt.receiptId,
      subjectKind: "financial_action",
      subjectId: ids.actionId,
      subjectVersion: 1,
      operation: "create",
      afterJson: {
        actionKind: "debt_charge",
        debtId: body.debtId,
        ...body.recognizedCharge,
      },
      effectiveDate: body.effectiveDate,
      recordedByUserId: actor.userId,
      requestId: actor.requestId ?? null,
    });
    await finalizeJournal(t, {
      workspaceId: actor.workspaceId,
      journalId: ids.journalId,
    });
    await finalizeActionRevision(t, {
      workspaceId: actor.workspaceId,
      actionRevisionId: ids.actionRevisionId,
    });
  }
  const inserted = await insertScheduleRevision(t, {
    ...actor,
    requestId: actor.requestId ?? null,
    body,
    setup,
    versionNo: context.version_no + 1,
  });
  const debtVersion = await activateScheduleRevision(t, {
    workspaceId: actor.workspaceId,
    debtId: body.debtId,
    scheduleVersionId: inserted.scheduleVersionId,
    expectedDebtVersion: body.expectedDebtVersion,
  });
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "debt_schedule_version",
    subjectId: inserted.scheduleVersionId,
    subjectVersion: context.version_no + 1,
    operation: "create",
    beforeJson: {
      scheduleVersionId: body.expectedScheduleVersionId,
      debtVersion: body.expectedDebtVersion,
      frequency: context.frequency,
      entries: detail.installments,
      pools,
    },
    afterJson: { ...intent, ...inserted, chargeActionId, debtVersion },
    reason: body.reason,
    effectiveDate: body.effectiveDate,
    recordedByUserId: actor.userId,
    actorKind: "user",
    requestId: actor.requestId ?? null,
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    t,
    actor.workspaceId,
  );
  const result = {
    debtId: body.debtId,
    scheduleVersionId: inserted.scheduleVersionId,
    scheduleVersionNo: context.version_no + 1,
    debtVersion,
    financialRevision,
    chargeActionId,
  };
  await completeFinancialCommandReceipt(t, {
    workspaceId: actor.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return revisionResultSchema.parse(result);
}
export function reviseDebtScheduleInTransaction(
  t: ScopedTransaction,
  input: ReviseDebtScheduleInput,
) {
  const { actor, body } = normalize(input);
  return execute(t, actor, body);
}
export function reviseDebtSchedule(input: ReviseDebtScheduleInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (t) => execute(t, actor, body));
}
