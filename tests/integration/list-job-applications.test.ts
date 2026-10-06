import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createApplicationEventInTransaction } from "@/modules/career/services/create-application-event";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import {
  InvalidJobApplicationListCursorError,
  JobApplicationListWorkspaceUnavailableError,
  listJobApplicationsInTransaction,
} from "@/modules/career/services/list-job-applications";
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

async function runCareerTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_LIST_JOB_APPLICATIONS_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the job-application list integration test transaction to roll back.",
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

describe("list job applications", () => {
  it("orders submitted applications before saved opportunities and exposes the authoritative next action", async () => {
    const user = await createTestUser("CareerList");

    try {
      await runCareerTestAndRollback(user, async (transaction) => {
        const older = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Older Corp",
          roleTitle: "Backend Engineer",

          location: "Makati",

          workArrangement: "hybrid",

          appliedDate: "2026-09-01",

          initialStage: "applied",
          initialStageEffectiveDate: "2026-09-01",
        });

        const newer = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Newer Labs",
          roleTitle: "Full Stack Developer",

          location: "Taguig",

          workArrangement: "remote",

          appliedDate: "2026-10-01",

          initialStage: "screening",
          initialStageEffectiveDate: "2026-10-05",
        });

        const saved = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Saved Opportunity",
          roleTitle: "Software Developer",

          initialStage: "saved",
          initialStageEffectiveDate: "2026-10-06",
        });

        const nextAction = await createApplicationEventInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: newer.applicationId,

            clientCommandId: randomUUID(),

            eventKind: "interview",
            title: "Technical interview",

            temporalKind: "timed",

            startsAt: "2026-10-12T09:00:00+08:00",

            endsAt: "2026-10-12T10:00:00+08:00",

            timezone: "Asia/Manila",

            setAsNextAction: true,

            expectedApplicationVersion: 1,
          },
        );

        const result = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(result.items.map((item) => item.applicationId)).toEqual([
          newer.applicationId,
          older.applicationId,
          saved.applicationId,
        ]);

        expect(result.nextCursor).toBeNull();

        expect(result.items[0]).toEqual({
          applicationId: newer.applicationId,

          companyName: "Newer Labs",
          roleTitle: "Full Stack Developer",

          location: "Taguig",
          workArrangement: "remote",

          appliedDate: "2026-10-01",

          currentStage: "screening",
          currentOutcome: null,

          archived: false,

          version: 2,

          nextAction: {
            eventId: nextAction.eventId,

            eventKind: "interview",
            title: "Technical interview",

            temporalKind: "timed",

            eventDate: null,

            startsAt: "2026-10-12T01:00:00.000Z",

            endsAt: "2026-10-12T02:00:00.000Z",

            timezone: "Asia/Manila",
          },
        });

        expect(result.items[1]?.nextAction).toBeNull();
        expect(result.items[2]?.nextAction).toBeNull();
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });

  it("returns an empty list for an active workspace with no matching applications", async () => {
    const user = await createTestUser("CareerListEmpty");

    try {
      await runCareerTestAndRollback(user, async (transaction) => {
        const result = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
        });

        expect(result).toEqual({
          items: [],
          nextCursor: null,
        });
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });

  it("supports literal company or role search, stage filtering and archive filtering", async () => {
    const user = await createTestUser("CareerListFilters");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const activeMatch = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            companyName: "Acme 100% Software",

            roleTitle: "Platform Engineer",

            appliedDate: "2026-10-01",

            initialStage: "screening",
            initialStageEffectiveDate: "2026-10-02",
          },
        );

        await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Different Corp",
          roleTitle: "Frontend Engineer",

          appliedDate: "2026-10-03",

          initialStage: "applied",
          initialStageEffectiveDate: "2026-10-03",
        });

        const archivedMatch = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            clientCommandId: randomUUID(),

            companyName: "Historical Corp",
            roleTitle: "Acme 100% Software Specialist",

            appliedDate: "2026-09-20",

            initialStage: "screening",
            initialStageEffectiveDate: "2026-09-21",
          },
        );

        await client.query(
          `
            UPDATE career."job_application"
            SET archived_at = clock_timestamp()
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, archivedMatch.applicationId],
        );

        const active = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          search: "100%",
          stage: "screening",
        });

        expect(active.items.map((item) => item.applicationId)).toEqual([
          activeMatch.applicationId,
        ]);

        const archived = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          archive: "archived",

          search: "100%",
          stage: "screening",
        });

        expect(archived.items.map((item) => item.applicationId)).toEqual([
          archivedMatch.applicationId,
        ]);

        expect(archived.items[0]?.archived).toBe(true);

        const all = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          archive: "all",

          search: "100%",
          stage: "screening",
        });

        expect(all.items.map((item) => item.applicationId).sort()).toEqual(
          [activeMatch.applicationId, archivedMatch.applicationId].sort(),
        );
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });

  it("paginates across submitted and saved applications without duplicates", async () => {
    const user = await createTestUser("CareerListPaging");

    try {
      await runCareerTestAndRollback(user, async (transaction) => {
        const first = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Page One",
          roleTitle: "Developer",

          appliedDate: "2026-10-03",

          initialStage: "applied",
          initialStageEffectiveDate: "2026-10-03",
        });

        const second = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Page Two",
          roleTitle: "Developer",

          appliedDate: "2026-10-02",

          initialStage: "applied",
          initialStageEffectiveDate: "2026-10-02",
        });

        const third = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Page Three",
          roleTitle: "Developer",

          appliedDate: "2026-10-01",

          initialStage: "applied",
          initialStageEffectiveDate: "2026-10-01",
        });

        const saved = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Saved Page",
          roleTitle: "Developer",

          initialStage: "saved",
          initialStageEffectiveDate: "2026-10-04",
        });

        const pageOne = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          pageSize: 2,
        });

        expect(pageOne.items.map((item) => item.applicationId)).toEqual([
          first.applicationId,
          second.applicationId,
        ]);

        expect(pageOne.nextCursor).not.toBeNull();

        const pageTwo = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          pageSize: 2,

          cursor: pageOne.nextCursor ?? undefined,
        });

        expect(pageTwo.items.map((item) => item.applicationId)).toEqual([
          third.applicationId,
          saved.applicationId,
        ]);

        expect(pageTwo.nextCursor).toBeNull();

        const combined = [...pageOne.items, ...pageTwo.items].map(
          (item) => item.applicationId,
        );

        expect(new Set(combined).size).toBe(4);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });

  it("rejects a cursor when its filters do not match the requested list", async () => {
    const user = await createTestUser("CareerListCursor");

    try {
      await runCareerTestAndRollback(user, async (transaction) => {
        await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Cursor One",
          roleTitle: "Developer",

          appliedDate: "2026-10-03",

          initialStage: "screening",
          initialStageEffectiveDate: "2026-10-03",
        });

        await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          clientCommandId: randomUUID(),

          companyName: "Cursor Two",
          roleTitle: "Developer",

          appliedDate: "2026-10-02",

          initialStage: "screening",
          initialStageEffectiveDate: "2026-10-02",
        });

        const firstPage = await listJobApplicationsInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,

          stage: "screening",
          pageSize: 1,
        });

        expect(firstPage.nextCursor).not.toBeNull();

        let cursorError: unknown;

        try {
          await listJobApplicationsInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            stage: "offer",
            pageSize: 1,

            cursor: firstPage.nextCursor ?? undefined,
          });
        } catch (error) {
          cursorError = error;
        }

        expect(cursorError).toBeInstanceOf(
          InvalidJobApplicationListCursorError,
        );
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });

  it("does not expose another workspace and distinguishes it from an empty owned workspace", async () => {
    const userA = await createTestUser("CareerListOwnerA");

    const userB = await createTestUser("CareerListOwnerB");

    try {
      await runCareerTestAndRollback(userA, async (transaction) => {
        let readError: unknown;

        try {
          await listJobApplicationsInTransaction(transaction, {
            userId: userA.userId,
            workspaceId: userB.workspaceId,
          });
        } catch (error) {
          readError = error;
        }

        expect(readError).toBeInstanceOf(
          JobApplicationListWorkspaceUnavailableError,
        );
      });
    } finally {
      await removeProvisionedTestUser(
        userA,
        "pmp-list-job-applications-test-cleanup",
      );

      await removeProvisionedTestUser(
        userB,
        "pmp-list-job-applications-test-cleanup",
      );
    }
  });
});
