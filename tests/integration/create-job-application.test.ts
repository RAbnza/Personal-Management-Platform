import { randomUUID } from "node:crypto";

import { Client, type PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { PossibleDuplicateJobApplicationError } from "@/modules/career/domain/application";
import {
  createJobApplication,
  createJobApplicationInTransaction,
} from "@/modules/career/services/create-job-application";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
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
      "TEST_DATABASE_ADMIN_URL is required for create-job-application integration tests.",
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
    application_name: "pmp-create-job-application-test-cleanup",
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

async function runCareerTestAndRollback(
  user: TestUser,
  operation: (
    transaction: ScopedTransaction,
    client: PoolClient,
  ) => Promise<void>,
): Promise<void> {
  const client = await getDomainPool().connect();
  const rollbackMarker = new Error("ROLLBACK_CREATE_JOB_APPLICATION_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async (transaction) => {
        await operation(transaction, client);

        throw rollbackMarker;
      });

      throw new Error(
        "Expected the Career integration test transaction to roll back.",
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

async function createResumeVersion(
  client: PoolClient,
  user: TestUser,
): Promise<string> {
  const resumeVersionId = randomUUID();

  await client.query(
    `
      INSERT INTO career."resume_version" (
        id,
        workspace_id,
        label,
        reference_url,
        notes,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        'https://example.test/resume.pdf',
        'Resume used by application integration test.',
        $4,
        'user'
      )
    `,
    [
      resumeVersionId,
      user.workspaceId,
      `Resume ${resumeVersionId}`,
      user.userId,
    ],
  );

  return resumeVersionId;
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("create job application", () => {
  it("creates a saved opportunity with initial history, audit evidence and a completed receipt", async () => {
    const user = await createTestUser("CareerSaved");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const resumeVersionId = await createResumeVersion(client, user);

        const clientCommandId = randomUUID();

        const result = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,
          requestId: randomUUID(),

          companyName: "Example Technologies",
          roleTitle: "Full Stack Developer",

          postingUrl: "https://example.test/jobs/full-stack-developer",
          sourceName: "Company careers page",
          roleDescriptionSnapshot:
            "Build and maintain web application features.",
          location: "Metro Manila",
          workArrangement: "hybrid",

          salaryMinMinor: "3500000",
          salaryMaxMinor: "4500000",
          salaryCurrency: "PHP",
          salaryPeriod: "month",

          technologyTags: ["TypeScript", "React", "PostgreSQL"],

          contactName: "Hiring Team",
          contactEmail: "hiring@example.test",
          contactPhone: "+63 900 000 0000",

          resumeVersionId,

          initialStage: "saved",
          initialStageEffectiveDate: "2026-10-06",

          notes: "Interesting role to review.",
        });

        expect(result.version).toBe(1);

        const application = await client.query<{
          id: string;
          current_history_id: string;
          current_stage: string;
          current_outcome: string | null;
          applied_date: string | null;
          resume_version_id: string | null;
          salary_min_minor: string | null;
          salary_max_minor: string | null;
          salary_currency: string | null;
          salary_period: string | null;
          technology_tags: string[];
          version: number;
        }>(
          `
              SELECT
                id,
                current_history_id,
                current_stage,
                current_outcome,
                applied_date::text AS applied_date,
                resume_version_id,
                salary_min_minor::text AS salary_min_minor,
                salary_max_minor::text AS salary_max_minor,
                salary_currency,
                salary_period,
                technology_tags,
                version
              FROM career."job_application"
              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, result.applicationId],
        );

        expect(application.rows).toEqual([
          {
            id: result.applicationId,
            current_history_id: result.initialHistoryId,
            current_stage: "saved",
            current_outcome: null,
            applied_date: null,
            resume_version_id: resumeVersionId,
            salary_min_minor: "3500000",
            salary_max_minor: "4500000",
            salary_currency: "PHP",
            salary_period: "month",
            technology_tags: ["TypeScript", "React", "PostgreSQL"],
            version: 1,
          },
        ]);

        const history = await client.query<{
          id: string;
          application_id: string;
          sequence_no: number;
          stage: string;
          outcome: string | null;
          effective_date: string;
          effective_order: number;
        }>(
          `
              SELECT
                id,
                application_id,
                sequence_no,
                stage,
                outcome,
                effective_date::text AS effective_date,
                effective_order
              FROM career."application_stage_history"
              WHERE
                workspace_id = $1
                AND application_id = $2
            `,
          [user.workspaceId, result.applicationId],
        );

        expect(history.rows).toEqual([
          {
            id: result.initialHistoryId,
            application_id: result.applicationId,
            sequence_no: 1,
            stage: "saved",
            outcome: null,
            effective_date: "2026-10-06",
            effective_order: 0,
          },
        ]);

        const audit = await client.query<{
          subject_kind: string;
          subject_id: string;
          subject_version: number;
          operation: string;
          effective_date: string | null;
        }>(
          `
              SELECT
                subject_kind,
                subject_id,
                subject_version,
                operation,
                effective_date::text AS effective_date
              FROM audit."private_revision"
              WHERE
                workspace_id = $1
                AND subject_kind = 'job_application'
                AND subject_id = $2
            `,
          [user.workspaceId, result.applicationId],
        );

        expect(audit.rows).toEqual([
          {
            subject_kind: "job_application",
            subject_id: result.applicationId,
            subject_version: 1,
            operation: "create",
            effective_date: "2026-10-06",
          },
        ]);

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

        expect(receipt.rows).toEqual([
          {
            state: "completed",
            result_json: result,
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("requires an explicit application date for submitted stages without inferring it from a later stage", async () => {
    const user = await createTestUser("CareerSubmitted");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        await expect(
          createJobApplicationInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: randomUUID(),

            companyName: "Missing Applied Date Corp",
            roleTitle: "Backend Developer",

            initialStage: "screening",
            initialStageEffectiveDate: "2026-09-10",
          }),
        ).rejects.toThrow(/explicit applied date/i);

        const result = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          companyName: "Submitted Application Corp",
          roleTitle: "Backend Developer",

          appliedDate: "2026-09-01",
          initialStage: "screening",
          initialStageEffectiveDate: "2026-09-10",
        });

        const application = await client.query<{
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
          [user.workspaceId, result.applicationId],
        );

        expect(application.rows).toEqual([
          {
            applied_date: "2026-09-01",
            current_stage: "screening",
          },
        ]);

        const history = await client.query<{
          effective_date: string;
          stage: string;
        }>(
          `
              SELECT
                effective_date::text AS effective_date,
                stage
              FROM career."application_stage_history"
              WHERE
                workspace_id = $1
                AND id = $2
            `,
          [user.workspaceId, result.initialHistoryId],
        );

        expect(history.rows).toEqual([
          {
            effective_date: "2026-09-10",
            stage: "screening",
          },
        ]);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("replays the same command without duplicating application history or audit evidence", async () => {
    const user = await createTestUser("CareerReplay");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const clientCommandId = randomUUID();

        const input = {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId,

          companyName: "Replay Company",
          roleTitle: "Software Engineer",

          appliedDate: "2026-08-01",
          initialStage: "applied" as const,
          initialStageEffectiveDate: "2026-08-01",
        };

        const first = await createJobApplicationInTransaction(
          transaction,
          input,
        );

        const replay = await createJobApplicationInTransaction(
          transaction,
          input,
        );

        expect(replay).toEqual(first);

        const applicationCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM career."job_application"
              WHERE workspace_id = $1
            `,
          [user.workspaceId],
        );

        expect(applicationCount.rows[0]?.count).toBe("1");

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
          [user.workspaceId, first.applicationId],
        );

        expect(historyCount.rows[0]?.count).toBe("1");

        const auditCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM audit."private_revision"
              WHERE
                workspace_id = $1
                AND subject_kind = 'job_application'
                AND subject_id = $2
            `,
          [user.workspaceId, first.applicationId],
        );

        expect(auditCount.rows[0]?.count).toBe("1");

        await expect(
          createJobApplicationInTransaction(transaction, {
            ...input,
            roleTitle: "Different Role",
          }),
        ).rejects.toBeInstanceOf(CommandReceiptConflictError);
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("warns about a duplicate company and role but allows an explicitly confirmed new attempt", async () => {
    const user = await createTestUser("CareerDuplicate");

    try {
      await runCareerTestAndRollback(user, async (transaction, client) => {
        const first = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: randomUUID(),

          companyName: "Duplicate Example Inc",
          roleTitle: "Frontend Developer",

          initialStage: "saved",
          initialStageEffectiveDate: "2026-07-01",
        });

        const secondClientCommandId = randomUUID();

        await client.query("SAVEPOINT duplicate_application_warning");

        let duplicateError: unknown;

        try {
          await createJobApplicationInTransaction(transaction, {
            userId: user.userId,
            workspaceId: user.workspaceId,
            clientCommandId: secondClientCommandId,

            companyName: "duplicate example inc",
            roleTitle: "frontend developer",

            initialStage: "saved",
            initialStageEffectiveDate: "2026-10-01",
          });
        } catch (error) {
          duplicateError = error;
        }

        expect(duplicateError).toBeInstanceOf(
          PossibleDuplicateJobApplicationError,
        );

        if (duplicateError instanceof PossibleDuplicateJobApplicationError) {
          expect(duplicateError.candidates).toEqual(
            expect.arrayContaining([
              {
                applicationId: first.applicationId,
                archived: false,
              },
            ]),
          );
        }

        /*
         * The warning intentionally happens after command-receipt claim so
         * an already-completed replay can resolve before duplicate
         * detection. Roll this rejected attempt back exactly as the normal
         * outer transaction would.
         */
        await client.query(
          "ROLLBACK TO SAVEPOINT duplicate_application_warning",
        );
        await client.query("RELEASE SAVEPOINT duplicate_application_warning");

        const second = await createJobApplicationInTransaction(transaction, {
          userId: user.userId,
          workspaceId: user.workspaceId,
          clientCommandId: secondClientCommandId,

          companyName: "duplicate example inc",
          roleTitle: "frontend developer",

          initialStage: "saved",
          initialStageEffectiveDate: "2026-10-01",

          allowPossibleDuplicate: true,
        });

        expect(second.applicationId).not.toBe(first.applicationId);

        const applicationCount = await client.query<{
          count: string;
        }>(
          `
              SELECT count(*)::text AS count
              FROM career."job_application"
              WHERE workspace_id = $1
            `,
          [user.workspaceId],
        );

        expect(applicationCount.rows[0]?.count).toBe("2");
      });
    } finally {
      await removeTestUser(user);
    }
  });

  it("rejects creating an application through another user's workspace context", async () => {
    const first = await createTestUser("CareerIsolationFirst");
    const second = await createTestUser("CareerIsolationSecond");

    try {
      await expect(
        createJobApplication({
          userId: first.userId,
          workspaceId: second.workspaceId,
          clientCommandId: randomUUID(),

          companyName: "Forbidden Company",
          roleTitle: "Forbidden Role",

          initialStage: "saved",
          initialStageEffectiveDate: "2026-10-06",
        }),
      ).rejects.toThrow(/active private workspace/i);
    } finally {
      await removeTestUser(first);
      await removeTestUser(second);
    }
  });
});
