import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  importExistingDebt,
  importExistingDebtInTransaction,
} from "@/modules/finance/services/import-existing-debt";
import {
  getDebtDetailInTransaction,
  listDebtsInTransaction,
  DebtUnavailableError,
} from "@/modules/finance/services/read-debts";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { listAgendaItemsInTransaction } from "@/modules/time/services/list-agenda-items";
import { type ScopedTransaction, withDomainTransaction } from "@/platform/db";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

const body = () => ({
  clientCommandId: randomUUID(),
  name: "Existing loan",
  lenderName: "Manual lender",
  debtType: "personal_loan" as const,
  startDate: "2026-01-01",
  openingCutoffDate: "2026-10-06",
  openingLiabilityMinor: "640000",
  openingComponents: [{ kind: "unclassified" as const, amountMinor: "640000" }],
  scheduleReason:
    "Provider liability confirmed; prior payment breakdown unavailable.",
});
async function createUser() {
  const userId = randomUUID();
  await getAuthPool().query(
    'INSERT INTO auth."user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)',
    [userId, "Debt integration", `${userId}@example.test`],
  );
  const workspace = await provisionPersonalWorkspace({
    userId,
    displayName: "Debt integration",
  });
  return { userId, workspaceId: workspace.workspaceId };
}
async function rollbackTest(
  operation: (
    t: ScopedTransaction,
    user: { userId: string; workspaceId: string },
  ) => Promise<void>,
) {
  const user = await createUser();
  const marker = new Error("ROLLBACK_IMPORT_DEBT_TEST");
  try {
    await expect(
      withDomainTransaction(user, async (t) => {
        await operation(t, user);
        throw marker;
      }),
    ).rejects.toBe(marker);
  } finally {
    await removeProvisionedTestUser(user, "pmp-debt-import-test-cleanup");
  }
}
afterAll(closeRuntimeDatabasePools);

describe("existing debt import", () => {
  it("creates an exact opening baseline and empty finalized schedule without cash, income or spending", () =>
    rollbackTest(async (t, user) => {
      const input = { ...user, ...body() };
      const result = await importExistingDebtInTransaction(t, input);
      const detail = await getDebtDetailInTransaction(t, {
        ...user,
        debtId: result.debtId,
      });
      expect(detail.debt).toMatchObject({
        recognizedLiabilityMinor: "640000",
        outstandingPrincipalMinor: null,
        unclassifiedLiabilityMinor: "640000",
        remainingScheduledMinor: null,
        installmentCount: 0,
        breakdownStatus: "unknown",
        version: 1,
      });
      expect(detail.installments).toEqual([]);
      const rows = await t.db.execute<{
        kind: string;
        amount: string;
        cash: string;
        expense: string;
        income: string;
      }>(
        sql`SELECT l.kind,p.amount_minor::text AS amount,p.cash_flow_kind AS cash,p.expense_class AS expense,p.income_class AS income FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id WHERE p.workspace_id=${user.workspaceId}::uuid ORDER BY p.line_no`,
      );
      expect(rows.rows).toEqual([
        {
          kind: "opening_equity",
          amount: "640000",
          cash: "none",
          expense: "none",
          income: "none",
        },
        {
          kind: "debt_liability",
          amount: "-640000",
          cash: "none",
          expense: "none",
          income: "none",
        },
      ]);
      expect(
        await importExistingDebtInTransaction(t, {
          ...input,
          requestId: randomUUID(),
        }),
      ).toEqual(result);
      expect((await listDebtsInTransaction(t, user)).items).toHaveLength(1);
      await expect(
        importExistingDebtInTransaction(t, { ...input, name: "Changed" }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    }));
  it("preserves partially known liability and historical satisfaction separately from scheduled future charges", () =>
    rollbackTest(async (t, user) => {
      const result = await importExistingDebtInTransaction(t, {
        ...user,
        ...body(),
        openingComponents: [
          { kind: "principal", amountMinor: "600000" },
          { kind: "unclassified", amountMinor: "40000" },
        ],
        installments: [
          {
            dueDate: "2026-09-01",
            contractualMinor: "200000",
            openingSatisfiedMinor: "200000",
            notes: "Paid before tracking",
          },
          {
            dueDate: "2026-11-01",
            contractualMinor: "680000",
            openingSatisfiedMinor: "10000",
            knownPrincipalMinor: "600000",
            knownInterestMinor: "80000",
            knownFeeMinor: "0",
            breakdownComplete: true,
          },
        ],
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...user,
        debtId: result.debtId,
      });
      expect(detail.debt).toMatchObject({
        recognizedLiabilityMinor: "640000",
        remainingScheduledMinor: "670000",
        breakdownStatus: "partial",
        outstandingPrincipalMinor: null,
      });
      expect(detail.installments.map((row) => row.remainingMinor)).toEqual([
        "0",
        "670000",
      ]);
      expect(detail.installments[0]?.knownPrincipalMinor).toBeNull();
      const agenda = await listAgendaItemsInTransaction(t, {
        ...user,
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        modules: ["money"],
      });
      expect(agenda.items).toHaveLength(1);
      expect(agenda.items[0]).toMatchObject({
        sourceKind: "debt_installment",
        agendaDate: "2026-11-01",
        displayModule: "money",
      });
      expect(Object.values(agenda.sourceRoutes)).toEqual([
        `/money/debts/${result.debtId}`,
      ]);
      const actions = await t.db.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM finance.financial_action WHERE workspace_id=${user.workspaceId}::uuid`,
      );
      expect(actions.rows[0]?.count).toBe("1");
    }));
  it("keeps confirmed principal exact and does not duplicate sums across multiple installments", () =>
    rollbackTest(async (t, user) => {
      const result = await importExistingDebtInTransaction(t, {
        ...user,
        ...body(),
        openingLiabilityMinor: "100000000000",
        openingComponents: [
          { kind: "principal", amountMinor: "99999999999" },
          { kind: "fee", amountMinor: "1" },
        ],
        installments: [
          { dueDate: "2026-11-01", contractualMinor: "40000000000" },
          { dueDate: "2026-12-01", contractualMinor: "60000000001" },
        ],
      });
      expect(
        (
          await getDebtDetailInTransaction(t, {
            ...user,
            debtId: result.debtId,
          })
        ).debt,
      ).toMatchObject({
        recognizedLiabilityMinor: "100000000000",
        outstandingPrincipalMinor: "99999999999",
        remainingScheduledMinor: "100000000001",
      });
    }));
  it("rejects foreign workspace writes and makes foreign/missing debt reads indistinguishable", async () => {
    const owner = await createUser();
    const other = await createUser();
    try {
      await expect(
        importExistingDebt({
          ...body(),
          userId: other.userId,
          workspaceId: owner.workspaceId,
        }),
      ).rejects.toBeInstanceOf(FinancialWriteWorkspaceUnavailableError);
      await withDomainTransaction(other, async (t) => {
        await expect(
          getDebtDetailInTransaction(t, { ...other, debtId: randomUUID() }),
        ).rejects.toBeInstanceOf(DebtUnavailableError);
        expect((await listDebtsInTransaction(t, other)).items).toEqual([]);
      });
    } finally {
      await removeProvisionedTestUser(owner, "pmp-debt-test-cleanup");
      await removeProvisionedTestUser(other, "pmp-debt-test-cleanup");
    }
  });
  it("rolls back every economic effect and receipt when the enclosing transaction fails", async () => {
    const user = await createUser();
    const marker = new Error("forced failure");
    try {
      await expect(
        withDomainTransaction(user, async (t) => {
          await importExistingDebtInTransaction(t, { ...user, ...body() });
          throw marker;
        }),
      ).rejects.toBe(marker);
      await withDomainTransaction(user, async (t) => {
        expect((await listDebtsInTransaction(t, user)).items).toEqual([]);
        const receipt = await t.db.execute<{ count: string }>(
          sql`SELECT count(*)::text AS count FROM core.command_receipt WHERE workspace_id=${user.workspaceId}::uuid`,
        );
        expect(receipt.rows[0]?.count).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-debt-test-cleanup");
    }
  });
});
