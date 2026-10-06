import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { recordIncomeInTransaction } from "@/modules/finance/services/record-income";
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

  const rollbackMarker = new Error("ROLLBACK_RECORD_INCOME_TEST");

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

describe("record income", () => {
  it("records earned income into only the selected receiving account", async () => {
    const user = await createTestUser("SalaryIncome");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const receivingAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "BDO Savings",
            openingCutoffDate: "2026-01-01",
          },
        );

        const untouchedAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "GCash",
            openingCutoffDate: "2026-01-01",
          },
        );

        const categoryId = await findSeededCategoryId(client, user, {
          kind: "income",
          code: "salary",
        });

        const result = await recordIncomeInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),
          requestId: randomUUID(),

          receivingAccountId: receivingAccount.accountId,
          effectiveDate: "2026-01-02",
          amountMinor: "1000000",
          incomeClass: "earned",
          categoryId,

          sourceLabel: "Employer",
          description: "January salary",
        });

        expect(result.financialRevision).toBe("1");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: receivingAccount.ledgerAccountId,
          }),
        ).toBe("1000000");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: untouchedAccount.ledgerAccountId,
          }),
        ).toBe("0");

        const evidence = await client.query<{
          actual_received_minor: string;
          receiving_account_id: string;
          source_label: string | null;
          sender_name: string | null;
          cash_amount_minor: string;
          income_amount_minor: string;
          income_class: string;
          category_id: string | null;
        }>(
          `
            SELECT
              d.actual_received_minor::text
                AS actual_received_minor,
              d.receiving_account_id,
              d.source_label,
              d.sender_name,

              cash.amount_minor::text
                AS cash_amount_minor,

              income.amount_minor::text
                AS income_amount_minor,
              income.income_class,
              income.category_id
            FROM finance."receipt_detail" AS d

            INNER JOIN finance."posting" AS cash
              ON cash.workspace_id =
                d.workspace_id
              AND cash.action_revision_id =
                d.action_revision_id

            INNER JOIN finance."ledger_account"
              AS cash_ledger
              ON cash_ledger.workspace_id =
                cash.workspace_id
              AND cash_ledger.id =
                cash.ledger_account_id
              AND cash_ledger.kind =
                'cash_asset'

            INNER JOIN finance."posting" AS income
              ON income.workspace_id =
                d.workspace_id
              AND income.action_revision_id =
                d.action_revision_id

            INNER JOIN finance."ledger_account"
              AS income_ledger
              ON income_ledger.workspace_id =
                income.workspace_id
              AND income_ledger.id =
                income.ledger_account_id
              AND income_ledger.kind =
                'income'

            WHERE
              d.workspace_id = $1
              AND d.action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(evidence.rows).toEqual([
          {
            actual_received_minor: "1000000",
            receiving_account_id: receivingAccount.accountId,
            source_label: "Employer",
            sender_name: null,
            cash_amount_minor: "1000000",
            income_amount_minor: "-1000000",
            income_class: "earned",
            category_id: categoryId,
          },
        ]);

        const sharedIncomeLedgers = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."ledger_account"
            WHERE
              workspace_id = $1
              AND code =
                'income:shared'
              AND kind = 'income'
          `,
          [user.workspaceId],
        );

        expect(sharedIncomeLedgers.rows[0]?.count).toBe("1");

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
      await removeProvisionedTestUser(user, "pmp-record-income-test-cleanup");
    }
  });

  it("records gift income and replays the same command without duplicating it", async () => {
    const user = await createTestUser("GiftIncome");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await createFinancialAccountFixture(client, user, {
          name: "GCash",
          openingCutoffDate: "2026-02-01",
        });

        const categoryId = await findSeededCategoryId(client, user, {
          kind: "income",
          code: "gift",
        });

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,

          receivingAccountId: account.accountId,
          effectiveDate: "2026-02-02",
          amountMinor: "50000",
          incomeClass: "gift" as const,
          categoryId,

          senderName: "Another Person",
          description: "Birthday gift",
        };

        const first = await recordIncomeInTransaction(transaction, input);

        const replay = await recordIncomeInTransaction(transaction, input);

        expect(replay).toEqual(first);

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

        const giftEvidence = await client.query<{
          income_class: string;
          sender_name: string | null;
        }>(
          `
            SELECT
              p.income_class,
              d.sender_name
            FROM finance."posting" AS p
            INNER JOIN finance."ledger_account" AS l
              ON l.workspace_id =
                p.workspace_id
              AND l.id =
                p.ledger_account_id
            INNER JOIN finance."receipt_detail" AS d
              ON d.workspace_id =
                p.workspace_id
              AND d.action_revision_id =
                p.action_revision_id
            WHERE
              p.workspace_id = $1
              AND p.action_revision_id = $2
              AND l.kind = 'income'
          `,
          [user.workspaceId, first.actionRevisionId],
        );

        expect(giftEvidence.rows).toEqual([
          {
            income_class: "gift",
            sender_name: "Another Person",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-income-test-cleanup");
    }
  });

  it("rejects ordinary income on the account opening cutoff date", async () => {
    const user = await createTestUser("IncomeCutoff");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const account = await createFinancialAccountFixture(client, user, {
          name: "Cutoff Account",
          openingCutoffDate: "2026-03-10",
        });

        await expect(
          recordIncomeInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            receivingAccountId: account.accountId,
            effectiveDate: "2026-03-10",
            amountMinor: "10000",
            incomeClass: "earned",
            description: "Invalid cutoff income",
          }),
        ).rejects.toThrow(/after the receiving account opening cutoff/i);

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
      await removeProvisionedTestUser(user, "pmp-record-income-test-cleanup");
    }
  });
});
