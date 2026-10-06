import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { getCurrentUserOverview } from "@/modules/core/services/get-current-user-overview";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
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

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("current user overview", () => {
  it("returns workspace settings and virtual module capabilities in one authorized read", async () => {
    const user = await createTestUser("CurrentUserOverview");

    try {
      const overview = await getCurrentUserOverview({
        userId: user.userId,

        workspaceId: user.workspaceId,
      });

      expect(overview.workspace).toEqual({
        currency: "PHP",

        timezone: "Asia/Manila",

        weekStart: 1,

        version: 1,

        currencyChangeAllowed: true,
      });

      expect(overview.preference).toEqual({
        locale: "en-PH",

        theme: "system",

        defaultSalaryAccountId: null,

        gettingStartedDismissedAt: null,

        version: 1,
      });

      expect(overview.modules).toEqual([
        {
          moduleKey: "money",

          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,

          version: 0,
        },
        {
          moduleKey: "career",

          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,

          version: 0,
        },
        {
          moduleKey: "time",

          enabled: true,
          agendaVisible: true,
          remindersEnabled: true,

          version: 0,
        },
      ]);
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-current-user-overview-test-cleanup",
      );
    }
  });
});
