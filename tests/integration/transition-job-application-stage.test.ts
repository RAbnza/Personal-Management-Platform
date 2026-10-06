import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { JobApplicationVersionConflictError } from "@/modules/career/domain/application";
import { createJobApplicationInTransaction } from "@/modules/career/services/create-job-application";
import { transitionJobApplicationStageInTransaction } from "@/modules/career/services/transition-job-application-stage";
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

  const rollbackMarker = new Error(
    "ROLLBACK_TRANSITION_JOB_APPLICATION_STAGE_TEST",
  );

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Career stage-transition test transaction to roll back.",
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

describe("transition job application stage", () => {
  it("moves a saved opportunity to Applied atomically and replays without duplicate history", async () => {
    const user = await createTestUser("StageApplied");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Applied Example",
            roleTitle: "Software Engineer",

            initialStage: "saved",
            initialStageEffectiveDate: "2026-10-01",
          },
        );

        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,

          applicationId: application.applicationId,

          clientCommandId,

          expectedVersion: 1,

          stage: "applied" as const,
          effectiveDate: "2026-10-06",
          appliedDate: "2026-10-06",
        };

        const first = await transitionJobApplicationStageInTransaction(
          transaction,
          input,
        );

        expect(first).toMatchObject({
          applicationId: application.applicationId,
          historySequenceNo: 2,
          historyEffectiveOrder: 0,
          version: 2,
          currentStage: "applied",
          currentOutcome: null,
          appliedDate: "2026-10-06",
        });

        expect(first.currentHistoryId).toBe(first.historyId);

        const replay = await transitionJobApplicationStageInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const current = await client.query<{
          applied_date: string | null;
          current_history_id: string;
          current_stage: string;
          current_outcome: string | null;
          version: number;
        }>(
          `
            SELECT
              applied_date::text AS applied_date,
              current_history_id,
              current_stage,
              current_outcome,
              version
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(current.rows).toEqual([
          {
            applied_date: "2026-10-06",
            current_history_id: first.historyId,
            current_stage: "applied",
            current_outcome: null,
            version: 2,
          },
        ]);

        const history = await client.query<{
          sequence_no: number;
          stage: string;
          outcome: string | null;
          effective_date: string;
          effective_order: number;
        }>(
          `
            SELECT
              sequence_no,
              stage,
              outcome,
              effective_date::text AS effective_date,
              effective_order
            FROM career."application_stage_history"
            WHERE
              workspace_id = $1
              AND application_id = $2
            ORDER BY sequence_no
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(history.rows).toEqual([
          {
            sequence_no: 1,
            stage: "saved",
            outcome: null,
            effective_date: "2026-10-01",
            effective_order: 0,
          },
          {
            sequence_no: 2,
            stage: "applied",
            outcome: null,
            effective_date: "2026-10-06",
            effective_order: 0,
          },
        ]);

        const audit = await client.query<{
          subject_version: number;
          operation: string;
        }>(
          `
            SELECT
              subject_version,
              operation
            FROM audit."private_revision"
            WHERE
              workspace_id = $1
              AND subject_kind = 'job_application'
              AND subject_id = $2
            ORDER BY subject_version
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(audit.rows).toEqual([
          {
            subject_version: 1,
            operation: "create",
          },
          {
            subject_version: 2,
            operation: "stage_transition",
          },
        ]);

        const transitionHistoryCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM career."application_stage_history"
            WHERE
              workspace_id = $1
              AND application_id = $2
              AND sequence_no > 1
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(transitionHistoryCount.rows[0]?.count).toBe("1");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-transition-job-application-stage-test-cleanup",
      );
    }
  });

  it("supports skipped stages while preserving a separately entered application date", async () => {
    const user = await createTestUser("StageSkip");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Skip Stage Example",
            roleTitle: "Backend Developer",

            initialStage: "saved",
            initialStageEffectiveDate: "2026-09-01",
          },
        );

        const result = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "screening",
            effectiveDate: "2026-09-10",
            appliedDate: "2026-09-05",
          },
        );

        expect(result).toMatchObject({
          version: 2,
          currentStage: "screening",
          currentOutcome: null,
          appliedDate: "2026-09-05",
        });

        const current = await client.query<{
          applied_date: string | null;
          current_stage: string;
        }>(
          `
            SELECT
              applied_date::text AS applied_date,
              current_stage
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(current.rows).toEqual([
          {
            applied_date: "2026-09-05",
            current_stage: "screening",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-transition-job-application-stage-test-cleanup",
      );
    }
  });

  it("records backdated history without replacing the resolved current stage", async () => {
    const user = await createTestUser("StageBackdated");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Backdated Example",
            roleTitle: "Full Stack Developer",

            appliedDate: "2026-09-01",
            initialStage: "applied",
            initialStageEffectiveDate: "2026-09-01",
          },
        );

        const screening = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "screening",
            effectiveDate: "2026-09-10",
          },
        );

        expect(screening.version).toBe(2);
        expect(screening.currentStage).toBe("screening");

        const backdated = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 2,

            stage: "screening",
            effectiveDate: "2026-09-05",
          },
        );

        expect(backdated).toMatchObject({
          historySequenceNo: 3,
          historyEffectiveOrder: 0,
          version: 3,
          currentStage: "screening",
          currentOutcome: null,
          appliedDate: "2026-09-01",
        });

        expect(backdated.historyId).not.toBe(screening.historyId);

        expect(backdated.currentHistoryId).toBe(screening.historyId);

        const history = await client.query<{
          id: string;
          sequence_no: number;
          effective_date: string;
        }>(
          `
            SELECT
              id,
              sequence_no,
              effective_date::text AS effective_date
            FROM career."application_stage_history"
            WHERE
              workspace_id = $1
              AND application_id = $2
            ORDER BY sequence_no
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(history.rows).toEqual([
          {
            id: application.initialHistoryId,
            sequence_no: 1,
            effective_date: "2026-09-01",
          },
          {
            id: screening.historyId,
            sequence_no: 2,
            effective_date: "2026-09-10",
          },
          {
            id: backdated.historyId,
            sequence_no: 3,
            effective_date: "2026-09-05",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-transition-job-application-stage-test-cleanup",
      );
    }
  });

  it("requires a reason when a terminal application is actually reopened", async () => {
    const user = await createTestUser("StageReopen");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Reopen Example",
            roleTitle: "Platform Engineer",

            appliedDate: "2026-08-01",
            initialStage: "final_interview",
            initialStageEffectiveDate: "2026-08-20",
          },
        );

        const rejected = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "final_interview",
            outcome: "rejected",

            effectiveDate: "2026-08-21",
            reason: "Employer declined the application.",
          },
        );

        expect(rejected).toMatchObject({
          version: 2,
          currentStage: "final_interview",
          currentOutcome: "rejected",
        });

        const reopenCommandId = randomUUID();

        await client.query("SAVEPOINT reopen_requires_reason");

        let reopenError: unknown;

        try {
          await transitionJobApplicationStageInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: reopenCommandId,

            expectedVersion: 2,

            stage: "screening",
            effectiveDate: "2026-08-22",
          });
        } catch (error) {
          reopenError = error;
        }

        expect(reopenError).toBeInstanceOf(RangeError);

        expect(reopenError instanceof Error ? reopenError.message : "").toMatch(
          /reopening.*requires a reason/i,
        );

        await client.query("ROLLBACK TO SAVEPOINT reopen_requires_reason");
        await client.query("RELEASE SAVEPOINT reopen_requires_reason");

        const reopened = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: reopenCommandId,

            expectedVersion: 2,

            stage: "screening",
            effectiveDate: "2026-08-22",

            reason: "Employer reopened the candidacy for another screening.",
          },
        );

        expect(reopened).toMatchObject({
          version: 3,
          currentStage: "screening",
          currentOutcome: null,
          appliedDate: "2026-08-01",
        });

        const history = await client.query<{
          sequence_no: number;
          stage: string;
          outcome: string | null;
          reason: string | null;
        }>(
          `
            SELECT
              sequence_no,
              stage,
              outcome,
              reason
            FROM career."application_stage_history"
            WHERE
              workspace_id = $1
              AND application_id = $2
            ORDER BY sequence_no
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(history.rows).toEqual([
          {
            sequence_no: 1,
            stage: "final_interview",
            outcome: null,
            reason: null,
          },
          {
            sequence_no: 2,
            stage: "final_interview",
            outcome: "rejected",
            reason: "Employer declined the application.",
          },
          {
            sequence_no: 3,
            stage: "screening",
            outcome: null,
            reason: "Employer reopened the candidacy for another screening.",
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-transition-job-application-stage-test-cleanup",
      );
    }
  });

  it("rejects stale expected versions before appending another history row", async () => {
    const user = await createTestUser("StageVersion");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const application = await createJobApplicationInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Version Example",
            roleTitle: "Frontend Engineer",

            initialStage: "saved",
            initialStageEffectiveDate: "2026-10-01",
          },
        );

        const applied = await transitionJobApplicationStageInTransaction(
          transaction,
          {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "applied",
            effectiveDate: "2026-10-02",
            appliedDate: "2026-10-02",
          },
        );

        expect(applied.version).toBe(2);

        await client.query("SAVEPOINT stale_application_version");

        let staleError: unknown;

        try {
          await transitionJobApplicationStageInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,

            applicationId: application.applicationId,

            clientCommandId: randomUUID(),

            expectedVersion: 1,

            stage: "screening",
            effectiveDate: "2026-10-03",
          });
        } catch (error) {
          staleError = error;
        }

        expect(staleError).toBeInstanceOf(JobApplicationVersionConflictError);

        if (staleError instanceof JobApplicationVersionConflictError) {
          expect(staleError.expectedVersion).toBe(1);
          expect(staleError.currentVersion).toBe(2);
        }

        await client.query("ROLLBACK TO SAVEPOINT stale_application_version");
        await client.query("RELEASE SAVEPOINT stale_application_version");

        const historyCount = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM career."application_stage_history"
            WHERE
              workspace_id = $1
              AND application_id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(historyCount.rows[0]?.count).toBe("2");
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-transition-job-application-stage-test-cleanup",
      );
    }
  });
});
