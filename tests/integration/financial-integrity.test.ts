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

type OpeningFixture = {
  accountId: string;
  actionId: string;
  revisionId: string;
  journalId: string;
  cashLedgerId: string;
  openingEquityLedgerId: string;
};

type OpeningPostingMode = "none" | "balanced" | "unbalanced";

function createTestIdentity(label: string): TestIdentity {
  const userId = randomUUID();

  return {
    userId,
    workspaceId: randomUUID(),
    name: `${label} User`,
    email: `${label.toLowerCase()}-${userId}@example.test`,
  };
}

async function createAuthUser(identity: TestIdentity) {
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

async function deleteAuthUsers(identities: TestIdentity[]) {
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
) {
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
) {
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

async function insertLedgerAccount(
  client: PoolClient,
  input: {
    workspaceId: string;
    code: string;
    name: string;
    kind:
      | "cash_asset"
      | "expense"
      | "income"
      | "opening_equity"
      | "adjustment_equity";
  },
) {
  const id = randomUUID();

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
      VALUES ($1, $2, $3, $4, $5, 'PHP')
    `,
    [
      id,
      input.workspaceId,
      input.code,
      input.name,
      input.kind,
    ],
  );

  return id;
}

async function createOpeningCashFixture(
  client: PoolClient,
  identity: TestIdentity,
  postingMode: OpeningPostingMode,
): Promise<OpeningFixture> {
  const cashLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    code: `cash-${randomUUID()}`,
    name: "Opening Test Cash",
    kind: "cash_asset",
  });

  const openingEquityLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    code: `opening-equity-${randomUUID()}`,
    name: "Opening Equity",
    kind: "opening_equity",
  });

  const accountId = randomUUID();
  const actionId = randomUUID();
  const revisionId = randomUUID();
  const journalId = randomUUID();
  const commandReceiptId = randomUUID();
  const clientCommandId = randomUUID();

  const openingDate = "2026-01-01";

  await client.query(
    `
      INSERT INTO finance."financial_account" (
        id,
        workspace_id,
        ledger_account_id,
        name,
        account_type,
        currency,
        opening_cutoff_date
      )
      VALUES (
        $1,
        $2,
        $3,
        'Opening Test Account',
        'checking',
        'PHP',
        $4
      )
    `,
    [
      accountId,
      identity.workspaceId,
      cashLedgerId,
      openingDate,
    ],
  );

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
        'finance.opening_cash',
        $4
      )
    `,
    [
      commandReceiptId,
      identity.workspaceId,
      clientCommandId,
      Buffer.alloc(32, 1),
    ],
  );

  /*
   * action.current_revision_id intentionally points at the not-yet-inserted
   * revision. Its FK is DEFERRABLE so the action/revision pair can be created
   * atomically using preallocated UUIDs.
   */
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
        'Opening test balance',
        $5,
        'user'
      )
    `,
    [
      actionId,
      identity.workspaceId,
      commandReceiptId,
      revisionId,
      identity.userId,
    ],
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
        'opening_cash',
        $5,
        'PHP',
        $6,
        'user'
      )
    `,
    [
      revisionId,
      identity.workspaceId,
      actionId,
      commandReceiptId,
      openingDate,
      identity.userId,
    ],
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
        $5,
        'PHP',
        'economic'
      )
    `,
    [
      journalId,
      identity.workspaceId,
      actionId,
      revisionId,
      openingDate,
    ],
  );

  if (postingMode !== "none") {
    const cashAmountMinor = 200_000;
    const equityAmountMinor =
      postingMode === "balanced" ? -200_000 : -199_999;

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
          cash_flow_kind,
          cash_flow_direction
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
          $7,
          'opening',
          'baseline'
        )
      `,
      [
        randomUUID(),
        identity.workspaceId,
        actionId,
        revisionId,
        journalId,
        cashLedgerId,
        cashAmountMinor,
      ],
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
          2,
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
        equityAmountMinor,
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

  await client.query(
    `
      UPDATE finance."financial_account"
      SET opening_action_id = $1
      WHERE
        workspace_id = $2
        AND id = $3
    `,
    [actionId, identity.workspaceId, accountId],
  );

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
        actionId,
        revisionId,
      }),
      identity.workspaceId,
      commandReceiptId,
    ],
  );

  return {
    accountId,
    actionId,
    revisionId,
    journalId,
    cashLedgerId,
    openingEquityLedgerId,
  };
}

async function beginScopedTestTransaction(
  client: PoolClient,
  identity: TestIdentity,
) {
  await client.query("BEGIN");

  await installScope(client, identity);
  await provisionCoreOwnership(client, identity);
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The connection may already be in an aborted transaction after an
    // intentionally rejected integrity check. ROLLBACK is still best-effort.
  }
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("S1 financial database integrity", () => {
  it("enforces two-user finance RLS isolation", async () => {
    const first = createTestIdentity("FinanceFirst");
    const second = createTestIdentity("FinanceSecond");
    const identities = [first, second];

    await createAuthUser(first);
    await createAuthUser(second);

    const client = await getDomainPool().connect();

    try {
      await client.query("BEGIN");

      await installScope(client, first);
      await provisionCoreOwnership(client, first);

      const firstLedgerId = await insertLedgerAccount(client, {
        workspaceId: first.workspaceId,
        code: `first-cash-${randomUUID()}`,
        name: "First User Cash",
        kind: "cash_asset",
      });

      await installScope(client, second);
      await provisionCoreOwnership(client, second);

      const secondLedgerId = await insertLedgerAccount(client, {
        workspaceId: second.workspaceId,
        code: `second-cash-${randomUUID()}`,
        name: "Second User Cash",
        kind: "cash_asset",
      });

      await installScope(client, first);

      const visibleLedgers = await client.query<{
        id: string;
        workspace_id: string;
      }>(`
        SELECT
          id,
          workspace_id
        FROM finance."ledger_account"
        ORDER BY id
      `);

      expect(visibleLedgers.rows).toEqual([
        {
          id: firstLedgerId,
          workspace_id: first.workspaceId,
        },
      ]);

      const foreignLedger = await client.query<{ id: string }>(
        `
          SELECT id
          FROM finance."ledger_account"
          WHERE id = $1
        `,
        [secondLedgerId],
      );

      expect(foreignLedger.rows).toEqual([]);

      await expect(
        client.query(
          `
            INSERT INTO finance."ledger_account" (
              workspace_id,
              code,
              name,
              kind,
              currency
            )
            VALUES (
              $1,
              $2,
              'Forbidden Cross-Workspace Ledger',
              'cash_asset',
              'PHP'
            )
          `,
          [
            second.workspaceId,
            `forbidden-${randomUUID()}`,
          ],
        ),
      ).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers(identities);
    }
  });

  it("rejects a finalized journal with no postings", async () => {
    const identity = createTestIdentity("EmptyJournal");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createOpeningCashFixture(
        client,
        identity,
        "none",
      );

      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("rejects a finalized journal whose postings do not sum to zero", async () => {
    const identity = createTestIdentity("UnbalancedJournal");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createOpeningCashFixture(
        client,
        identity,
        "unbalanced",
      );

      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts balanced opening cash as baseline equity and never income", async () => {
    const identity = createTestIdentity("OpeningCash");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const fixture = await createOpeningCashFixture(
        client,
        identity,
        "balanced",
      );

      /*
       * Force every deferred FK and constraint trigger now rather than relying
       * on COMMIT. The transaction is intentionally rolled back after the
       * assertions so integration tests leave no financial history behind.
       */
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const journal = await client.query<{
        state: string;
        posting_count: string;
        signed_total: string;
      }>(
        `
          SELECT
            j.state,
            count(p.id)::text AS posting_count,
            COALESCE(sum(p.amount_minor), 0)::text AS signed_total
          FROM finance."journal" AS j
          LEFT JOIN finance."posting" AS p
            ON p.workspace_id = j.workspace_id
            AND p.action_revision_id = j.action_revision_id
            AND p.journal_id = j.id
          WHERE
            j.workspace_id = $1
            AND j.id = $2
          GROUP BY j.id
        `,
        [identity.workspaceId, fixture.journalId],
      );

      expect(journal.rows).toEqual([
        {
          state: "posted",
          posting_count: "2",
          signed_total: "0",
        },
      ]);

      const postings = await client.query<{
        ledger_kind: string;
        amount_minor: string;
        cash_flow_kind: string;
        cash_flow_direction: string;
        income_class: string;
        expense_class: string;
      }>(
        `
          SELECT
            l.kind AS ledger_kind,
            p.amount_minor::text AS amount_minor,
            p.cash_flow_kind,
            p.cash_flow_direction,
            p.income_class,
            p.expense_class
          FROM finance."posting" AS p
          INNER JOIN finance."ledger_account" AS l
            ON l.workspace_id = p.workspace_id
            AND l.id = p.ledger_account_id
          WHERE
            p.workspace_id = $1
            AND p.action_revision_id = $2
          ORDER BY p.line_no
        `,
        [identity.workspaceId, fixture.revisionId],
      );

      expect(postings.rows).toEqual([
        {
          ledger_kind: "cash_asset",
          amount_minor: "200000",
          cash_flow_kind: "opening",
          cash_flow_direction: "baseline",
          income_class: "none",
          expense_class: "none",
        },
        {
          ledger_kind: "opening_equity",
          amount_minor: "-200000",
          cash_flow_kind: "none",
          cash_flow_direction: "none",
          income_class: "none",
          expense_class: "none",
        },
      ]);

      const incomePostingCount = await client.query<{
        count: string;
      }>(
        `
          SELECT count(*)::text AS count
          FROM finance."posting" AS p
          INNER JOIN finance."ledger_account" AS l
            ON l.workspace_id = p.workspace_id
            AND l.id = p.ledger_account_id
          WHERE
            p.workspace_id = $1
            AND p.action_revision_id = $2
            AND l.kind = 'income'
        `,
        [identity.workspaceId, fixture.revisionId],
      );

      expect(incomePostingCount.rows[0]?.count).toBe("0");

      const account = await client.query<{
        opening_action_id: string | null;
      }>(
        `
          SELECT opening_action_id
          FROM finance."financial_account"
          WHERE
            workspace_id = $1
            AND id = $2
        `,
        [identity.workspaceId, fixture.accountId],
      );

      expect(account.rows[0]?.opening_action_id).toBe(
        fixture.actionId,
      );
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });
});