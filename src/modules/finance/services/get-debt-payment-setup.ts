import { z } from "zod";
import { listCategoriesInTransaction } from "@/modules/core/services/list-categories";
import { listFinancialAccountsInTransaction } from "@/modules/finance/services/list-financial-accounts";
import { getDebtDetailInTransaction } from "@/modules/finance/services/read-debts";
import { withDomainTransaction } from "@/platform/db";

/** The form's debt, residuals and account balances share one reviewed snapshot. */
export async function getDebtPaymentSetup(input: {
  userId: string;
  workspaceId: string;
  debtId: string;
}) {
  const parsed = z
    .object({ userId: z.uuid(), workspaceId: z.uuid(), debtId: z.uuid() })
    .strict()
    .parse(input);
  return withDomainTransaction(
    { userId: parsed.userId, workspaceId: parsed.workspaceId },
    async (transaction) => ({
      detail: await getDebtDetailInTransaction(transaction, parsed),
      accounts: await listFinancialAccountsInTransaction(transaction, {
        userId: parsed.userId,
        workspaceId: parsed.workspaceId,
        includeArchived: false,
      }),
      categories: await listCategoriesInTransaction(transaction, {
        userId: parsed.userId,
        workspaceId: parsed.workspaceId,
        kind: "expense",
        includeArchived: false,
      }),
    }),
    { readOnlySnapshot: true },
  );
}
