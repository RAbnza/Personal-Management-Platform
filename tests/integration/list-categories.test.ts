import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  CategoryWorkspaceUnavailableError,
  listCategoriesInTransaction,
} from "@/modules/core/services/list-categories";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import type { ScopedTransaction } from "@/platform/db";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
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

async function runCoreTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_LIST_CATEGORIES_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the category-list integration test transaction to roll back.",
      );
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

describe("list categories", () => {
  it("returns all provisioned active categories in deterministic order", async () => {
    const user = await createTestUser("CategoryListDefaults");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const result = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(
          result.items.map((category) => ({
            kind: category.kind,
            code: category.code,
            name: category.name,
            sortOrder: category.sortOrder,
            archived: category.archived,
          })),
        ).toEqual([
          {
            kind: "income",
            code: "salary",
            name: "Salary",
            sortOrder: 10,
            archived: false,
          },
          {
            kind: "income",
            code: "gift",
            name: "Gift",
            sortOrder: 20,
            archived: false,
          },
          {
            kind: "expense",
            code: "food",
            name: "Food",
            sortOrder: 10,
            archived: false,
          },
          {
            kind: "expense",
            code: "transport",
            name: "Transport",
            sortOrder: 20,
            archived: false,
          },
          {
            kind: "expense",
            code: "housing",
            name: "Housing",
            sortOrder: 30,
            archived: false,
          },
          {
            kind: "expense",
            code: "utilities",
            name: "Utilities",
            sortOrder: 40,
            archived: false,
          },
          {
            kind: "expense",
            code: "subscriptions",
            name: "Subscriptions",
            sortOrder: 50,
            archived: false,
          },
          {
            kind: "expense",
            code: "shopping",
            name: "Shopping",
            sortOrder: 60,
            archived: false,
          },
          {
            kind: "expense",
            code: "healthcare",
            name: "Healthcare",
            sortOrder: 70,
            archived: false,
          },
          {
            kind: "expense",
            code: "education",
            name: "Education",
            sortOrder: 80,
            archived: false,
          },
          {
            kind: "expense",
            code: "entertainment",
            name: "Entertainment",
            sortOrder: 90,
            archived: false,
          },
          {
            kind: "expense",
            code: "interest",
            name: "Interest",
            sortOrder: 100,
            archived: false,
          },
          {
            kind: "expense",
            code: "transaction_fees",
            name: "Transaction Fees",
            sortOrder: 110,
            archived: false,
          },
          {
            kind: "expense",
            code: "other",
            name: "Other",
            sortOrder: 120,
            archived: false,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-list-categories-test-cleanup");
    }
  });

  it("filters categories by income or expense kind", async () => {
    const user = await createTestUser("CategoryListKind");

    try {
      await runCoreTestAndRollback(user, async (transaction) => {
        const income = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          kind: "income",
        });

        expect(income.items.map((category) => category.code)).toEqual([
          "salary",
          "gift",
        ]);

        expect(
          income.items.every((category) => category.kind === "income"),
        ).toBe(true);

        const expense = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          kind: "expense",
        });

        expect(expense.items).toHaveLength(12);

        expect(
          expense.items.every((category) => category.kind === "expense"),
        ).toBe(true);
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-list-categories-test-cleanup");
    }
  });

  it("excludes archived categories by default and can include them for management views", async () => {
    const user = await createTestUser("CategoryListArchived");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const food = await client.query<{
          id: string;
        }>(
          `
                SELECT id

                FROM core."category"

                WHERE
                  workspace_id = $1
                  AND kind = 'expense'
                  AND code = 'food'
              `,
          [user.workspaceId],
        );

        const foodId = food.rows[0]?.id;

        if (!foodId) {
          throw new Error("Seeded food category was not found.");
        }

        await client.query(
          `
              UPDATE core."category"

              SET archived_at =
                clock_timestamp()

              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, foodId],
        );

        const activeOnly = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          kind: "expense",
        });

        expect(
          activeOnly.items.some((category) => category.categoryId === foodId),
        ).toBe(false);

        const withArchived = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          kind: "expense",

          includeArchived: true,
        });

        const archivedFood = withArchived.items.find(
          (category) => category.categoryId === foodId,
        );

        expect(archivedFood).toMatchObject({
          categoryId: foodId,

          kind: "expense",

          code: "food",

          name: "Food",

          archived: true,

          archivedAt: expect.any(String),

          sortOrder: 10,

          version: 2,
        });
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-list-categories-test-cleanup");
    }
  });

  it("orders user-created categories by sort order and name after applying the kind filter", async () => {
    const user = await createTestUser("CategoryListCustom");

    try {
      await runCoreTestAndRollback(user, async (transaction, client) => {
        const alphaId = randomUUID();

        const betaId = randomUUID();

        await client.query(
          `
              INSERT INTO core."category" (
                id,
                workspace_id,
                kind,
                name,
                sort_order
              )
              VALUES
                (
                  $1,
                  $2,
                  'income',
                  'Bonus',
                  15
                ),
                (
                  $3,
                  $2,
                  'income',
                  'Allowance',
                  15
                )
            `,
          [betaId, user.workspaceId, alphaId],
        );

        const result = await listCategoriesInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          kind: "income",
        });

        expect(
          result.items.map((category) => ({
            name: category.name,
            sortOrder: category.sortOrder,
          })),
        ).toEqual([
          {
            name: "Salary",
            sortOrder: 10,
          },
          {
            name: "Allowance",
            sortOrder: 15,
          },
          {
            name: "Bonus",
            sortOrder: 15,
          },
          {
            name: "Gift",
            sortOrder: 20,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(user, "pmp-list-categories-test-cleanup");
    }
  });

  it("does not expose another user's categories", async () => {
    const userA = await createTestUser("CategoryListOwnerA");

    const userB = await createTestUser("CategoryListOwnerB");

    try {
      await runCoreTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await listCategoriesInTransaction(transaction, {
            userId: userA.userId,

            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(CategoryWorkspaceUnavailableError);
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-list-categories-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-list-categories-test-cleanup",
      );
    }
  });
});
