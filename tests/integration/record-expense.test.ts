import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { recordExpenseInTransaction } from "@/modules/finance/services/record-expense";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import {
  findSeededCategoryId,
  removeProvisionedTestUser,
} from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
};

type FinancialAccountFixture = {
  accountId: string;
  ledgerAccountId: string;
};

async function createTestUser(label: string): Promise<TestUser> {
  const userId = randomUUID();
  const name = `${label} User`;

  await getAuthPool().query(
    `
      INSERT INTO auth."user" (
        id,
        name,
        email,
        email_verified
      )
      VALUES ($1, $2, $3, true)
    `,
    [userId, name, `${label.toLowerCase()}-${userId}@example.test`],
  );

  const workspace = await provisionPersonalWorkspace({
    userId,
    displayName: name,
  });

  return {
    userId,
    workspaceId: workspace.workspaceId,
  };
}

async function createFinancialAccountFixture(
  client: PoolClient,
  user: TestUser,
  input: {
    name: string;
    openingCutoffDate: string;
  },
): Promise<FinancialAccountFixture> {
  const accountId = randomUUID();
  const ledgerAccountId = randomUUID();

  await client.query(
    `
      INSERT INTO finance."ledger_account" (
        id,
        workspace_id,
        code,
        name,
        kind,
        currency
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'cash_asset',
        'PHP'
      )
    `,
    [ledgerAccountId, user.workspaceId, `test-cash:${accountId}`, input.name],
  );

  await client.query(
    `
      INSERT INTO finance."financial_account" (
        id,
        workspace_id,
        ledger_account_id,
        name,
        account_type,
        currency,
        opening_cutoff_date
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'checking',
        'PHP',
        $5
      )
    `,
    [
      accountId,
      user.workspaceId,
      ledgerAccountId,
      input.name,
      input.openingCutoffDate,
    ],
  );

  return {
    accountId,
    ledgerAccountId,
  };
}

async function createExpenseCategory(
  client: PoolClient,
  user: TestUser,
  name: string,
): Promise<string> {
  const categoryId = randomUUID();

  await client.query(
    `
      INSERT INTO core."category" (
        id,
        workspace_id,
        kind,
        name
      )
      VALUES (
        $1,
        $2,
        'expense',
        $3
      )
    `,
    [categoryId, user.workspaceId, name],
  );

  return categoryId;
}

async function getCashLedgerBalance(
  client: PoolClient,
  input: {
    workspaceId: string;
    ledgerAccountId: string;
  },
): Promise<string> {
  const result = await client.query<{
    balance_minor: string;
  }>(
    `
      SELECT
        COALESCE(
          sum(amount_minor),
          0
        )::text AS balance_minor
      FROM finance."posting"
      WHERE
        workspace_id = $1
        AND ledger_account_id = $2
    `,
    [input.workspaceId, input.ledgerAccountId],
  );

  return result.rows[0]?.balance_minor ?? "0";
}

async function runFinancialTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_RECORD_EXPENSE_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error("Expected the financial test transaction to roll back.");
    } catch (error) {
      if (error !== rollbackMarker) {
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("record expense", () => {
  it("records one cash deduction with category portions that sum to the purchase", async () => {
    const user = await createTestUser("SplitExpense");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const fundingAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "GCash",
            openingCutoffDate: "2026-04-01",
          },
        );

        const groceriesCategoryId = await createExpenseCategory(
          client,
          user,
          "Groceries",
        );

        const householdCategoryId = await createExpenseCategory(
          client,
          user,
          "Household",
        );

        const result = await recordExpenseInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),
          acknowledgeNegativeBalance: true,
          requestId: randomUUID(),

          fundingAccountId: fundingAccount.accountId,
          effectiveDate: "2026-04-02",
          purchaseMinor: "100000",

          splits: [
            {
              amountMinor: "70000",
              categoryId: groceriesCategoryId,
              memo: "Groceries",
            },
            {
              amountMinor: "30000",
              categoryId: householdCategoryId,
              memo: "Household supplies",
            },
          ],

          merchantName: "Integration Store",
          description: "Split household purchase",
        });

        expect(result.financialRevision).toBe("1");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: fundingAccount.ledgerAccountId,
          }),
        ).toBe("-100000");

        const resultRows = await client.query<{
          purchase_minor: string;
          merchant_name: string | null;
          funding_count: string;
          funding_total: string;
          expense_count: string;
          expense_total: string;
          category_count: string;
        }>(
          `
            SELECT
              d.purchase_minor::text
                AS purchase_minor,
              d.merchant_name,

              (
                SELECT count(*)::text
                FROM finance."posting" AS p
                WHERE
                  p.workspace_id =
                    d.workspace_id
                  AND p.action_revision_id =
                    d.action_revision_id
                  AND p.cash_flow_kind =
                    'purchase'
                  AND p.cash_flow_direction =
                    'out'
              ) AS funding_count,

              (
                SELECT
                  COALESCE(
                    sum(
                      -(p.amount_minor)
                    ),
                    0
                  )::text
                FROM finance."posting" AS p
                WHERE
                  p.workspace_id =
                    d.workspace_id
                  AND p.action_revision_id =
                    d.action_revision_id
                  AND p.cash_flow_kind =
                    'purchase'
                  AND p.cash_flow_direction =
                    'out'
              ) AS funding_total,

              (
                SELECT count(*)::text
                FROM finance."posting" AS p
                INNER JOIN finance."ledger_account" AS l
                  ON l.workspace_id =
                    p.workspace_id
                  AND l.id =
                    p.ledger_account_id
                WHERE
                  p.workspace_id =
                    d.workspace_id
                  AND p.action_revision_id =
                    d.action_revision_id
                  AND l.kind =
                    'expense'
                  AND p.expense_class =
                    'gross'
              ) AS expense_count,

              (
                SELECT
                  COALESCE(
                    sum(p.amount_minor),
                    0
                  )::text
                FROM finance."posting" AS p
                INNER JOIN finance."ledger_account" AS l
                  ON l.workspace_id =
                    p.workspace_id
                  AND l.id =
                    p.ledger_account_id
                WHERE
                  p.workspace_id =
                    d.workspace_id
                  AND p.action_revision_id =
                    d.action_revision_id
                  AND l.kind =
                    'expense'
                  AND p.expense_class =
                    'gross'
              ) AS expense_total,

              (
                SELECT count(
                  p.category_id
                )::text
                FROM finance."posting" AS p
                INNER JOIN finance."ledger_account" AS l
                  ON l.workspace_id =
                    p.workspace_id
                  AND l.id =
                    p.ledger_account_id
                WHERE
                  p.workspace_id =
                    d.workspace_id
                  AND p.action_revision_id =
                    d.action_revision_id
                  AND l.kind =
                    'expense'
                  AND p.expense_class =
                    'gross'
              ) AS category_count

            FROM finance."purchase_detail" AS d
            WHERE
              d.workspace_id = $1
              AND d.action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(resultRows.rows).toEqual([
          {
            purchase_minor: "100000",
            merchant_name: "Integration Store",
            funding_count: "1",
            funding_total: "100000",
            expense_count: "2",
            expense_total: "100000",
            category_count: "2",
          },
        ]);

        const portions = await client.query<{
          amount_minor: string;
          category_id: string | null;
        }>(
          `
            SELECT
              p.amount_minor::text
                AS amount_minor,
              p.category_id
            FROM finance."posting" AS p
            INNER JOIN finance."ledger_account" AS l
              ON l.workspace_id =
                p.workspace_id
              AND l.id =
                p.ledger_account_id
            WHERE
              p.workspace_id = $1
              AND p.action_revision_id = $2
              AND l.kind =
                'expense'
            ORDER BY p.line_no
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(portions.rows).toEqual([
          {
            amount_minor: "70000",
            category_id: groceriesCategoryId,
          },
          {
            amount_minor: "30000",
            category_id: householdCategoryId,
          },
        ]);

        const audit = await client.query<{
          subject_id: string;
          operation: string;
        }>(
          `
            SELECT
              subject_id,
              operation
            FROM audit."private_revision"
            WHERE
              workspace_id = $1
              AND subject_kind =
                'financial_action'
              AND subject_id = $2
          `,
          [user.workspaceId, result.actionId],
        );

        expect(audit.rows).toEqual([
          {
            subject_id: result.actionId,
            operation: "create",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-expense-test-cleanup");
    }
  });

  it("replays the same expense command without a second deduction", async () => {
    const user = await createTestUser("ExpenseReplay");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const fundingAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "Replay Wallet",
            openingCutoffDate: "2026-05-01",
          },
        );

        const categoryId = await findSeededCategoryId(client, user, {
          kind: "expense",
          code: "food",
        });

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,
          acknowledgeNegativeBalance: true,

          fundingAccountId: fundingAccount.accountId,
          effectiveDate: "2026-05-02",
          purchaseMinor: "25000",

          splits: [
            {
              amountMinor: "25000",
              categoryId,
            },
          ],

          merchantName: "Replay Merchant",
          description: "Replay purchase",
        };

        const first = await recordExpenseInTransaction(transaction, input);

        const replay = await recordExpenseInTransaction(transaction, input);

        expect(replay).toEqual(first);

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: fundingAccount.ledgerAccountId,
          }),
        ).toBe("-25000");

        const actionCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."financial_action" AS a
            INNER JOIN core."command_receipt" AS r
              ON r.workspace_id =
                a.workspace_id
              AND r.id =
                a.original_command_receipt_id
            WHERE
              a.workspace_id = $1
              AND r.client_command_id = $2
          `,
          [user.workspaceId, clientCommandId],
        );

        expect(actionCount.rows[0]?.count).toBe("1");

        const workspace = await client.query<{
          financial_revision: string;
        }>(
          `
            SELECT
              financial_revision::text
                AS financial_revision
            FROM core."workspace"
            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(workspace.rows[0]?.financial_revision).toBe("1");

        const sharedExpenseLedger = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."ledger_account"
            WHERE
              workspace_id = $1
              AND code =
                'expense:shared'
              AND kind =
                'expense'
          `,
          [user.workspaceId],
        );

        expect(sharedExpenseLedger.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-expense-test-cleanup");
    }
  });

  it("rejects an expense on the funding account opening cutoff date", async () => {
    const user = await createTestUser("ExpenseCutoff");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const fundingAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "Cutoff Wallet",
            openingCutoffDate: "2026-06-10",
          },
        );

        await expect(
          recordExpenseInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),
            acknowledgeNegativeBalance: true,

            fundingAccountId: fundingAccount.accountId,
            effectiveDate: "2026-06-10",
            purchaseMinor: "10000",

            splits: [
              {
                amountMinor: "10000",
              },
            ],

            description: "Invalid cutoff purchase",
          }),
        ).rejects.toThrow(/after the funding account opening cutoff/i);

        const actionCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."financial_action"
            WHERE workspace_id = $1
          `,
          [user.workspaceId],
        );

        expect(actionCount.rows[0]?.count).toBe("0");

        const workspace = await client.query<{
          financial_revision: string;
        }>(
          `
            SELECT
              financial_revision::text
                AS financial_revision
            FROM core."workspace"
            WHERE id = $1
          `,
          [user.workspaceId],
        );

        expect(workspace.rows[0]?.financial_revision).toBe("0");
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-expense-test-cleanup");
    }
  });
});
