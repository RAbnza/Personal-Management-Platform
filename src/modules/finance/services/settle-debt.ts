import { getOrCreateAdjustmentEquityLedger } from "../repositories/adjustment-equity-repository";
import { createPrivateRevision } from "@/modules/audit/repositories/private-revision-repository";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { listCategoriesInTransaction } from "@/modules/core/services/list-categories";
import { listFinancialAccountsInTransaction } from "./list-financial-accounts";
import { getDebtDetailInTransaction } from "./read-debts";
import {
  buildSettlementPreview,
  settlementAdjustmentTreatment,
  settlementPreviewSchema,
  settleDebtBodySchema,
  settlementResultSchema,
  type SettlementInputBody,
  type SettlementBody,
  type SettlementSetup,
} from "../domain/debt-settlement";
import { hashFinancialCommandPayload } from "../domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "../repositories/command-receipt-repository";
import {
  resolvePaymentAccount,
  resolvePaymentDebt,
} from "../repositories/debt-payment-repository";
import {
  readScheduleContext,
  readSchedulePaymentPools,
} from "../repositories/debt-schedule-repository";
import {
  closeSettledDebt,
  insertSettlement,
  latestDebtActivityDate,
  readOpeningWaiverCapacity,
  readWaiverSource,
  readSettlementChargeSources,
} from "../repositories/debt-settlement-repository";
import {
  ensureActiveExpenseCategory,
  getOrCreateSharedExpenseLedger,
} from "../repositories/expense-repository";
import {
  advanceWorkspaceFinancialRevision,
  createPrivateFinancialRevision,
  enforceDeferredFinancialConstraints,
  finalizeActionRevision,
  finalizeJournal,
  lockActiveFinancialWorkspace,
} from "../repositories/financial-write-repository";

const actorSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    requestId: z.uuid().optional(),
  })
  .strict();
type Actor = z.output<typeof actorSchema>;
export type SettleDebtInput = SettlementInputBody & z.input<typeof actorSchema>;
function normalize(input: SettleDebtInput) {
  const { userId, workspaceId, requestId, ...intent } = input;
  return {
    actor: actorSchema.parse({ userId, workspaceId, requestId }),
    body: settleDebtBodySchema.parse(intent),
  };
}
export async function getSettlementSetupInTransaction(
  t: ScopedTransaction,
  a: { userId: string; workspaceId: string; debtId: string },
): Promise<SettlementSetup & { versionNo: number }> {
  const detail = await getDebtDetailInTransaction(t, a);
  if (!detail.debt.scheduleVersionId)
    throw new RangeError("A finalized schedule context is required.");
  const input = {
    workspaceId: a.workspaceId,
    debtId: a.debtId,
    scheduleVersionId: detail.debt.scheduleVersionId,
  };
  const header = await readScheduleContext(t, input);
  return {
    detail,
    frequency: header.frequency,
    versionNo: header.version_no,
    pools: await readSchedulePaymentPools(t, input),
  };
}
export function getDebtSettlementSetup(input: {
  userId: string;
  workspaceId: string;
  debtId: string;
}) {
  const a = z
    .object({ userId: z.uuid(), workspaceId: z.uuid(), debtId: z.uuid() })
    .strict()
    .parse(input);
  return withDomainTransaction(
    a,
    async (t) => ({
      ...(await getSettlementSetupInTransaction(t, a)),
      accounts: await listFinancialAccountsInTransaction(t, {
        userId: a.userId,
        workspaceId: a.workspaceId,
        includeArchived: false,
      }),
      chargeSources: await readSettlementChargeSources(t, a),
      categories: await listCategoriesInTransaction(t, {
        userId: a.userId,
        workspaceId: a.workspaceId,
        kind: "expense",
        includeArchived: false,
      }),
    }),
    { readOnlySnapshot: true },
  );
}
async function validate(t: ScopedTransaction, a: Actor, b: SettlementBody) {
  const setup = await getSettlementSetupInTransaction(t, {
    userId: a.userId,
    workspaceId: a.workspaceId,
    debtId: b.debtId,
  });
  const preview = buildSettlementPreview(
    b,
    setup,
    setup.detail.debt.recognizedLiabilityComponents,
  );
  const debt = await resolvePaymentDebt(t, {
    workspaceId: a.workspaceId,
    debtId: b.debtId,
  });
  if (!debt) throw new RangeError("Debt unavailable.");
  const latest = await latestDebtActivityDate(t, {
    workspaceId: a.workspaceId,
    debtId: b.debtId,
  });
  if (
    b.settlementDate < debt.start_date ||
    (debt.opening_cutoff_date &&
      b.settlementDate <= debt.opening_cutoff_date) ||
    (latest && b.settlementDate < latest)
  )
    throw new RangeError(
      "Settlement must follow the opening cutoff and cannot precede recorded debt activity.",
    );
  const account = b.payingAccountId
    ? await resolvePaymentAccount(t, {
        workspaceId: a.workspaceId,
        accountId: b.payingAccountId,
      })
    : null;
  if (
    account &&
    (account.archived ||
      account.currency !== debt.currency ||
      b.settlementDate <= account.opening_cutoff_date)
  )
    throw new RangeError(
      "Choose an active paying account in the debt currency, after its opening cutoff.",
    );
  const balanceAfter = account
    ? BigInt(account.balance) - BigInt(b.actualCashPaidMinor)
    : null;
  if (
    balanceAfter !== null &&
    balanceAfter < 0n &&
    !b.acknowledgeNegativeBalance
  )
    throw new RangeError(
      "Explicitly acknowledge the negative tracked account balance before settlement.",
    );
  const sources = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof readWaiverSource>>>
  >();
  const capacity = new Map<string, bigint>();
  for (const c of b.adjustments) {
    if (settlementAdjustmentTreatment(c) === "recognized_waiver") {
      const key = c.unknownOpening
        ? `opening/${c.liabilityComponent}`
        : c.recognizedSourcePostingId!;
      if (!capacity.has(key)) {
        if (c.unknownOpening)
          capacity.set(
            key,
            await readOpeningWaiverCapacity(t, {
              workspaceId: a.workspaceId,
              debtId: b.debtId,
              component: c.liabilityComponent!,
            }),
          );
        else {
          const source = await readWaiverSource(t, {
            workspaceId: a.workspaceId,
            debtId: b.debtId,
            sourceId: c.recognizedSourcePostingId!,
            component: c.liabilityComponent!,
            date: b.settlementDate,
          });
          if (!source)
            throw new RangeError(
              "The identified recognized charge is unavailable or ineligible for this debt/component.",
            );
          sources.set(key, source);
          capacity.set(key, BigInt(source.amount));
        }
      }
      capacity.set(key, capacity.get(key)! - BigInt(c.amountMinor));
      if (capacity.get(key)! < 0n)
        throw new RangeError(
          "Waivers exceed their recognized source evidence.",
        );
    }
  }
  for (const categoryId of new Set([
    ...b.adjustments.flatMap((c) => (c.categoryId ? [c.categoryId] : [])),
    ...(BigInt(b.externalFeeMinor) > 0n && b.externalFeeCategoryId
      ? [b.externalFeeCategoryId]
      : []),
  ]))
    await ensureActiveExpenseCategory(t, {
      workspaceId: a.workspaceId,
      categoryId,
    });
  return {
    setup,
    preview: settlementPreviewSchema.parse({
      ...preview,
      payingBalanceBeforeMinor: account?.balance ?? null,
      payingBalanceAfterMinor: balanceAfter?.toString() ?? null,
    }),
    debt,
    account,
    balanceAfter,
    sources,
  };
}
export function previewDebtSettlement(input: SettleDebtInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(
    actor,
    async (t) => (await validate(t, actor, body)).preview,
    { readOnlySnapshot: true },
  );
}
export async function previewDebtSettlementInTransaction(
  t: ScopedTransaction,
  input: SettleDebtInput,
) {
  const { actor, body } = normalize(input);
  return (await validate(t, actor, body)).preview;
}
async function execute(t: ScopedTransaction, a: Actor, b: SettlementBody) {
  const workspace = await lockActiveFinancialWorkspace(t, a.workspaceId);
  const { clientCommandId, ...intent } = b;
  const receipt = await claimFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    clientCommandId,
    commandType: "finance.settle_debt",
    payloadHash: hashFinancialCommandPayload(intent),
  });
  if (receipt.kind === "replay")
    return settlementResultSchema.parse(receipt.result);
  const v = await validate(t, a, b);
  if (workspace.currency !== v.debt.currency)
    throw new RangeError("Settlement currency must match the workspace.");
  const expenseLedgerId =
    BigInt(v.preview.newChargesMinor) + BigInt(b.externalFeeMinor) > 0n
      ? await getOrCreateSharedExpenseLedger(t, {
          workspaceId: a.workspaceId,
          currency: workspace.currency,
        })
      : null;
  let adjustmentLedgerId: string | null = null;
  if (b.adjustments.some((c) => c.unknownOpening)) {
    adjustmentLedgerId = await getOrCreateAdjustmentEquityLedger(t, {
      workspaceId: a.workspaceId,
      currency: workspace.currency,
    });
  }
  const ids = await insertSettlement(t, {
    ...a,
    requestId: a.requestId ?? null,
    receiptId: receipt.receiptId,
    currency: workspace.currency,
    liabilityLedgerId: v.debt.liability_ledger_account_id,
    payingLedgerId: v.account?.ledger_account_id ?? null,
    expenseLedgerId,
    adjustmentLedgerId,
    body: b,
    setup: v.setup,
    preview: v.preview,
    waiverSources: v.sources,
  });
  await createPrivateFinancialRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    subjectKind: "financial_action",
    subjectId: ids.actionId,
    subjectVersion: 1,
    operation: "create",
    effectiveDate: b.settlementDate,
    recordedByUserId: a.userId,
    requestId: a.requestId ?? null,
    afterJson: {
      ...intent,
      actionKind: "debt_settlement",
      settlementId: ids.settlementId,
      actionRevisionId: ids.actionRevisionId,
      paymentId: ids.paymentId,
      paymentRevisionId: ids.paymentRevisionId,
      preview: v.preview,
      payingBalanceBeforeMinor: v.account?.balance ?? null,
      payingBalanceAfterMinor: v.balanceAfter?.toString() ?? null,
    },
  });
  if (ids.journalId)
    await finalizeJournal(t, {
      workspaceId: a.workspaceId,
      journalId: ids.journalId,
    });
  await finalizeActionRevision(t, {
    workspaceId: a.workspaceId,
    actionRevisionId: ids.actionRevisionId,
  });
  const debtVersion = await closeSettledDebt(t, {
    workspaceId: a.workspaceId,
    body: b,
    closingScheduleVersionId: ids.closingScheduleVersionId,
  });
  await createPrivateRevision(t, {
    id: randomUUID(),
    workspaceId: a.workspaceId,
    commandReceiptId: receipt.receiptId,
    actorKind: "user",
    reason: b.reason,
    beforeJson: {
      debt: v.setup.detail.debt,
      entries: v.setup.detail.installments,
      pools: v.setup.pools,
    },
    subjectKind: "debt_schedule_version",
    subjectId: ids.closingScheduleVersionId,
    subjectVersion: v.setup.versionNo + 1,
    operation: "create",
    effectiveDate: b.settlementDate,
    recordedByUserId: a.userId,
    requestId: a.requestId ?? null,
    afterJson: {
      previousScheduleVersionId: b.expectedScheduleVersionId,
      settlementId: ids.settlementId,
      closingScheduleVersionId: ids.closingScheduleVersionId,
      revisionKind: "settlement",
      reason: b.reason,
      priorEntries: v.setup.detail.installments,
      preview: v.preview,
      debtVersion,
    },
  });
  const financialRevision = await advanceWorkspaceFinancialRevision(
    t,
    a.workspaceId,
  );
  const result = settlementResultSchema.parse({
    debtId: b.debtId,
    settlementId: ids.settlementId,
    actionId: ids.actionId,
    actionRevisionId: ids.actionRevisionId,
    paymentId: ids.paymentId,
    closingScheduleVersionId: ids.closingScheduleVersionId,
    debtVersion,
    financialRevision,
    lifecycle: b.settlementKind === "early" ? "settled_early" : "settled",
  });
  await completeFinancialCommandReceipt(t, {
    workspaceId: a.workspaceId,
    receiptId: receipt.receiptId,
    result,
  });
  await enforceDeferredFinancialConstraints(t);
  return result;
}
export function settleDebtInTransaction(
  t: ScopedTransaction,
  input: SettleDebtInput,
) {
  const { actor, body } = normalize(input);
  return execute(t, actor, body);
}
export function settleDebt(input: SettleDebtInput) {
  const { actor, body } = normalize(input);
  return withDomainTransaction(actor, (t) => execute(t, actor, body));
}
