import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  openFinancialAccount,
  openFinancialAccountInTransaction,
} from "@/modules/finance/services/open-financial-account";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";

const TEST_DATABASE_NAME = "personal_management_test";

type TestUser = {
  userId: string;
  workspaceId: string;
};

function getTestAdministratorConnectionString() {
  const connectionString = process.env.TEST_DATABASE_ADMIN_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_ADMIN_URL is required for open-financial-account integration tests.",
    );
  }

  const url = new URL(connectionString);

  url.pathname = `/${TEST_DATABASE_NAME}`;

  return url.toString();
}

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

async function removeTestUser(user: TestUser): Promise<void> {
  const administrator = new Client({
    connectionString: getTestAdministratorConnectionString(),
    application_name: "pmp-open-financial-account-test-cleanup",
  });

  try {
    await administrator.connect();
    await administrator.query("BEGIN");

    try {
      await administrator.query(
        `
          DELETE FROM core."workspace_preference"
          WHERE workspace_id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."workspace"
          WHERE id = $1
        `,
        [user.workspaceId],
      );

      await administrator.query(
        `
          DELETE FROM core."user_profile"
          WHERE user_id = $1
        `,
        [user.userId],
      );

      await administrator.query("COMMIT");
    } catch (error) {
      await administrator.query("ROLLBACK");

      throw error;
    }
  } finally {
    await administrator.end();
  }

  await getAuthPool().query(
    `
      DELETE FROM auth."user"
      WHERE id = $1
    `,
    [user.userId],
  );
}

async function runFinancialTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_OPEN_ACCOUNT_TEST");

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

describe("open financial account", () => {
  it("creates a zero-opening account without inventing an opening posting", async () => {
    const user = await createTestUser("ZeroOpening");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const result = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,
          name: "Cash Wallet",
          accountType: "cash",
          openingCutoffDate: "2026-10-06",
          openingBalanceMinor: "0",
        });

        expect(result).toMatchObject({
          openingActionId: null,
          financialRevision: "1",
        });

        const account = await client.query<{
          id: string;
          ledger_account_id: string;
          opening_action_id: string | null;
          version: number;
        }>(
          `
                SELECT
                  id,
                  ledger_account_id,
                  opening_action_id,
                  version
                FROM finance."financial_account"
                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, result.accountId],
        );

        expect(account.rows).toEqual([
          {
            id: result.accountId,
            ledger_account_id: result.ledgerAccountId,
            opening_action_id: null,
            version: 1,
          },
        ]);

        const ledgers = await client.query<{
          kind: string;
        }>(
          `
                SELECT kind
                FROM finance."ledger_account"
                WHERE workspace_id = $1
                ORDER BY kind
              `,
          [user.workspaceId],
        );

        expect(ledgers.rows).toEqual([
          {
            kind: "cash_asset",
          },
        ]);

        const actions = await client.query<{
          count: string;
        }>(
          `
                SELECT count(*)::text AS count
                FROM finance."financial_action"
                WHERE workspace_id = $1
              `,
          [user.workspaceId],
        );

        expect(actions.rows[0]?.count).toBe("0");

        const audits = await client.query<{
          subject_kind: string;
          subject_id: string;
        }>(
          `
                SELECT
                  subject_kind,
                  subject_id
                FROM audit."private_revision"
                WHERE workspace_id = $1
                ORDER BY subject_kind
              `,
          [user.workspaceId],
        );

        expect(audits.rows).toEqual([
          {
            subject_kind: "financial_account",
            subject_id: result.accountId,
          },
        ]);

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

        const receipt = await client.query<{
          state: string;
          result_json: Record<string, unknown>;
        }>(
          `
                SELECT
                  state,
                  result_json
                FROM core."command_receipt"
                WHERE
                  workspace_id = $1
                  AND client_command_id = $2
              `,
          [user.workspaceId, clientCommandId],
        );

        expect(receipt.rows[0]).toEqual({
          state: "completed",
          result_json: result,
        });
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("creates a balanced opening-cash baseline without classifying it as income", async () => {
    const user = await createTestUser("PositiveOpening");

    try {
      await runFinancialTestAndRollback(user, async (transaction, client) => {
        const result = await openFinancialAccountInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),
          requestId: randomUUID(),
          name: "BDO Savings",
          accountType: "savings",
          institutionName: "BDO",
          openingCutoffDate: "2026-10-06",
          openingBalanceMinor: "200000",
          notes: "Existing balance at setup.",
        });

        expect(result.openingActionId).not.toBeNull();

        expect(result.financialRevision).toBe("1");

        const account = await client.query<{
          opening_action_id: string | null;
          version: number;
        }>(
          `
                SELECT
                  opening_action_id,
                  version
                FROM finance."financial_account"
                WHERE
                  workspace_id = $1
                  AND id = $2
              `,
          [user.workspaceId, result.accountId],
        );

        expect(account.rows[0]).toEqual({
          opening_action_id: result.openingActionId,
          version: 1,
        });

        const revision = await client.query<{
          action_kind: string;
          state: string;
          primary_effective_date: string;
        }>(
          `
                SELECT
                  r.action_kind,
                  r.state,
                  r.primary_effective_date::text
                    AS primary_effective_date
                FROM finance."financial_action" AS a
                INNER JOIN finance."action_revision" AS r
                  ON r.workspace_id = a.workspace_id
                  AND r.action_id = a.id
                  AND r.id = a.current_revision_id
                WHERE
                  a.workspace_id = $1
                  AND a.id = $2
              `,
          [user.workspaceId, result.openingActionId],
        );

        expect(revision.rows).toEqual([
          {
            action_kind: "opening_cash",
            state: "posted",
            primary_effective_date: "2026-10-06",
          },
        ]);

        const postings = await client.query<{
          kind: string;
          amount_minor: string;
          cash_flow_kind: string;
          cash_flow_direction: string;
        }>(
          `
                SELECT
                  l.kind,
                  p.amount_minor::text
                    AS amount_minor,
                  p.cash_flow_kind,
                  p.cash_flow_direction
                FROM finance."posting" AS p
                INNER JOIN finance."ledger_account" AS l
                  ON l.workspace_id = p.workspace_id
                  AND l.id = p.ledger_account_id
                WHERE
                  p.workspace_id = $1
                  AND p.action_id = $2
                ORDER BY p.line_no
              `,
          [user.workspaceId, result.openingActionId],
        );

        expect(postings.rows).toEqual([
          {
            kind: "cash_asset",
            amount_minor: "200000",
            cash_flow_kind: "opening",
            cash_flow_direction: "baseline",
          },
          {
            kind: "opening_equity",
            amount_minor: "-200000",
            cash_flow_kind: "none",
            cash_flow_direction: "none",
          },
        ]);

        const incomePostingCount = await client.query<{
          count: string;
        }>(
          `
                SELECT
                  count(*)::text AS count
                FROM finance."posting" AS p
                INNER JOIN finance."ledger_account" AS l
                  ON l.workspace_id = p.workspace_id
                  AND l.id = p.ledger_account_id
                WHERE
                  p.workspace_id = $1
                  AND p.action_id = $2
                  AND l.kind = 'income'
              `,
          [user.workspaceId, result.openingActionId],
        );

        expect(incomePostingCount.rows[0]?.count).toBe("0");

        const audits = await client.query<{
          subject_kind: string;
          subject_id: string;
        }>(
          `
                SELECT
                  subject_kind,
                  subject_id
                FROM audit."private_revision"
                WHERE workspace_id = $1
                ORDER BY subject_kind
              `,
          [user.workspaceId],
        );

        expect(audits.rows).toEqual([
          {
            subject_kind: "financial_account",
            subject_id: result.accountId,
          },
          {
            subject_kind: "financial_action",
            subject_id: result.openingActionId,
          },
        ]);

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
      await removeTestUser(user);
    }
  });

  it("cannot create an account inside another user's workspace", async () => {
    const first = await createTestUser("IsolationFirst");

    const second = await createTestUser("IsolationSecond");

    try {
      await expect(
        openFinancialAccount({
          userId: first.userId,
          workspaceId: second.workspaceId,
          clientCommandId: randomUUID(),
          name: "Forbidden Account",
          accountType: "cash",
          openingCutoffDate: "2026-10-06",
          openingBalanceMinor: "0",
        }),
      ).rejects.toMatchObject({
        cause: {
          code: "42501",
        },
      });
    } finally {
      await removeTestUser(first);
      await removeTestUser(second);
    }
  });
});
