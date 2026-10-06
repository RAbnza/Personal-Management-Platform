import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
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
  name: string;
};

type ApplicationFixture = {
  applicationId: string;
  initialHistoryId: string;
};

type PersonalEventInput = {
  title: string;
  temporalKind: "date" | "timed";
  eventDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  status?: "scheduled" | "completed" | "cancelled";
  completedAt?: string | null;
  description?: string | null;
};

type ApplicationEventInput = {
  applicationId: string;
  eventKind:
    | "interview"
    | "assessment"
    | "follow_up"
    | "submission"
    | "response"
    | "offer"
    | "no_response"
    | "note";
  title: string;
  temporalKind: "date" | "timed";
  eventDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  status?: "scheduled" | "completed" | "cancelled";
  completedAt?: string | null;
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
    name,
  };
}

async function runScopedTestAndRollback(
  user: TestUser,
  operation: (client: PoolClient) => Promise<void>,
) {
  const client = await getDomainPool().connect();

  const rollbackMarker = new Error("ROLLBACK_S2_TEST");

  try {
    try {
      await runScopedTransactionOnClient(client, user, async () => {
        await operation(client);

        throw rollbackMarker;
      });

      throw new Error("Expected S2 test transaction to roll back.");
    } catch (error) {
      if (error !== rollbackMarker) {
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function insertCommandReceipt(
  client: PoolClient,
  user: TestUser,
): Promise<string> {
  const id = randomUUID();

  await client.query(
    `
      INSERT INTO core."command_receipt" (
        id,
        workspace_id,
        client_command_id,
        command_type,
        payload_hash,
        state,
        result_json,
        completed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'career.integration_test',
        $4,
        'completed',
        '{}'::jsonb,
        clock_timestamp()
      )
    `,
    [id, user.workspaceId, randomUUID(), Buffer.alloc(32, 7)],
  );

  return id;
}

async function insertResumeVersion(
  client: PoolClient,
  user: TestUser,
  label = `Resume ${randomUUID()}`,
): Promise<string> {
  const id = randomUUID();

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
        'Initial resume notes',
        $4,
        'user'
      )
    `,
    [id, user.workspaceId, label, user.userId],
  );

  return id;
}

async function createApplicationFixture(
  client: PoolClient,
  user: TestUser,
  input: {
    resumeVersionId?: string | null;
  } = {},
): Promise<ApplicationFixture> {
  const applicationId = randomUUID();
  const initialHistoryId = randomUUID();
  const commandReceiptId = await insertCommandReceipt(client, user);

  await client.query(
    `
      INSERT INTO career."job_application" (
        id,
        workspace_id,
        company_name,
        role_title,
        resume_version_id,
        current_stage,
        current_history_id,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        'Example Company',
        'Software Engineer',
        $3,
        'saved',
        $4,
        $5,
        'user'
      )
    `,
    [
      applicationId,
      user.workspaceId,
      input.resumeVersionId ?? null,
      initialHistoryId,
      user.userId,
    ],
  );

  await client.query(
    `
      INSERT INTO career."application_stage_history" (
        id,
        workspace_id,
        application_id,
        sequence_no,
        stage,
        effective_date,
        effective_order,
        command_receipt_id,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        1,
        'saved',
        DATE '2026-01-01',
        0,
        $4,
        $5,
        'user'
      )
    `,
    [
      initialHistoryId,
      user.workspaceId,
      applicationId,
      commandReceiptId,
      user.userId,
    ],
  );

  return {
    applicationId,
    initialHistoryId,
  };
}

async function insertStageHistory(
  client: PoolClient,
  user: TestUser,
  input: {
    applicationId: string;
    sequenceNo: number;
    stage:
      | "saved"
      | "applied"
      | "screening"
      | "interview"
      | "technical_assessment"
      | "final_interview"
      | "offer"
      | "accepted";
    effectiveDate: string;
    effectiveOrder?: number;
    supersedesHistoryId?: string | null;
    outcome?:
      | "accepted"
      | "rejected"
      | "withdrawn"
      | "offer_declined"
      | "offer_expired"
      | "employer_cancelled"
      | null;
  },
): Promise<string> {
  const id = randomUUID();
  const commandReceiptId = await insertCommandReceipt(client, user);

  await client.query(
    `
      INSERT INTO career."application_stage_history" (
        id,
        workspace_id,
        application_id,
        sequence_no,
        stage,
        outcome,
        effective_date,
        effective_order,
        supersedes_history_id,
        command_receipt_id,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        'user'
      )
    `,
    [
      id,
      user.workspaceId,
      input.applicationId,
      input.sequenceNo,
      input.stage,
      input.outcome ?? null,
      input.effectiveDate,
      input.effectiveOrder ?? 0,
      input.supersedesHistoryId ?? null,
      commandReceiptId,
      user.userId,
    ],
  );

  return id;
}

async function insertPersonalEvent(
  client: PoolClient,
  user: TestUser,
  input: PersonalEventInput,
): Promise<string> {
  const id = randomUUID();

  await client.query(
    `
      INSERT INTO time."personal_event" (
        id,
        workspace_id,
        title,
        temporal_kind,
        event_date,
        starts_at,
        ends_at,
        timezone,
        status,
        description,
        completed_at,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        'user'
      )
    `,
    [
      id,
      user.workspaceId,
      input.title,
      input.temporalKind,
      input.eventDate ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.timezone ?? null,
      input.status ?? "scheduled",
      input.description ?? null,
      input.completedAt ?? null,
      user.userId,
    ],
  );

  return id;
}

async function insertApplicationEvent(
  client: PoolClient,
  user: TestUser,
  input: ApplicationEventInput,
): Promise<string> {
  const id = randomUUID();

  await client.query(
    `
      INSERT INTO career."application_event" (
        id,
        workspace_id,
        application_id,
        event_kind,
        title,
        temporal_kind,
        event_date,
        starts_at,
        ends_at,
        timezone,
        status,
        completed_at,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        'user'
      )
    `,
    [
      id,
      user.workspaceId,
      input.applicationId,
      input.eventKind,
      input.title,
      input.temporalKind,
      input.eventDate ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.timezone ?? null,
      input.status ?? "scheduled",
      input.completedAt ?? null,
      user.userId,
    ],
  );

  return id;
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("S2 career, guidance and agenda database integrity", () => {
  it("enforces two-user RLS isolation across S2 private tables", async () => {
    const first = await createTestUser("S2IsolationFirst");
    const second = await createTestUser("S2IsolationSecond");

    const client = await getDomainPool().connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          SELECT
            set_config('app.user_id', $1, true),
            set_config('app.workspace_id', $2, true)
        `,
        [first.userId, first.workspaceId],
      );

      const firstResumeId = await insertResumeVersion(
        client,
        first,
        "First Resume",
      );

      const firstEventId = await insertPersonalEvent(client, first, {
        title: "First private event",
        temporalKind: "date",
        eventDate: "2026-10-10",
      });

      await client.query(
        `
          INSERT INTO core."module_preference" (
            workspace_id,
            module_key
          )
          VALUES ($1, 'money')
        `,
        [first.workspaceId],
      );

      await client.query(
        `
          SELECT
            set_config('app.user_id', $1, true),
            set_config('app.workspace_id', $2, true)
        `,
        [second.userId, second.workspaceId],
      );

      const secondResumeId = await insertResumeVersion(
        client,
        second,
        "Second Resume",
      );

      const secondEventId = await insertPersonalEvent(client, second, {
        title: "Second private event",
        temporalKind: "date",
        eventDate: "2026-10-11",
      });

      await client.query(
        `
          INSERT INTO core."module_preference" (
            workspace_id,
            module_key
          )
          VALUES ($1, 'money')
        `,
        [second.workspaceId],
      );

      await client.query(
        `
          SELECT
            set_config('app.user_id', $1, true),
            set_config('app.workspace_id', $2, true)
        `,
        [first.userId, first.workspaceId],
      );

      const visibleResumes = await client.query<{ id: string }>(`
        SELECT id
        FROM career."resume_version"
      `);

      expect(visibleResumes.rows).toEqual([{ id: firstResumeId }]);

      expect(visibleResumes.rows.some((row) => row.id === secondResumeId)).toBe(
        false,
      );

      const visibleEvents = await client.query<{ id: string }>(`
        SELECT id
        FROM time."personal_event"
      `);

      expect(visibleEvents.rows).toEqual([{ id: firstEventId }]);

      expect(visibleEvents.rows.some((row) => row.id === secondEventId)).toBe(
        false,
      );

      const visiblePreferences = await client.query<{
        workspace_id: string;
        module_key: string;
      }>(`
        SELECT
          workspace_id,
          module_key
        FROM core."module_preference"
      `);

      expect(visiblePreferences.rows).toEqual([
        {
          workspace_id: first.workspaceId,
          module_key: "money",
        },
      ]);

      await expect(
        insertPersonalEvent(client, first, {
          title: "Attempted foreign event",
          temporalKind: "date",
          eventDate: "2026-10-12",
        }).then(async (eventId) => {
          await client.query(
            `
              UPDATE time."personal_event"
              SET workspace_id = $1
              WHERE id = $2
            `,
            [second.workspaceId, eventId],
          );
        }),
      ).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Best-effort cleanup after an expected transaction error.
      }

      client.release();

      await removeProvisionedTestUser(
        first,
        "pmp-s2-career-agenda-test-cleanup",
      );

      await removeProvisionedTestUser(
        second,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("enforces the implemented module-key allowlist and onboarding coherence", async () => {
    const user = await createTestUser("S2Guidance");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          await client.query(
            `
              INSERT INTO core."module_preference" (
                workspace_id,
                module_key
              )
              VALUES ($1, 'calendar')
            `,
            [user.workspaceId],
          );
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });

      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          await client.query(
            `
              INSERT INTO core."onboarding_step" (
                workspace_id,
                guide_version,
                step_key,
                state,
                updated_at
              )
              VALUES (
                $1,
                1,
                'review-agenda',
                'completed',
                clock_timestamp()
              )
            `,
            [user.workspaceId],
          );
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });

      await runScopedTestAndRollback(user, async (transactionClient) => {
        await transactionClient.query(
          `
            INSERT INTO core."module_preference" (
              workspace_id,
              module_key
            )
            VALUES ($1, 'career')
          `,
          [user.workspaceId],
        );

        const updatedPreference = await transactionClient.query<{
          version: number;
          enabled: boolean;
        }>(
          `
            UPDATE core."module_preference"
            SET
              enabled = false,
              version = 999
            WHERE
              workspace_id = $1
              AND module_key = 'career'
            RETURNING
              version,
              enabled
          `,
          [user.workspaceId],
        );

        expect(updatedPreference.rows).toEqual([
          {
            version: 2,
            enabled: false,
          },
        ]);

        await transactionClient.query(
          `
            INSERT INTO core."onboarding_step" (
              workspace_id,
              guide_version,
              step_key,
              state,
              updated_at
            )
            VALUES (
              $1,
              1,
              'review-agenda',
              'pending',
              clock_timestamp()
            )
          `,
          [user.workspaceId],
        );

        const completed = await transactionClient.query<{
          state: string;
          completed_at: Date | null;
        }>(
          `
            UPDATE core."onboarding_step"
            SET
              state = 'completed',
              completed_at = clock_timestamp(),
              updated_at = clock_timestamp()
            WHERE
              workspace_id = $1
              AND guide_version = 1
              AND step_key = 'review-agenda'
            RETURNING
              state,
              completed_at
          `,
          [user.workspaceId],
        );

        expect(completed.rows[0]?.state).toBe("completed");
        expect(completed.rows[0]?.completed_at).toBeInstanceOf(Date);
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("enforces strict date-only versus timed event shapes", async () => {
    const user = await createTestUser("S2Temporal");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          await client.query(
            `
              INSERT INTO time."personal_event" (
                workspace_id,
                title,
                temporal_kind,
                event_date,
                starts_at,
                timezone,
                recorded_by_user_id,
                actor_kind
              )
              VALUES (
                $1,
                'Invalid mixed event',
                'date',
                DATE '2026-10-20',
                TIMESTAMPTZ '2026-10-20 09:00:00+08',
                'Asia/Manila',
                $2,
                'user'
              )
            `,
            [user.workspaceId, user.userId],
          );
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });

      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          const application = await createApplicationFixture(client, user);

          await client.query(
            `
              INSERT INTO career."application_event" (
                workspace_id,
                application_id,
                event_kind,
                title,
                temporal_kind,
                event_date,
                starts_at,
                timezone,
                recorded_by_user_id,
                actor_kind
              )
              VALUES (
                $1,
                $2,
                'interview',
                'Invalid mixed interview',
                'timed',
                DATE '2026-10-21',
                TIMESTAMPTZ '2026-10-21 09:00:00+08',
                'Asia/Manila',
                $3,
                'user'
              )
            `,
            [user.workspaceId, application.applicationId, user.userId],
          );
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });

      await runScopedTestAndRollback(user, async (transactionClient) => {
        const dateEventId = await insertPersonalEvent(transactionClient, user, {
          title: "All-day event",
          temporalKind: "date",
          eventDate: "2026-10-22",
        });

        const timedEventId = await insertPersonalEvent(
          transactionClient,
          user,
          {
            title: "Timed event",
            temporalKind: "timed",
            startsAt: "2026-10-22T09:00:00+08:00",
            endsAt: "2026-10-22T10:00:00+08:00",
            timezone: "Asia/Manila",
          },
        );

        const events = await transactionClient.query<{
          id: string;
          temporal_kind: string;
          event_date: string | null;
          starts_at: Date | null;
        }>(
          `
            SELECT
              id,
              temporal_kind,
              event_date::text,
              starts_at
            FROM time."personal_event"
            WHERE id = ANY($1::uuid[])
            ORDER BY temporal_kind
          `,
          [[dateEventId, timedEventId]],
        );

        expect(events.rows).toHaveLength(2);

        const dateEvent = events.rows.find(
          (event) => event.temporal_kind === "date",
        );

        const timedEvent = events.rows.find(
          (event) => event.temporal_kind === "timed",
        );

        expect(dateEvent?.event_date).toBe("2026-10-22");
        expect(dateEvent?.starts_at).toBeNull();

        expect(timedEvent?.event_date).toBeNull();
        expect(timedEvent?.starts_at).toBeInstanceOf(Date);
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("rejects a current application pointer that disagrees with resolved history", async () => {
    const user = await createTestUser("S2HistoryMismatch");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          const application = await createApplicationFixture(client, user);

          await insertStageHistory(client, user, {
            applicationId: application.applicationId,
            sequenceNo: 2,
            stage: "applied",
            effectiveDate: "2026-02-01",
          });

          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("resolves superseded stage history and keeps history append-only", async () => {
    const user = await createTestUser("S2HistoryCorrection");

    const client = await getDomainPool().connect();

    try {
      await runScopedTestAndRollback(user, async (transactionClient) => {
        const application = await createApplicationFixture(
          transactionClient,
          user,
        );

        const appliedHistoryId = await insertStageHistory(
          transactionClient,
          user,
          {
            applicationId: application.applicationId,
            sequenceNo: 2,
            stage: "applied",
            effectiveDate: "2026-02-01",
          },
        );

        const correctedHistoryId = await insertStageHistory(
          transactionClient,
          user,
          {
            applicationId: application.applicationId,
            sequenceNo: 3,
            stage: "screening",
            effectiveDate: "2026-02-01",
            supersedesHistoryId: appliedHistoryId,
          },
        );

        await transactionClient.query(
          `
            UPDATE career."job_application"
            SET
              current_history_id = $1,
              current_stage = 'screening',
              current_outcome = NULL
            WHERE
              workspace_id = $2
              AND id = $3
          `,
          [correctedHistoryId, user.workspaceId, application.applicationId],
        );

        await transactionClient.query("SET CONSTRAINTS ALL IMMEDIATE");

        const current = await transactionClient.query<{
          current_history_id: string;
          current_stage: string;
          current_outcome: string | null;
        }>(
          `
            SELECT
              current_history_id,
              current_stage,
              current_outcome
            FROM career."job_application"
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        expect(current.rows).toEqual([
          {
            current_history_id: correctedHistoryId,
            current_stage: "screening",
            current_outcome: null,
          },
        ]);

        await expect(
          transactionClient.query(
            `
              UPDATE career."application_stage_history"
              SET reason = 'rewrite old history'
              WHERE
                workspace_id = $1
                AND id = $2
            `,
            [user.workspaceId, correctedHistoryId],
          ),
        ).rejects.toMatchObject({
          code: "42501",
        });
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("rejects completed or cancelled events that remain the next-action pointer", async () => {
    const user = await createTestUser("S2NextAction");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          const application = await createApplicationFixture(client, user);

          const eventId = await insertApplicationEvent(client, user, {
            applicationId: application.applicationId,
            eventKind: "follow_up",
            title: "Follow up after interview",
            temporalKind: "date",
            eventDate: "2026-03-10",
          });

          await client.query(
            `
              UPDATE career."job_application"
              SET next_action_event_id = $1
              WHERE
                workspace_id = $2
                AND id = $3
            `,
            [eventId, user.workspaceId, application.applicationId],
          );

          await client.query(
            `
              UPDATE career."application_event"
              SET status = 'cancelled'
              WHERE
                workspace_id = $1
                AND id = $2
            `,
            [user.workspaceId, eventId],
          );

          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("advances notification generations only for reminder-relevant changes", async () => {
    const user = await createTestUser("S2Generation");

    try {
      await runScopedTestAndRollback(user, async (client) => {
        const eventId = await insertPersonalEvent(client, user, {
          title: "Generation test",
          temporalKind: "date",
          eventDate: "2026-04-01",
          description: "Original description",
        });

        const descriptiveUpdate = await client.query<{
          notification_generation: number;
          version: number;
        }>(
          `
            UPDATE time."personal_event"
            SET description = 'Updated description only'
            WHERE
              workspace_id = $1
              AND id = $2
            RETURNING
              notification_generation,
              version
          `,
          [user.workspaceId, eventId],
        );

        expect(descriptiveUpdate.rows).toEqual([
          {
            notification_generation: 1,
            version: 2,
          },
        ]);

        const schedulingUpdate = await client.query<{
          notification_generation: number;
          version: number;
        }>(
          `
            UPDATE time."personal_event"
            SET event_date = DATE '2026-04-02'
            WHERE
              workspace_id = $1
              AND id = $2
            RETURNING
              notification_generation,
              version
          `,
          [user.workspaceId, eventId],
        );

        expect(schedulingUpdate.rows).toEqual([
          {
            notification_generation: 2,
            version: 3,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("locks resume reference metadata after an application uses the version", async () => {
    const user = await createTestUser("S2Resume");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          const resumeVersionId = await insertResumeVersion(
            client,
            user,
            "Application Resume",
          );

          const beforeUse = await client.query<{
            notes: string | null;
          }>(
            `
              UPDATE career."resume_version"
              SET notes = 'Corrected before first use'
              WHERE
                workspace_id = $1
                AND id = $2
              RETURNING notes
            `,
            [user.workspaceId, resumeVersionId],
          );

          expect(beforeUse.rows[0]?.notes).toBe("Corrected before first use");

          await createApplicationFixture(client, user, {
            resumeVersionId,
          });

          await client.query(
            `
              UPDATE career."resume_version"
              SET notes = 'Silent historical rewrite'
              WHERE
                workspace_id = $1
                AND id = $2
            `,
            [user.workspaceId, resumeVersionId],
          );
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("blocks new S2 writes after the user lifecycle leaves active", async () => {
    const user = await createTestUser("S2Lifecycle");

    const client = await getDomainPool().connect();

    try {
      await expect(
        runScopedTransactionOnClient(client, user, async () => {
          await client.query(
            `
              UPDATE core."user_profile"
              SET
                lifecycle = 'deletion_pending',
                deletion_requested_at = clock_timestamp()
              WHERE user_id = $1
            `,
            [user.userId],
          );

          await insertPersonalEvent(client, user, {
            title: "Must be blocked",
            temporalKind: "date",
            eventDate: "2026-05-01",
          });
        }),
      ).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      client.release();

      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });

  it("projects scheduled source records into agenda without duplicate next actions", async () => {
    const user = await createTestUser("S2Agenda");

    try {
      await runScopedTestAndRollback(user, async (client) => {
        await client.query(
          `
            INSERT INTO core."module_preference" (
              workspace_id,
              module_key,
              enabled,
              agenda_visible
            )
            VALUES (
              $1,
              'career',
              false,
              false
            )
          `,
          [user.workspaceId],
        );

        const application = await createApplicationFixture(client, user);

        const followUpEventId = await insertApplicationEvent(client, user, {
          applicationId: application.applicationId,
          eventKind: "follow_up",
          title: "Send follow-up",
          temporalKind: "date",
          eventDate: "2026-06-01",
        });

        await client.query(
          `
            UPDATE career."job_application"
            SET next_action_event_id = $1
            WHERE
              workspace_id = $2
              AND id = $3
          `,
          [followUpEventId, user.workspaceId, application.applicationId],
        );

        const interviewEventId = await insertApplicationEvent(client, user, {
          applicationId: application.applicationId,
          eventKind: "interview",
          title: "Technical interview",
          temporalKind: "timed",
          startsAt: "2026-06-02T09:00:00+08:00",
          endsAt: "2026-06-02T10:00:00+08:00",
          timezone: "Asia/Manila",
        });

        const responseEventId = await insertApplicationEvent(client, user, {
          applicationId: application.applicationId,
          eventKind: "response",
          title: "Employer response",
          temporalKind: "date",
          eventDate: "2026-06-03",
        });

        const personalEventId = await insertPersonalEvent(client, user, {
          title: "Personal deadline",
          temporalKind: "date",
          eventDate: "2026-06-04",
        });

        const completedPersonalEventId = await insertPersonalEvent(
          client,
          user,
          {
            title: "Already completed",
            temporalKind: "date",
            eventDate: "2026-05-30",
            status: "completed",
            completedAt: "2026-05-30T12:00:00+08:00",
          },
        );

        await client.query("SET CONSTRAINTS ALL IMMEDIATE");

        const agenda = await client.query<{
          source_kind: string;
          source_id: string;
        }>(`
          SELECT
            source_kind,
            source_id
          FROM time."agenda_v"
        `);

        expect(agenda.rows).toHaveLength(3);

        expect(agenda.rows).toEqual(
          expect.arrayContaining([
            {
              source_kind: "application_event",
              source_id: followUpEventId,
            },
            {
              source_kind: "application_event",
              source_id: interviewEventId,
            },
            {
              source_kind: "personal_event",
              source_id: personalEventId,
            },
          ]),
        );

        expect(
          agenda.rows.some((row) => row.source_id === responseEventId),
        ).toBe(false);

        expect(
          agenda.rows.some((row) => row.source_id === completedPersonalEventId),
        ).toBe(false);

        const nextActionOccurrences = await client.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM time."agenda_v"
            WHERE
              source_kind = 'application_event'
              AND source_id = $1
          `,
          [followUpEventId],
        );

        expect(nextActionOccurrences.rows[0]?.count).toBe("1");

        expect(
          agenda.rows.some((row) => row.source_id === followUpEventId),
        ).toBe(true);

        await client.query(
          `
            UPDATE career."job_application"
            SET archived_at = clock_timestamp()
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [user.workspaceId, application.applicationId],
        );

        const careerAgendaAfterArchive = await client.query<{
          source_id: string;
        }>(`
          SELECT source_id
          FROM time."agenda_v"
          WHERE source_kind = 'application_event'
        `);

        expect(careerAgendaAfterArchive.rows).toEqual([]);

        const personalAgendaAfterArchive = await client.query<{
          source_id: string;
        }>(`
          SELECT source_id
          FROM time."agenda_v"
          WHERE source_kind = 'personal_event'
        `);

        expect(personalAgendaAfterArchive.rows).toEqual([
          {
            source_id: personalEventId,
          },
        ]);
      });
    } finally {
      await removeProvisionedTestUser(
        user,
        "pmp-s2-career-agenda-test-cleanup",
      );
    }
  });
});
