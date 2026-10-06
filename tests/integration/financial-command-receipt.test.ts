import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  FinancialCommandConflictError,
  hashFinancialCommandPayload,
} from "@/modules/finance/domain/financial-command";
import {
  claimFinancialCommandReceipt,
  completeFinancialCommandReceipt,
} from "@/modules/finance/repositories/command-receipt-repository";
import { withDomainTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { removeProvisionedTestUser } from "./helpers/provisioned-test-user";

type TestUser = {
  userId: string;
  workspaceId: string;
};

async function createTestUser(): Promise<TestUser> {
  const userId = randomUUID();
  const name = "Financial Command Test User";

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
    [userId, name, `financial-command-${userId}@example.test`],
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

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("financial command receipts", () => {
  it("replays the committed result for the same command key and payload", async () => {
    const user = await createTestUser();
    const clientCommandId = randomUUID();

    const payloadHash = hashFinancialCommandPayload({
      accountType: "checking",
      name: "Replay Account",
      openingBalanceMinor: "200000",
      openingCutoffDate: "2026-10-06",
    });

    const expectedResult = {
      accountId: randomUUID(),
      openingActionId: randomUUID(),
    };

    try {
      const first = await withDomainTransaction(user, async (transaction) => {
        const claim = await claimFinancialCommandReceipt(transaction, {
          workspaceId: user.workspaceId,
          clientCommandId,
          commandType: "finance.open_account",
          payloadHash,
        });

        expect(claim.kind).toBe("claimed");

        if (claim.kind !== "claimed") {
          throw new Error(
            "Expected the initial financial command receipt to be claimed.",
          );
        }

        await completeFinancialCommandReceipt(transaction, {
          workspaceId: user.workspaceId,
          receiptId: claim.receiptId,
          result: expectedResult,
        });

        return claim;
      });

      expect(first.kind).toBe("claimed");

      const replay = await withDomainTransaction(user, (transaction) =>
        claimFinancialCommandReceipt(transaction, {
          workspaceId: user.workspaceId,
          clientCommandId,
          commandType: "finance.open_account",
          payloadHash,
        }),
      );

      expect(replay).toEqual({
        kind: "replay",
        receiptId: first.receiptId,
        result: expectedResult,
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-financial-command-receipt-test-cleanup",
      );
    }
  });

  it("rejects reuse of a client command ID with a different payload", async () => {
    const user = await createTestUser();
    const clientCommandId = randomUUID();

    const firstPayloadHash = hashFinancialCommandPayload({
      name: "Original Account",
      openingBalanceMinor: "0",
    });

    const conflictingPayloadHash = hashFinancialCommandPayload({
      name: "Different Account",
      openingBalanceMinor: "0",
    });

    try {
      await withDomainTransaction(user, async (transaction) => {
        const claim = await claimFinancialCommandReceipt(transaction, {
          workspaceId: user.workspaceId,
          clientCommandId,
          commandType: "finance.open_account",
          payloadHash: firstPayloadHash,
        });

        if (claim.kind !== "claimed") {
          throw new Error(
            "Expected the initial command receipt to be newly claimed.",
          );
        }

        await completeFinancialCommandReceipt(transaction, {
          workspaceId: user.workspaceId,
          receiptId: claim.receiptId,
          result: {
            accountId: randomUUID(),
          },
        });
      });

      await expect(
        withDomainTransaction(user, (transaction) =>
          claimFinancialCommandReceipt(transaction, {
            workspaceId: user.workspaceId,
            clientCommandId,
            commandType: "finance.open_account",
            payloadHash: conflictingPayloadHash,
          }),
        ),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-financial-command-receipt-test-cleanup",
      );
    }
  });
});
