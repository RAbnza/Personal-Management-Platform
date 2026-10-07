import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeRuntimeDatabasePools,
  getAuthPool,
  getDomainPool,
} from "@/platform/db/pools";

type TestIdentity = {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
};

type LedgerKind =
  "cash_asset" | "opening_equity" | "debt_liability" | "payment_clearing_asset";

type DebtFixture = {
  debtId: string;
  liabilityLedgerId: string;
};

type OpeningDebtFixture = DebtFixture & {
  actionId: string;
  revisionId: string;
  journalId: string;
  openingEquityLedgerId: string;
  amountMinor: number;
};

type ScheduleFixture = {
  obligationId: string;
  scheduleVersionId: string;
  installmentId: string;
};

function createTestIdentity(label: string): TestIdentity {
  const userId = randomUUID();

  return {
    userId,
    workspaceId: randomUUID(),
    name: `${label} User`,
    email: `${label.toLowerCase()}-${userId}@example.test`,
  };
}

async function createAuthUser(identity: TestIdentity): Promise<void> {
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
    [identity.userId, identity.name, identity.email],
  );
}

async function deleteAuthUsers(identities: TestIdentity[]): Promise<void> {
  await getAuthPool().query(
    `
      DELETE FROM auth."user"
      WHERE id = ANY($1::uuid[])
    `,
    [identities.map((identity) => identity.userId)],
  );
}

async function installScope(
  client: PoolClient,
  identity: TestIdentity,
): Promise<void> {
  await client.query(
    `
      SELECT
        set_config('app.user_id', $1, true),
        set_config('app.workspace_id', $2, true)
    `,
    [identity.userId, identity.workspaceId],
  );
}

async function provisionCoreOwnership(
  client: PoolClient,
  identity: TestIdentity,
): Promise<void> {
  await client.query(
    `
      INSERT INTO core."user_profile" (
        user_id,
        display_name
      )
      VALUES ($1, $2)
    `,
    [identity.userId, identity.name],
  );

  await client.query(
    `
      INSERT INTO core."workspace" (
        id,
        owner_user_id
      )
      VALUES ($1, $2)
    `,
    [identity.workspaceId, identity.userId],
  );

  await client.query(
    `
      INSERT INTO core."workspace_preference" (
        workspace_id
      )
      VALUES ($1)
    `,
    [identity.workspaceId],
  );
}

async function beginScopedTestTransaction(
  client: PoolClient,
  identity: TestIdentity,
): Promise<void> {
  await client.query("BEGIN");

  await installScope(client, identity);
  await provisionCoreOwnership(client, identity);
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // An intentionally rejected database invariant may already have aborted
    // the transaction. ROLLBACK remains best-effort cleanup.
  }
}

async function insertLedgerAccount(
  client: PoolClient,
  input: {
    workspaceId: string;
    kind: LedgerKind;
    name?: string;
  },
): Promise<string> {
  const ledgerId = randomUUID();

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
        $5,
        'PHP'
      )
    `,
    [
      ledgerId,
      input.workspaceId,
      `${input.kind}:${ledgerId}`,
      input.name ?? input.kind,
      input.kind,
    ],
  );

  return ledgerId;
}

async function createDebt(
  client: PoolClient,
  identity: TestIdentity,
  input?: {
    openingCutoffDate?: string | null;
    breakdownStatus?: "known" | "partial" | "unknown";
    liabilityLedgerId?: string;
  },
): Promise<DebtFixture> {
  const debtId = randomUUID();

  const liabilityLedgerId =
    input?.liabilityLedgerId ??
    (await insertLedgerAccount(client, {
      workspaceId: identity.workspaceId,
      kind: "debt_liability",
      name: "Test Debt Liability",
    }));

  await client.query(
    `
      INSERT INTO finance."debt" (
        id,
        workspace_id,
        name,
        lender_name,
        debt_type,
        currency,
        liability_ledger_account_id,
        start_date,
        opening_cutoff_date,
        breakdown_status,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        'Test Debt',
        'Test Lender',
        'personal_loan',
        'PHP',
        $3,
        '2026-01-01',
        $4,
        $5,
        $6,
        'user'
      )
    `,
    [
      debtId,
      identity.workspaceId,
      liabilityLedgerId,
      input?.openingCutoffDate ?? null,
      input?.breakdownStatus ?? "unknown",
      identity.userId,
    ],
  );

  return {
    debtId,
    liabilityLedgerId,
  };
}

async function createCommandReceipt(
  client: PoolClient,
  identity: TestIdentity,
  commandType: string,
): Promise<string> {
  const receiptId = randomUUID();

  await client.query(
    `
      INSERT INTO core."command_receipt" (
        id,
        workspace_id,
        client_command_id,
        command_type,
        payload_hash
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5
      )
    `,
    [
      receiptId,
      identity.workspaceId,
      randomUUID(),
      commandType,
      Buffer.alloc(32, 7),
    ],
  );

  return receiptId;
}

async function completeCommandReceipt(
  client: PoolClient,
  input: {
    workspaceId: string;
    receiptId: string;
    actionId: string;
    revisionId: string;
  },
): Promise<void> {
  await client.query(
    `
      UPDATE core."command_receipt"
      SET
        state = 'completed',
        result_json = $1::jsonb,
        completed_at = clock_timestamp()
      WHERE
        workspace_id = $2
        AND id = $3
    `,
    [
      JSON.stringify({
        actionId: input.actionId,
        revisionId: input.revisionId,
      }),
      input.workspaceId,
      input.receiptId,
    ],
  );
}

async function createOpeningDebtFixture(
  client: PoolClient,
  identity: TestIdentity,
  input?: {
    amountMinor?: number;
    breakdownStatus?: "known" | "partial" | "unknown";
  },
): Promise<OpeningDebtFixture> {
  const amountMinor = input?.amountMinor ?? 640_000;

  const breakdownStatus = input?.breakdownStatus ?? "unknown";

  const debt = await createDebt(client, identity, {
    openingCutoffDate: "2026-06-30",
    breakdownStatus,
  });

  const openingEquityLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    kind: "opening_equity",
    name: "Opening Debt Equity",
  });

  const actionId = randomUUID();
  const revisionId = randomUUID();
  const journalId = randomUUID();

  const receiptId = await createCommandReceipt(
    client,
    identity,
    "finance.opening_debt",
  );

  await client.query(
    `
      INSERT INTO finance."financial_action" (
        id,
        workspace_id,
        original_command_receipt_id,
        current_revision_id,
        description,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Opening debt baseline',
        $5,
        'user'
      )
    `,
    [actionId, identity.workspaceId, receiptId, revisionId, identity.userId],
  );

  await client.query(
    `
      INSERT INTO finance."action_revision" (
        id,
        workspace_id,
        action_id,
        revision_no,
        command_receipt_id,
        change_kind,
        action_kind,
        primary_effective_date,
        currency,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        1,
        $4,
        'create',
        'opening_debt',
        '2026-06-30',
        'PHP',
        $5,
        'user'
      )
    `,
    [revisionId, identity.workspaceId, actionId, receiptId, identity.userId],
  );

  await client.query(
    `
      INSERT INTO finance."debt_action_link" (
        workspace_id,
        action_id,
        action_revision_id,
        debt_id,
        purpose
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'opening'
      )
    `,
    [identity.workspaceId, actionId, revisionId, debt.debtId],
  );

  await client.query(
    `
      INSERT INTO finance."journal" (
        id,
        workspace_id,
        action_id,
        action_revision_id,
        sequence_no,
        effective_date,
        currency,
        role
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        1,
        '2026-06-30',
        'PHP',
        'economic'
      )
    `,
    [journalId, identity.workspaceId, actionId, revisionId],
  );

  await client.query(
    `
      INSERT INTO finance."posting" (
        id,
        workspace_id,
        action_id,
        action_revision_id,
        journal_id,
        ledger_account_id,
        currency,
        line_no,
        amount_minor
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'PHP',
        1,
        $7
      )
    `,
    [
      randomUUID(),
      identity.workspaceId,
      actionId,
      revisionId,
      journalId,
      openingEquityLedgerId,
      amountMinor,
    ],
  );

  if (breakdownStatus === "partial") {
    await client.query(
      `
        INSERT INTO finance."posting" (
          id,
          workspace_id,
          action_id,
          action_revision_id,
          journal_id,
          ledger_account_id,
          currency,
          line_no,
          amount_minor,
          liability_component
        )
        VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'PHP',
            2,
            $7,
            'principal'
          ),
          (
            $8,
            $2,
            $3,
            $4,
            $5,
            $6,
            'PHP',
            3,
            $9,
            'unclassified'
          )
      `,
      [
        randomUUID(),
        identity.workspaceId,
        actionId,
        revisionId,
        journalId,
        debt.liabilityLedgerId,
        -400_000,
        randomUUID(),
        -(amountMinor - 400_000),
      ],
    );
  } else {
    await client.query(
      `
        INSERT INTO finance."posting" (
          id,
          workspace_id,
          action_id,
          action_revision_id,
          journal_id,
          ledger_account_id,
          currency,
          line_no,
          amount_minor,
          liability_component
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'PHP',
          2,
          $7,
          $8
        )
      `,
      [
        randomUUID(),
        identity.workspaceId,
        actionId,
        revisionId,
        journalId,
        debt.liabilityLedgerId,
        -amountMinor,
        breakdownStatus === "known" ? "principal" : "unclassified",
      ],
    );
  }

  await client.query(
    `
      UPDATE finance."journal"
      SET
        state = 'posted',
        finalized_at = clock_timestamp()
      WHERE
        workspace_id = $1
        AND id = $2
    `,
    [identity.workspaceId, journalId],
  );

  await client.query(
    `
      UPDATE finance."action_revision"
      SET
        state = 'posted',
        finalized_at = clock_timestamp()
      WHERE
        workspace_id = $1
        AND id = $2
    `,
    [identity.workspaceId, revisionId],
  );

  await completeCommandReceipt(client, {
    workspaceId: identity.workspaceId,
    receiptId,
    actionId,
    revisionId,
  });

  return {
    ...debt,

    actionId,
    revisionId,
    journalId,

    openingEquityLedgerId,

    amountMinor,
  };
}

async function createBuildingOpeningAction(
  client: PoolClient,
  identity: TestIdentity,
): Promise<{
  actionId: string;
  revisionId: string;
}> {
  const actionId = randomUUID();
  const revisionId = randomUUID();

  const receiptId = await createCommandReceipt(
    client,
    identity,
    "finance.opening_debt",
  );

  await client.query(
    `
      INSERT INTO finance."financial_action" (
        id,
        workspace_id,
        original_command_receipt_id,
        current_revision_id,
        description,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Second opening debt baseline',
        $5,
        'user'
      )
    `,
    [actionId, identity.workspaceId, receiptId, revisionId, identity.userId],
  );

  await client.query(
    `
      INSERT INTO finance."action_revision" (
        id,
        workspace_id,
        action_id,
        revision_no,
        command_receipt_id,
        change_kind,
        action_kind,
        primary_effective_date,
        currency,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        1,
        $4,
        'create',
        'opening_debt',
        '2026-06-30',
        'PHP',
        $5,
        'user'
      )
    `,
    [revisionId, identity.workspaceId, actionId, receiptId, identity.userId],
  );

  return {
    actionId,
    revisionId,
  };
}

async function createFinalizedSchedule(
  client: PoolClient,
  identity: TestIdentity,
  debt: DebtFixture,
  input?: {
    openingSatisfiedMinor?: number;
  },
): Promise<ScheduleFixture> {
  const obligationId = randomUUID();
  const scheduleVersionId = randomUUID();
  const installmentId = randomUUID();

  await client.query(
    `
      INSERT INTO finance."debt_obligation" (
        id,
        workspace_id,
        debt_id,
        external_label,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        'Installment 1',
        $4,
        'user'
      )
    `,
    [obligationId, identity.workspaceId, debt.debtId, identity.userId],
  );

  /*
   * The current pointer intentionally references the not-yet-created schedule.
   * The D6a FK is DEFERRABLE so both can be assembled atomically.
   */
  await client.query(
    `
      UPDATE finance."debt"
      SET current_schedule_version_id = $1
      WHERE
        workspace_id = $2
        AND id = $3
    `,
    [scheduleVersionId, identity.workspaceId, debt.debtId],
  );

  await client.query(
    `
      INSERT INTO finance."debt_schedule_version" (
        id,
        workspace_id,
        debt_id,
        version_no,
        effective_date,
        revision_kind,
        reason,
        frequency,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        1,
        '2026-07-01',
        'initial',
        'Initial imported schedule.',
        'manual',
        $4,
        'user'
      )
    `,
    [scheduleVersionId, identity.workspaceId, debt.debtId, identity.userId],
  );

  await client.query(
    `
      INSERT INTO finance."scheduled_installment" (
        id,
        workspace_id,
        debt_id,
        schedule_version_id,
        obligation_id,
        sequence_no,
        due_date,
        contractual_minor,
        opening_satisfied_minor
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        1,
        '2026-07-31',
        100000,
        $6
      )
    `,
    [
      installmentId,
      identity.workspaceId,
      debt.debtId,
      scheduleVersionId,
      obligationId,
      input?.openingSatisfiedMinor ?? 0,
    ],
  );

  await client.query(
    `
      UPDATE finance."debt_schedule_version"
      SET
        state = 'finalized',
        finalized_at = clock_timestamp()
      WHERE
        workspace_id = $1
        AND id = $2
    `,
    [identity.workspaceId, scheduleVersionId],
  );

  return {
    obligationId,
    scheduleVersionId,
    installmentId,
  };
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("D6a debt database integrity", () => {
  it("enforces two-user debt RLS isolation", async () => {
    const first = createTestIdentity("DebtFirst");
    const second = createTestIdentity("DebtSecond");

    await createAuthUser(first);
    await createAuthUser(second);

    const client = await getDomainPool().connect();

    try {
      await client.query("BEGIN");

      await installScope(client, first);
      await provisionCoreOwnership(client, first);

      const firstDebt = await createDebt(client, first);

      await installScope(client, second);
      await provisionCoreOwnership(client, second);

      const secondDebt = await createDebt(client, second);

      await installScope(client, first);

      const visible = await client.query<{
        id: string;
        workspace_id: string;
      }>(
        `
          SELECT
            id,
            workspace_id
          FROM finance."debt"
          ORDER BY id
        `,
      );

      expect(visible.rows).toEqual([
        {
          id: firstDebt.debtId,
          workspace_id: first.workspaceId,
        },
      ]);

      const foreign = await client.query<{ id: string }>(
        `
          SELECT id
          FROM finance."debt"
          WHERE id = $1
        `,
        [secondDebt.debtId],
      );

      expect(foreign.rows).toEqual([]);

      const foreignLiabilityLedgerId = randomUUID();

      await expect(
        client.query(
          `
            INSERT INTO finance."debt" (
              workspace_id,
              name,
              lender_name,
              debt_type,
              currency,
              liability_ledger_account_id,
              start_date,
              breakdown_status,
              recorded_by_user_id,
              actor_kind
            )
            VALUES (
              $1,
              'Forbidden Debt',
              'Foreign Lender',
              'personal_loan',
              'PHP',
              $2,
              '2026-01-01',
              'unknown',
              $3,
              'user'
            )
          `,
          [second.workspaceId, foreignLiabilityLedgerId, first.userId],
        ),
      ).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([first, second]);
    }
  });

  it("requires a debt liability ledger to use debt_liability kind", async () => {
    const identity = createTestIdentity("DebtLedgerKind");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const cashLedgerId = await insertLedgerAccount(client, {
        workspaceId: identity.workspaceId,
        kind: "cash_asset",
        name: "Not A Liability",
      });

      await expect(
        createDebt(client, identity, {
          liabilityLedgerId: cashLedgerId,
        }),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts an imported opening debt as opening equity against recognized liability with no cash flow", async () => {
    const identity = createTestIdentity("OpeningDebt");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const fixture = await createOpeningDebtFixture(client, identity);

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const postings = await client.query<{
        ledger_kind: string;
        amount_minor: string;
        cash_flow_kind: string;
        cash_flow_direction: string;
        liability_component: string | null;
      }>(
        `
          SELECT
            ledger.kind AS ledger_kind,
            posting.amount_minor::text AS amount_minor,
            posting.cash_flow_kind,
            posting.cash_flow_direction,
            posting.liability_component
          FROM finance."posting" AS posting
          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id
          WHERE
            posting.workspace_id = $1
            AND posting.action_revision_id = $2
          ORDER BY posting.line_no
        `,
        [identity.workspaceId, fixture.revisionId],
      );

      expect(postings.rows).toEqual([
        {
          ledger_kind: "opening_equity",
          amount_minor: "640000",
          cash_flow_kind: "none",
          cash_flow_direction: "none",
          liability_component: null,
        },
        {
          ledger_kind: "debt_liability",
          amount_minor: "-640000",
          cash_flow_kind: "none",
          cash_flow_direction: "none",
          liability_component: "unclassified",
        },
      ]);

      const cashPostingCount = await client.query<{
        count: string;
      }>(
        `
          SELECT count(*)::text AS count
          FROM finance."posting" AS posting
          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id
          WHERE
            posting.workspace_id = $1
            AND posting.action_revision_id = $2
            AND ledger.kind = 'cash_asset'
        `,
        [identity.workspaceId, fixture.revisionId],
      );

      expect(cashPostingCount.rows[0]?.count).toBe("0");

      const recognized = await client.query<{
        recognized_liability_minor: string;
      }>(
        `
          SELECT
            (-COALESCE(sum(posting.amount_minor), 0))::text
              AS recognized_liability_minor
          FROM finance."posting" AS posting
          INNER JOIN finance."journal" AS journal
            ON journal.workspace_id = posting.workspace_id
            AND journal.action_revision_id = posting.action_revision_id
            AND journal.id = posting.journal_id
          WHERE
            posting.workspace_id = $1
            AND posting.ledger_account_id = $2
            AND journal.state = 'posted'
        `,
        [identity.workspaceId, fixture.liabilityLedgerId],
      );

      expect(recognized.rows[0]?.recognized_liability_minor).toBe("640000");
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("rejects a second independent opening action for the same debt", async () => {
    const identity = createTestIdentity("DuplicateOpeningDebt");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const fixture = await createOpeningDebtFixture(client, identity);

      /*
       * First establish a fully valid opening baseline.
       */
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      /*
       * Restore deferred mode so the intentionally incomplete second financial
       * action does not invoke unrelated commit checks while we target the
       * opening-action identity invariant specifically.
       */
      await client.query("SET CONSTRAINTS ALL DEFERRED");

      const second = await createBuildingOpeningAction(client, identity);

      await client.query(
        `
          INSERT INTO finance."debt_action_link" (
            workspace_id,
            action_id,
            action_revision_id,
            debt_id,
            purpose
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'opening'
          )
        `,
        [
          identity.workspaceId,
          second.actionId,
          second.revisionId,
          fixture.debtId,
        ],
      );

      await expect(
        client.query(
          'SET CONSTRAINTS "finance"."debt_opening_action_identity_integrity" IMMEDIATE',
        ),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringMatching(
          /only one logical opening financial action/i,
        ),
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("finalizes an imported debt schedule and prevents finalized schedule rewriting", async () => {
    const identity = createTestIdentity("DebtSchedule");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const debt = await createDebt(client, identity, {
        openingCutoffDate: "2026-06-30",
      });

      const schedule = await createFinalizedSchedule(client, identity, debt, {
        openingSatisfiedMinor: 100_000,
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const stored = await client.query<{
        current_schedule_version_id: string | null;
        schedule_state: string;
        opening_satisfied_minor: string;
      }>(
        `
          SELECT
            debt.current_schedule_version_id,
            schedule.state AS schedule_state,
            installment.opening_satisfied_minor::text
              AS opening_satisfied_minor
          FROM finance."debt" AS debt
          INNER JOIN finance."debt_schedule_version" AS schedule
            ON schedule.workspace_id = debt.workspace_id
            AND schedule.debt_id = debt.id
            AND schedule.id = debt.current_schedule_version_id
          INNER JOIN finance."scheduled_installment" AS installment
            ON installment.workspace_id = schedule.workspace_id
            AND installment.debt_id = schedule.debt_id
            AND installment.schedule_version_id = schedule.id
          WHERE
            debt.workspace_id = $1
            AND debt.id = $2
        `,
        [identity.workspaceId, debt.debtId],
      );

      expect(stored.rows).toEqual([
        {
          current_schedule_version_id: schedule.scheduleVersionId,
          schedule_state: "finalized",
          opening_satisfied_minor: "100000",
        },
      ]);

      await client.query("SAVEPOINT finalized_schedule_rewrite");

      let updateError: unknown;

      try {
        await client.query(
          `
            UPDATE finance."debt_schedule_version"
            SET reason = 'Silently rewritten reason.'
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [identity.workspaceId, schedule.scheduleVersionId],
        );
      } catch (error) {
        updateError = error;
      }

      await client.query("ROLLBACK TO SAVEPOINT finalized_schedule_rewrite");

      await client.query("RELEASE SAVEPOINT finalized_schedule_rewrite");

      expect(updateError).toMatchObject({
        code: "23514",
        message: expect.stringMatching(/finalized debt schedule.*immutable/i),
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("rejects opening-satisfied schedule amounts for a newly originated debt", async () => {
    const identity = createTestIdentity("NewDebtOpeningSatisfied");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const debt = await createDebt(client, identity, {
        openingCutoffDate: null,
      });

      await createFinalizedSchedule(client, identity, debt, {
        openingSatisfiedMinor: 50_000,
      });

      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({
        code: "23514",
        message: expect.stringMatching(
          /newly originated debt schedules cannot contain opening-satisfied amounts/i,
        ),
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("does not allow a debt to close while recognized liability remains", async () => {
    const identity = createTestIdentity("DebtCloseResidual");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const fixture = await createOpeningDebtFixture(client, identity);

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      await client.query("SAVEPOINT close_with_residual");

      let updateError: unknown;

      try {
        await client.query(
          `
            UPDATE finance."debt"
            SET
              lifecycle = 'settled',
              closed_at = clock_timestamp()
            WHERE
              workspace_id = $1
              AND id = $2
          `,
          [identity.workspaceId, fixture.debtId],
        );
      } catch (error) {
        updateError = error;
      }

      await client.query("ROLLBACK TO SAVEPOINT close_with_residual");

      await client.query("RELEASE SAVEPOINT close_with_residual");

      expect(updateError).toMatchObject({
        code: "23514",
        message: expect.stringMatching(
          /cannot close while recognized liability remains/i,
        ),
      });

      const debt = await client.query<{
        lifecycle: string;
        closed_at: Date | null;
      }>(
        `
          SELECT
            lifecycle,
            closed_at
          FROM finance."debt"
          WHERE
            workspace_id = $1
            AND id = $2
        `,
        [identity.workspaceId, fixture.debtId],
      );

      expect(debt.rows).toEqual([
        {
          lifecycle: "active",
          closed_at: null,
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });
});
