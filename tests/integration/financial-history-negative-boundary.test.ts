import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { openFinancialAccountInTransaction } from "@/modules/finance/services/open-financial-account";
import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";
import { runScopedTransactionOnClient } from "@/platform/db/scoped-transaction";
import { seedExpenseHistory } from "./helpers/large-expense-history";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";

afterAll(closeRuntimeDatabasePools);
it.each(["100", "1000"])(
  "finalization still enforces the database negative-balance boundary with opening %s",
  async (opening) => {
    const userId = randomUUID();
    await getAuthPool().query(
      'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
      [userId, "C5 performance fixture", `${userId}@example.test`],
    );
    const { workspaceId } = await provisionPersonalWorkspace({
      userId,
      displayName: "C5 performance fixture",
    });
    const owner = { userId, workspaceId };
    const c = await getDomainPool().connect();
    try {
      const operation = runScopedTransactionOnClient(c, owner, async (t) => {
        const account = await openFinancialAccountInTransaction(t, {
          ...owner,
          clientCommandId: randomUUID(),
          name: "Negative boundary fixture",
          accountType: "checking",
          openingCutoffDate: "2016-01-01",
          openingBalanceMinor: opening,
        });
        // This factory writes exact economic evidence directly as app_domain,
        // bypassing the service warning only to exercise the real SQL validator.
        // Its immutable audit deliberately records acknowledgement=false.
        await seedExpenseHistory(t, owner, account.accountId, 0, 1);
      });
      if (opening === "100") {
        let failure: unknown;
        try {
          await operation;
        } catch (error) {
          failure = error;
        }
        while (
          failure &&
          typeof failure === "object" &&
          "cause" in failure &&
          failure.cause
        )
          failure = failure.cause;
        expect(failure).toMatchObject({
          code: "23514",
          message:
            "negative balance requires durable explicit command acknowledgement",
        });
      } else await operation;
    } finally {
      c.release();
      await removeNamedFinancialFixture(owner, "C5 performance fixture");
    }
  },
);
