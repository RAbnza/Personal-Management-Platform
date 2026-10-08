import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getAccountHistoryInTransaction } from "@/modules/finance/services/get-account-history";
import { recordTransferInTransaction } from "@/modules/finance/services/record-transfer";
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

  const rollbackMarker = new Error("ROLLBACK_RECORD_TRANSFER_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error("Expected the transfer test transaction to roll back.");
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

describe("record transfer", () => {
  it("records a completed transfer with a withheld fee without treating principal as spending", async () => {
    const user = await createTestUser("WithheldTransfer");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const source = await createFinancialAccountFixture(client, user, {
          name: "GCash",
          openingCutoffDate: "2026-09-01",
        });

        const destination = await createFinancialAccountFixture(client, user, {
          name: "MariBank",
          openingCutoffDate: "2026-09-01",
        });

        const feeCategoryId = await findSeededCategoryId(client, user, {
          kind: "expense",
          code: "transaction_fees",
        });

        const result = await recordTransferInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),
          acknowledgeNegativeBalance: true,

          sourceAccountId: source.accountId,
          destinationAccountId: destination.accountId,

          effectiveDate: "2026-09-02",
          destinationPrincipalMinor: "500000",

          fees: [
            {
              label: "Transfer fee",
              amountMinor: "1500",
              treatment: "withheld",
              categoryId: feeCategoryId,
            },
          ],

          description: "Transfer to MariBank",
        });

        expect(result.financialRevision).toBe("1");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: source.ledgerAccountId,
          }),
        ).toBe("-501500");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: destination.ledgerAccountId,
          }),
        ).toBe("500000");

        const detail = await client.query<{
          source_principal_minor: string;
          destination_principal_minor: string;
          withheld_fee_minor: string;
        }>(
          `
            SELECT
              source_principal_minor::text,
              destination_principal_minor::text,
              withheld_fee_minor::text
            FROM finance."transfer_detail"
            WHERE
              workspace_id = $1
              AND action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(detail.rows).toEqual([
          {
            source_principal_minor: "501500",
            destination_principal_minor: "500000",
            withheld_fee_minor: "1500",
          },
        ]);

        const feeEvidence = await client.query<{
          label: string;
          amount_minor: string;
          treatment: string;
          expense_amount_minor: string;
          category_id: string | null;
        }>(
          `
            SELECT
              f.label,
              f.amount_minor::text
                AS amount_minor,
              f.treatment,
              p.amount_minor::text
                AS expense_amount_minor,
              p.category_id
            FROM finance."fee_component" AS f
            INNER JOIN finance."posting" AS p
              ON p.workspace_id =
                f.workspace_id
              AND p.action_revision_id =
                f.action_revision_id
              AND p.id =
                f.expense_posting_id
            WHERE
              f.workspace_id = $1
              AND f.action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(feeEvidence.rows).toEqual([
          {
            label: "Transfer fee",
            amount_minor: "1500",
            treatment: "withheld",
            expense_amount_minor: "1500",
            category_id: feeCategoryId,
          },
        ]);

        const totals = await client.query<{
          internal_total: string;
          fee_outflow: string;
          expense_total: string;
        }>(
          `
            SELECT
              COALESCE(
                sum(
                  p.amount_minor
                ) FILTER (
                  WHERE
                    p.cash_flow_kind =
                      'transfer'
                    AND p.cash_flow_direction =
                      'internal'
                ),
                0
              )::text
                AS internal_total,

              COALESCE(
                sum(
                  -(p.amount_minor)
                ) FILTER (
                  WHERE
                    p.cash_flow_kind =
                      'fee'
                    AND p.cash_flow_direction =
                      'out'
                ),
                0
              )::text
                AS fee_outflow,

              COALESCE(
                sum(
                  p.amount_minor
                ) FILTER (
                  WHERE
                    l.kind =
                      'expense'
                ),
                0
              )::text
                AS expense_total

            FROM finance."posting" AS p
            INNER JOIN finance."ledger_account" AS l
              ON l.workspace_id =
                p.workspace_id
              AND l.id =
                p.ledger_account_id
            WHERE
              p.workspace_id = $1
              AND p.action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(totals.rows).toEqual([
          {
            internal_total: "0",
            fee_outflow: "1500",
            expense_total: "1500",
          },
        ]);

        const sourceHistory = await getAccountHistoryInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            accountId: source.accountId,
          },
        );

        expect(sourceHistory.account.currentBalanceMinor).toBe("-501500");

        expect(sourceHistory.entries).toHaveLength(1);

        expect(sourceHistory.entries[0]).toMatchObject({
          actionId: result.actionId,
          actionKind: "transfer",
          effectiveDate: "2026-09-02",
          signedAmountMinor: "-501500",
          balanceAfterMinor: "-501500",
        });

        const destinationHistory = await getAccountHistoryInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            accountId: destination.accountId,
          },
        );

        expect(destinationHistory.account.currentBalanceMinor).toBe("500000");

        expect(destinationHistory.entries[0]).toMatchObject({
          actionId: result.actionId,
          actionKind: "transfer",
          signedAmountMinor: "500000",
          balanceAfterMinor: "500000",
        });
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-transfer-test-cleanup");
    }
  });

  it("replays a fee-free transfer without moving the principal twice", async () => {
    const user = await createTestUser("TransferReplay");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const source = await createFinancialAccountFixture(client, user, {
          name: "Source Wallet",
          openingCutoffDate: "2026-09-10",
        });

        const destination = await createFinancialAccountFixture(client, user, {
          name: "Destination Wallet",
          openingCutoffDate: "2026-09-10",
        });

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,
          acknowledgeNegativeBalance: true,

          sourceAccountId: source.accountId,
          destinationAccountId: destination.accountId,

          effectiveDate: "2026-09-11",
          destinationPrincipalMinor: "25000",

          description: "Fee-free transfer",
        };

        const first = await recordTransferInTransaction(transaction, input);

        const replay = await recordTransferInTransaction(transaction, input);

        expect(replay).toEqual(first);

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: source.ledgerAccountId,
          }),
        ).toBe("-25000");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: destination.ledgerAccountId,
          }),
        ).toBe("25000");

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

        const feeCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."fee_component"
            WHERE
              workspace_id = $1
              AND action_revision_id = $2
          `,
          [user.workspaceId, first.actionRevisionId],
        );

        expect(feeCount.rows[0]?.count).toBe("0");

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
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-transfer-test-cleanup");
    }
  });

  it("supports multiple additional and separately paid fee components without inflating transfer principal", async () => {
    const user = await createTestUser("MultipleTransferFees");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const source = await createFinancialAccountFixture(client, user, {
          name: "Source Bank",
          openingCutoffDate: "2026-09-20",
        });

        const destination = await createFinancialAccountFixture(client, user, {
          name: "Destination Bank",
          openingCutoffDate: "2026-09-20",
        });

        const separateFeeAccount = await createFinancialAccountFixture(
          client,
          user,
          {
            name: "Fee Wallet",
            openingCutoffDate: "2026-09-20",
          },
        );

        const feeCategoryId = await findSeededCategoryId(client, user, {
          kind: "expense",
          code: "transaction_fees",
        });

        const result = await recordTransferInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),
          acknowledgeNegativeBalance: true,

          sourceAccountId: source.accountId,
          destinationAccountId: destination.accountId,

          effectiveDate: "2026-09-21",
          destinationPrincipalMinor: "100000",

          fees: [
            {
              label: "Source processing fee",
              amountMinor: "500",
              treatment: "source_additional",
              categoryId: feeCategoryId,
            },
            {
              label: "Separate service fee",
              amountMinor: "700",
              effectiveDate: "2026-09-22",
              bearingAccountId: separateFeeAccount.accountId,
              treatment: "separate",
              categoryId: feeCategoryId,
            },
          ],

          description: "Transfer with multiple fees",
        });

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: source.ledgerAccountId,
          }),
        ).toBe("-100500");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: destination.ledgerAccountId,
          }),
        ).toBe("100000");

        expect(
          await getCashLedgerBalance(client, {
            workspaceId: user.workspaceId,
            ledgerAccountId: separateFeeAccount.ledgerAccountId,
          }),
        ).toBe("-700");

        const detail = await client.query<{
          source_principal_minor: string;
          destination_principal_minor: string;
          withheld_fee_minor: string;
        }>(
          `
            SELECT
              source_principal_minor::text,
              destination_principal_minor::text,
              withheld_fee_minor::text
            FROM finance."transfer_detail"
            WHERE
              workspace_id = $1
              AND action_revision_id = $2
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(detail.rows).toEqual([
          {
            source_principal_minor: "100000",
            destination_principal_minor: "100000",
            withheld_fee_minor: "0",
          },
        ]);

        const fees = await client.query<{
          label: string;
          amount_minor: string;
          effective_date: string;
          treatment: string;
          bearing_ledger_account_id: string;
        }>(
          `
            SELECT
              label,
              amount_minor::text
                AS amount_minor,
              effective_date::text
                AS effective_date,
              treatment,
              bearing_ledger_account_id
            FROM finance."fee_component"
            WHERE
              workspace_id = $1
              AND action_revision_id = $2
            ORDER BY
              effective_date,
              amount_minor
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(fees.rows).toEqual([
          {
            label: "Source processing fee",
            amount_minor: "500",
            effective_date: "2026-09-21",
            treatment: "source_additional",
            bearing_ledger_account_id: source.ledgerAccountId,
          },
          {
            label: "Separate service fee",
            amount_minor: "700",
            effective_date: "2026-09-22",
            treatment: "separate",
            bearing_ledger_account_id: separateFeeAccount.ledgerAccountId,
          },
        ]);

        const journalCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text
              AS count
            FROM finance."journal"
            WHERE
              workspace_id = $1
              AND action_revision_id = $2
              AND role = 'economic'
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(journalCount.rows[0]?.count).toBe("2");

        const expenseTotal = await client.query<{
          amount_minor: string;
        }>(
          `
            SELECT
              COALESCE(
                sum(p.amount_minor),
                0
              )::text AS amount_minor
            FROM finance."posting" AS p
            INNER JOIN finance."ledger_account" AS l
              ON l.workspace_id =
                p.workspace_id
              AND l.id =
                p.ledger_account_id
            WHERE
              p.workspace_id = $1
              AND p.action_revision_id = $2
              AND l.kind = 'expense'
          `,
          [user.workspaceId, result.actionRevisionId],
        );

        expect(expenseTotal.rows[0]?.amount_minor).toBe("1200");

        expect(result.financialRevision).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-record-transfer-test-cleanup");
    }
  });
});
