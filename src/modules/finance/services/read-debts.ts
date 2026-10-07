import { z } from "zod";
import {
  debtSummarySchema,
  debtInstallmentReadSchema,
  type DebtListResult,
  type DebtDetailResult,
} from "@/modules/finance/domain/debt";
import {
  readDebts,
  readDebtInstallments,
} from "@/modules/finance/repositories/debt-read-repository";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";

const scope = z.object({ userId: z.uuid(), workspaceId: z.uuid() });
export class DebtUnavailableError extends Error {
  constructor() {
    super("The requested private debt is unavailable.");
    this.name = "DebtUnavailableError";
  }
}
export async function listDebtsInTransaction(
  transaction: ScopedTransaction,
  input: z.infer<typeof scope> & { after?: string | undefined },
): Promise<DebtListResult> {
  const parsed = scope
    .extend({ after: z.uuid().optional() })
    .strict()
    .parse(input);
  const result = await readDebts(transaction, parsed);
  if (!result) throw new DebtUnavailableError();
  const items = z.array(debtSummarySchema).parse(result.items);
  return {
    financialRevision: result.financial_revision,
    items: items.slice(0, 50),
    nextCursor: items.length > 50 ? items[49]!.debtId : null,
  };
}
export async function listDebts(
  input: z.infer<typeof scope> & { after?: string | undefined },
) {
  return withDomainTransaction(scope.parse(input), (t) =>
    listDebtsInTransaction(t, input),
  );
}
export async function getDebtDetailInTransaction(
  transaction: ScopedTransaction,
  input: z.infer<typeof scope> & { debtId: string },
): Promise<DebtDetailResult> {
  const parsed = scope.extend({ debtId: z.uuid() }).strict().parse(input);
  const result = await readDebts(transaction, parsed);
  if (!result) throw new DebtUnavailableError();
  const debt = z.array(debtSummarySchema).parse(result.items)[0];
  if (!debt) throw new DebtUnavailableError();
  const installments = debt.scheduleVersionId
    ? z.array(debtInstallmentReadSchema).parse(
        await readDebtInstallments(transaction, {
          ...parsed,
          scheduleVersionId: debt.scheduleVersionId,
        }),
      )
    : [];
  return { financialRevision: result.financial_revision, debt, installments };
}
export async function getDebtDetail(
  input: z.infer<typeof scope> & { debtId: string },
) {
  return withDomainTransaction(
    scope.parse(input),
    (transaction) => getDebtDetailInTransaction(transaction, input),
    { readOnlySnapshot: true },
  );
}
