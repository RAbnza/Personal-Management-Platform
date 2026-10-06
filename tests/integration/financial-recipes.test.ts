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

type FinancialAccountFixture = {
  accountId: string;
  cashLedgerId: string;
};

type ActionFixture = {
  actionId: string;
  revisionId: string;
  receiptId: string;
};

type IncomeFixture = ActionFixture & {
  journalId: string;
  cashPostingId: string;
  incomePostingId: string;
  incomeLedgerId: string;
  amountMinor: number;
  effectiveDate: string;
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
    // Best-effort cleanup after intentionally rejected constraints.
  }
}

async function insertLedgerAccount(
  client: PoolClient,
  input: {
    workspaceId: string;
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
      `${input.kind}-${randomUUID()}`,
      input.name,
      input.kind,
    ],
  );

  return id;
}

async function createFinancialAccount(
  client: PoolClient,
  identity: TestIdentity,
  input: {
    name: string;
    openingCutoffDate: string;
  },
): Promise<FinancialAccountFixture> {
  const cashLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    name: `${input.name} Cash Ledger`,
    kind: "cash_asset",
  });

  const accountId = randomUUID();

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
        $4,
        'checking',
        'PHP',
        $5
      )
    `,
    [
      accountId,
      identity.workspaceId,
      cashLedgerId,
      input.name,
      input.openingCutoffDate,
    ],
  );

  return {
    accountId,
    cashLedgerId,
  };
}

async function insertCategory(
  client: PoolClient,
  input: {
    workspaceId: string;
    name: string;
    kind: "income" | "expense";
  },
) {
  const id = randomUUID();

  await client.query(
    `
      INSERT INTO core."category" (
        id,
        workspace_id,
        kind,
        name
      )
      VALUES ($1, $2, $3, $4)
    `,
    [
      id,
      input.workspaceId,
      input.kind,
      input.name,
    ],
  );

  return id;
}

async function createCommandReceipt(
  client: PoolClient,
  input: {
    workspaceId: string;
    commandType: string;
  },
) {
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
      input.workspaceId,
      randomUUID(),
      input.commandType,
      Buffer.alloc(32, 1),
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
) {
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

async function createInitialAction(
  client: PoolClient,
  identity: TestIdentity,
  input: {
    actionKind:
      | "opening_cash"
      | "income"
      | "expense"
      | "transfer"
      | "standalone_fee";
    effectiveDate: string;
    description: string;
  },
): Promise<ActionFixture> {
  const actionId = randomUUID();
  const revisionId = randomUUID();

  const receiptId = await createCommandReceipt(client, {
    workspaceId: identity.workspaceId,
    commandType: `finance.${input.actionKind}`,
  });

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
        $5,
        $6,
        'user'
      )
    `,
    [
      actionId,
      identity.workspaceId,
      receiptId,
      revisionId,
      input.description,
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
        $5,
        $6,
        'PHP',
        $7,
        'user'
      )
    `,
    [
      revisionId,
      identity.workspaceId,
      actionId,
      receiptId,
      input.actionKind,
      input.effectiveDate,
      identity.userId,
    ],
  );

  return {
    actionId,
    revisionId,
    receiptId,
  };
}

async function createReplacementRevision(
  client: PoolClient,
  identity: TestIdentity,
  input: {
    actionId: string;
    previousRevisionId: string;
    effectiveDate: string;
    actionKind:
      | "opening_cash"
      | "income"
      | "expense"
      | "transfer"
      | "standalone_fee";
  },
): Promise<ActionFixture> {
  const revisionId = randomUUID();

  const receiptId = await createCommandReceipt(client, {
    workspaceId: identity.workspaceId,
    commandType: `finance.${input.actionKind}.replace`,
  });

  await client.query(
    `
      INSERT INTO finance."action_revision" (
        id,
        workspace_id,
        action_id,
        revision_no,
        previous_revision_id,
        command_receipt_id,
        change_kind,
        action_kind,
        primary_effective_date,
        currency,
        reason,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        2,
        $4,
        $5,
        'replace',
        $6,
        $7,
        'PHP',
        'Integration-test correction',
        $8,
        'user'
      )
    `,
    [
      revisionId,
      identity.workspaceId,
      input.actionId,
      input.previousRevisionId,
      receiptId,
      input.actionKind,
      input.effectiveDate,
      identity.userId,
    ],
  );

  return {
    actionId: input.actionId,
    revisionId,
    receiptId,
  };
}

async function insertJournal(
  client: PoolClient,
  input: {
    workspaceId: string;
    actionId: string;
    revisionId: string;
    sequenceNo: number;
    effectiveDate: string;
    role: "economic" | "reversal";
    reversesJournalId?: string;
  },
) {
  const journalId = randomUUID();

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
        role,
        reverses_journal_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'PHP',
        $7,
        $8
      )
    `,
    [
      journalId,
      input.workspaceId,
      input.actionId,
      input.revisionId,
      input.sequenceNo,
      input.effectiveDate,
      input.role,
      input.reversesJournalId ?? null,
    ],
  );

  return journalId;
}

async function insertPosting(
  client: PoolClient,
  input: {
    workspaceId: string;
    actionId: string;
    revisionId: string;
    journalId: string;
    ledgerAccountId: string;
    lineNo: number;
    amountMinor: number;
    categoryId?: string;
    expenseClass?: string;
    incomeClass?: string;
    cashFlowKind?: string;
    cashFlowDirection?: string;
    reversesPostingId?: string;
  },
) {
  const postingId = randomUUID();

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
        category_id,
        expense_class,
        income_class,
        cash_flow_kind,
        cash_flow_direction,
        reverses_posting_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'PHP',
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14
      )
    `,
    [
      postingId,
      input.workspaceId,
      input.actionId,
      input.revisionId,
      input.journalId,
      input.ledgerAccountId,
      input.lineNo,
      input.amountMinor,
      input.categoryId ?? null,
      input.expenseClass ?? "none",
      input.incomeClass ?? "none",
      input.cashFlowKind ?? "none",
      input.cashFlowDirection ?? "none",
      input.reversesPostingId ?? null,
    ],
  );

  return postingId;
}

async function finalizeJournal(
  client: PoolClient,
  workspaceId: string,
  journalId: string,
) {
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
    [workspaceId, journalId],
  );
}

async function finalizeRevision(
  client: PoolClient,
  workspaceId: string,
  revisionId: string,
) {
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
    [workspaceId, revisionId],
  );
}

async function createIncomeAction(
  client: PoolClient,
  identity: TestIdentity,
  input: {
    account: FinancialAccountFixture;
    effectiveDate: string;
    amountMinor: number;
  },
): Promise<IncomeFixture> {
  const incomeLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    name: "Income Ledger",
    kind: "income",
  });

  const action = await createInitialAction(
    client,
    identity,
    {
      actionKind: "income",
      effectiveDate: input.effectiveDate,
      description: "Integration test income",
    },
  );

  await client.query(
    `
      INSERT INTO finance."receipt_detail" (
        workspace_id,
        action_id,
        action_revision_id,
        receiving_account_id,
        actual_received_minor,
        source_label
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'Integration test income'
      )
    `,
    [
      identity.workspaceId,
      action.actionId,
      action.revisionId,
      input.account.accountId,
      input.amountMinor,
    ],
  );

  const journalId = await insertJournal(client, {
    workspaceId: identity.workspaceId,
    actionId: action.actionId,
    revisionId: action.revisionId,
    sequenceNo: 1,
    effectiveDate: input.effectiveDate,
    role: "economic",
  });

  const cashPostingId = await insertPosting(client, {
    workspaceId: identity.workspaceId,
    actionId: action.actionId,
    revisionId: action.revisionId,
    journalId,
    ledgerAccountId: input.account.cashLedgerId,
    lineNo: 1,
    amountMinor: input.amountMinor,
    cashFlowKind: "income",
    cashFlowDirection: "in",
  });

  const incomePostingId = await insertPosting(client, {
    workspaceId: identity.workspaceId,
    actionId: action.actionId,
    revisionId: action.revisionId,
    journalId,
    ledgerAccountId: incomeLedgerId,
    lineNo: 2,
    amountMinor: -input.amountMinor,
    incomeClass: "earned",
  });

  await finalizeJournal(
    client,
    identity.workspaceId,
    journalId,
  );

  await finalizeRevision(
    client,
    identity.workspaceId,
    action.revisionId,
  );

  await completeCommandReceipt(client, {
    workspaceId: identity.workspaceId,
    receiptId: action.receiptId,
    actionId: action.actionId,
    revisionId: action.revisionId,
  });

  return {
    ...action,
    journalId,
    cashPostingId,
    incomePostingId,
    incomeLedgerId,
    amountMinor: input.amountMinor,
    effectiveDate: input.effectiveDate,
  };
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("S1 financial action recipes", () => {
  it("accepts actual income only when receipt cash equals actual received", async () => {
    const identity = createTestIdentity("IncomeRecipe");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const account = await createFinancialAccount(
        client,
        identity,
        {
          name: "Income Destination",
          openingCutoffDate: "2026-01-01",
        },
      );

      const income = await createIncomeAction(
        client,
        identity,
        {
          account,
          effectiveDate: "2026-01-02",
          amountMinor: 1_000_000,
        },
      );

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        actual_received_minor: string;
        cash_amount_minor: string;
        income_amount_minor: string;
        cash_flow_kind: string;
        cash_flow_direction: string;
        income_class: string;
      }>(
        `
          SELECT
            d.actual_received_minor::text AS actual_received_minor,
            cash.amount_minor::text AS cash_amount_minor,
            income.amount_minor::text AS income_amount_minor,
            cash.cash_flow_kind,
            cash.cash_flow_direction,
            income.income_class
          FROM finance."receipt_detail" AS d
          INNER JOIN finance."posting" AS cash
            ON cash.workspace_id = d.workspace_id
            AND cash.id = $3
          INNER JOIN finance."posting" AS income
            ON income.workspace_id = d.workspace_id
            AND income.id = $4
          WHERE
            d.workspace_id = $1
            AND d.action_revision_id = $2
        `,
        [
          identity.workspaceId,
          income.revisionId,
          income.cashPostingId,
          income.incomePostingId,
        ],
      );

      expect(result.rows).toEqual([
        {
          actual_received_minor: "1000000",
          cash_amount_minor: "1000000",
          income_amount_minor: "-1000000",
          cash_flow_kind: "income",
          cash_flow_direction: "in",
          income_class: "earned",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts a categorized purchase split with exactly one funding deduction", async () => {
    const identity = createTestIdentity("ExpenseRecipe");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const account = await createFinancialAccount(
        client,
        identity,
        {
          name: "Expense Funding",
          openingCutoffDate: "2026-02-01",
        },
      );

      const expenseLedgerId = await insertLedgerAccount(client, {
        workspaceId: identity.workspaceId,
        name: "Expense Ledger",
        kind: "expense",
      });

      const groceriesCategoryId = await insertCategory(
        client,
        {
          workspaceId: identity.workspaceId,
          name: `Groceries ${randomUUID()}`,
          kind: "expense",
        },
      );

      const householdCategoryId = await insertCategory(
        client,
        {
          workspaceId: identity.workspaceId,
          name: `Household ${randomUUID()}`,
          kind: "expense",
        },
      );

      const effectiveDate = "2026-02-02";

      const action = await createInitialAction(
        client,
        identity,
        {
          actionKind: "expense",
          effectiveDate,
          description: "Split purchase",
        },
      );

      await client.query(
        `
          INSERT INTO finance."purchase_detail" (
            workspace_id,
            action_id,
            action_revision_id,
            funding_ledger_account_id,
            purchase_minor,
            merchant_name
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            100000,
            'Integration Test Store'
          )
        `,
        [
          identity.workspaceId,
          action.actionId,
          action.revisionId,
          account.cashLedgerId,
        ],
      );

      const journalId = await insertJournal(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        sequenceNo: 1,
        effectiveDate,
        role: "economic",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: account.cashLedgerId,
        lineNo: 1,
        amountMinor: -100_000,
        cashFlowKind: "purchase",
        cashFlowDirection: "out",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: expenseLedgerId,
        lineNo: 2,
        amountMinor: 70_000,
        categoryId: groceriesCategoryId,
        expenseClass: "gross",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: expenseLedgerId,
        lineNo: 3,
        amountMinor: 30_000,
        categoryId: householdCategoryId,
        expenseClass: "gross",
      });

      await finalizeJournal(
        client,
        identity.workspaceId,
        journalId,
      );

      await finalizeRevision(
        client,
        identity.workspaceId,
        action.revisionId,
      );

      await completeCommandReceipt(client, {
        workspaceId: identity.workspaceId,
        receiptId: action.receiptId,
        actionId: action.actionId,
        revisionId: action.revisionId,
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        purchase_minor: string;
        funding_count: string;
        funding_total: string;
        expense_total: string;
        category_count: string;
      }>(
        `
          SELECT
            d.purchase_minor::text AS purchase_minor,

            (
              SELECT count(*)::text
              FROM finance."posting" AS p
              WHERE
                p.workspace_id = d.workspace_id
                AND p.action_revision_id = d.action_revision_id
                AND p.cash_flow_kind = 'purchase'
                AND p.cash_flow_direction = 'out'
            ) AS funding_count,

            (
              SELECT
                COALESCE(sum(-(p.amount_minor)), 0)::text
              FROM finance."posting" AS p
              WHERE
                p.workspace_id = d.workspace_id
                AND p.action_revision_id = d.action_revision_id
                AND p.cash_flow_kind = 'purchase'
                AND p.cash_flow_direction = 'out'
            ) AS funding_total,

            (
              SELECT
                COALESCE(sum(p.amount_minor), 0)::text
              FROM finance."posting" AS p
              INNER JOIN finance."ledger_account" AS l
                ON l.workspace_id = p.workspace_id
                AND l.id = p.ledger_account_id
              WHERE
                p.workspace_id = d.workspace_id
                AND p.action_revision_id = d.action_revision_id
                AND l.kind = 'expense'
            ) AS expense_total,

            (
              SELECT count(*)::text
              FROM finance."posting" AS p
              WHERE
                p.workspace_id = d.workspace_id
                AND p.action_revision_id = d.action_revision_id
                AND p.category_id IS NOT NULL
            ) AS category_count

          FROM finance."purchase_detail" AS d
          WHERE
            d.workspace_id = $1
            AND d.action_revision_id = $2
        `,
        [
          identity.workspaceId,
          action.revisionId,
        ],
      );

      expect(result.rows).toEqual([
        {
          purchase_minor: "100000",
          funding_count: "1",
          funding_total: "100000",
          expense_total: "100000",
          category_count: "2",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("rejects ordinary cash activity on or before the account opening cutoff", async () => {
    const identity = createTestIdentity("CutoffGuard");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const account = await createFinancialAccount(
        client,
        identity,
        {
          name: "Cutoff Account",
          openingCutoffDate: "2026-03-10",
        },
      );

      await createIncomeAction(
        client,
        identity,
        {
          account,
          effectiveDate: "2026-03-10",
          amountMinor: 50_000,
        },
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

  it("accepts a transfer with a withheld fee while keeping principal internal", async () => {
    const identity = createTestIdentity("TransferRecipe");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const source = await createFinancialAccount(
        client,
        identity,
        {
          name: "Transfer Source",
          openingCutoffDate: "2026-04-01",
        },
      );

      const destination = await createFinancialAccount(
        client,
        identity,
        {
          name: "Transfer Destination",
          openingCutoffDate: "2026-04-01",
        },
      );

      const expenseLedgerId = await insertLedgerAccount(client, {
        workspaceId: identity.workspaceId,
        name: "Transfer Fee Expense",
        kind: "expense",
      });

      const effectiveDate = "2026-04-02";

      const action = await createInitialAction(
        client,
        identity,
        {
          actionKind: "transfer",
          effectiveDate,
          description: "Transfer with withheld fee",
        },
      );

      await client.query(
        `
          INSERT INTO finance."transfer_detail" (
            workspace_id,
            action_id,
            action_revision_id,
            source_account_id,
            destination_account_id,
            source_principal_minor,
            destination_principal_minor,
            withheld_fee_minor
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            501500,
            500000,
            1500
          )
        `,
        [
          identity.workspaceId,
          action.actionId,
          action.revisionId,
          source.accountId,
          destination.accountId,
        ],
      );

      const journalId = await insertJournal(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        sequenceNo: 1,
        effectiveDate,
        role: "economic",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: source.cashLedgerId,
        lineNo: 1,
        amountMinor: -500_000,
        cashFlowKind: "transfer",
        cashFlowDirection: "internal",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: destination.cashLedgerId,
        lineNo: 2,
        amountMinor: 500_000,
        cashFlowKind: "transfer",
        cashFlowDirection: "internal",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: action.actionId,
        revisionId: action.revisionId,
        journalId,
        ledgerAccountId: source.cashLedgerId,
        lineNo: 3,
        amountMinor: -1_500,
        cashFlowKind: "fee",
        cashFlowDirection: "out",
      });

      const feeExpensePostingId = await insertPosting(
        client,
        {
          workspaceId: identity.workspaceId,
          actionId: action.actionId,
          revisionId: action.revisionId,
          journalId,
          ledgerAccountId: expenseLedgerId,
          lineNo: 4,
          amountMinor: 1_500,
          expenseClass: "gross",
        },
      );

      await client.query(
        `
          INSERT INTO finance."fee_component" (
            workspace_id,
            action_id,
            action_revision_id,
            label,
            amount_minor,
            effective_date,
            bearing_ledger_account_id,
            expense_posting_id,
            treatment
          )
          VALUES (
            $1,
            $2,
            $3,
            'Transfer fee',
            1500,
            $4,
            $5,
            $6,
            'withheld'
          )
        `,
        [
          identity.workspaceId,
          action.actionId,
          action.revisionId,
          effectiveDate,
          source.cashLedgerId,
          feeExpensePostingId,
        ],
      );

      await finalizeJournal(
        client,
        identity.workspaceId,
        journalId,
      );

      await finalizeRevision(
        client,
        identity.workspaceId,
        action.revisionId,
      );

      await completeCommandReceipt(client, {
        workspaceId: identity.workspaceId,
        receiptId: action.receiptId,
        actionId: action.actionId,
        revisionId: action.revisionId,
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const cashEffect = await client.query<{
        total_cash_effect: string;
        internal_principal_total: string;
        fee_outflow: string;
      }>(
        `
          SELECT
            COALESCE(
              sum(p.amount_minor)
                FILTER (WHERE l.kind = 'cash_asset'),
              0
            )::text AS total_cash_effect,

            COALESCE(
              sum(p.amount_minor)
                FILTER (
                  WHERE
                    p.cash_flow_kind = 'transfer'
                    AND p.cash_flow_direction = 'internal'
                ),
              0
            )::text AS internal_principal_total,

            COALESCE(
              sum(-(p.amount_minor))
                FILTER (
                  WHERE
                    p.cash_flow_kind = 'fee'
                    AND p.cash_flow_direction = 'out'
                ),
              0
            )::text AS fee_outflow

          FROM finance."posting" AS p
          INNER JOIN finance."ledger_account" AS l
            ON l.workspace_id = p.workspace_id
            AND l.id = p.ledger_account_id
          WHERE
            p.workspace_id = $1
            AND p.action_revision_id = $2
        `,
        [
          identity.workspaceId,
          action.revisionId,
        ],
      );

      expect(cashEffect.rows).toEqual([
        {
          total_cash_effect: "-1500",
          internal_principal_total: "0",
          fee_outflow: "1500",
        },
      ]);

      const detail = await client.query<{
        source_principal_minor: string;
        destination_principal_minor: string;
        withheld_fee_minor: string;
      }>(
        `
          SELECT
            source_principal_minor::text,
            destination_principal_minor::text,
            withheld_fee_minor::text
          FROM finance."transfer_detail"
          WHERE
            workspace_id = $1
            AND action_revision_id = $2
        `,
        [
          identity.workspaceId,
          action.revisionId,
        ],
      );

      expect(detail.rows).toEqual([
        {
          source_principal_minor: "501500",
          destination_principal_minor: "500000",
          withheld_fee_minor: "1500",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts a replacement revision only when it exactly reverses the previous economics", async () => {
    const identity = createTestIdentity("CorrectionRecipe");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const account = await createFinancialAccount(
        client,
        identity,
        {
          name: "Correction Account",
          openingCutoffDate: "2026-05-01",
        },
      );

      const original = await createIncomeAction(
        client,
        identity,
        {
          account,
          effectiveDate: "2026-05-02",
          amountMinor: 100_000,
        },
      );

      const replacement = await createReplacementRevision(
        client,
        identity,
        {
          actionId: original.actionId,
          previousRevisionId: original.revisionId,
          effectiveDate: original.effectiveDate,
          actionKind: "income",
        },
      );

      await client.query(
        `
          INSERT INTO finance."receipt_detail" (
            workspace_id,
            action_id,
            action_revision_id,
            receiving_account_id,
            actual_received_minor,
            source_label
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            120000,
            'Corrected income'
          )
        `,
        [
          identity.workspaceId,
          replacement.actionId,
          replacement.revisionId,
          account.accountId,
        ],
      );

      const reversalJournalId = await insertJournal(
        client,
        {
          workspaceId: identity.workspaceId,
          actionId: replacement.actionId,
          revisionId: replacement.revisionId,
          sequenceNo: 1,
          effectiveDate: original.effectiveDate,
          role: "reversal",
          reversesJournalId: original.journalId,
        },
      );

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: replacement.actionId,
        revisionId: replacement.revisionId,
        journalId: reversalJournalId,
        ledgerAccountId: account.cashLedgerId,
        lineNo: 1,
        amountMinor: -100_000,
        cashFlowKind: "income",
        cashFlowDirection: "in",
        reversesPostingId: original.cashPostingId,
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: replacement.actionId,
        revisionId: replacement.revisionId,
        journalId: reversalJournalId,
        ledgerAccountId: original.incomeLedgerId,
        lineNo: 2,
        amountMinor: 100_000,
        incomeClass: "earned",
        reversesPostingId: original.incomePostingId,
      });

      const replacementJournalId = await insertJournal(
        client,
        {
          workspaceId: identity.workspaceId,
          actionId: replacement.actionId,
          revisionId: replacement.revisionId,
          sequenceNo: 2,
          effectiveDate: original.effectiveDate,
          role: "economic",
        },
      );

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: replacement.actionId,
        revisionId: replacement.revisionId,
        journalId: replacementJournalId,
        ledgerAccountId: account.cashLedgerId,
        lineNo: 1,
        amountMinor: 120_000,
        cashFlowKind: "income",
        cashFlowDirection: "in",
      });

      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId: replacement.actionId,
        revisionId: replacement.revisionId,
        journalId: replacementJournalId,
        ledgerAccountId: original.incomeLedgerId,
        lineNo: 2,
        amountMinor: -120_000,
        incomeClass: "earned",
      });

      await finalizeJournal(
        client,
        identity.workspaceId,
        reversalJournalId,
      );

      await finalizeJournal(
        client,
        identity.workspaceId,
        replacementJournalId,
      );

      await finalizeRevision(
        client,
        identity.workspaceId,
        replacement.revisionId,
      );

      await client.query(
        `
          UPDATE finance."financial_action"
          SET current_revision_id = $1
          WHERE
            workspace_id = $2
            AND id = $3
        `,
        [
          replacement.revisionId,
          identity.workspaceId,
          replacement.actionId,
        ],
      );

      await completeCommandReceipt(client, {
        workspaceId: identity.workspaceId,
        receiptId: replacement.receiptId,
        actionId: replacement.actionId,
        revisionId: replacement.revisionId,
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const actionState = await client.query<{
        current_revision_id: string;
        max_revision_no: number;
      }>(
        `
          SELECT
            a.current_revision_id,
            max(r.revision_no)::integer AS max_revision_no
          FROM finance."financial_action" AS a
          INNER JOIN finance."action_revision" AS r
            ON r.workspace_id = a.workspace_id
            AND r.action_id = a.id
          WHERE
            a.workspace_id = $1
            AND a.id = $2
          GROUP BY
            a.id,
            a.current_revision_id
        `,
        [
          identity.workspaceId,
          original.actionId,
        ],
      );

      expect(actionState.rows).toEqual([
        {
          current_revision_id: replacement.revisionId,
          max_revision_no: 2,
        },
      ]);

      const reversalCount = await client.query<{
        count: string;
      }>(
        `
          SELECT count(*)::text AS count
          FROM finance."posting"
          WHERE
            workspace_id = $1
            AND action_revision_id = $2
            AND reverses_posting_id IS NOT NULL
        `,
        [
          identity.workspaceId,
          replacement.revisionId,
        ],
      );

      expect(reversalCount.rows[0]?.count).toBe("2");

      /*
       * Original + exact reversal cancel. The corrected economic revision
       * therefore becomes the current authoritative balance effect.
       */
      const cashBalanceEffect = await client.query<{
        amount_minor: string;
      }>(
        `
          SELECT
            COALESCE(sum(p.amount_minor), 0)::text AS amount_minor
          FROM finance."posting" AS p
          WHERE
            p.workspace_id = $1
            AND p.ledger_account_id = $2
        `,
        [
          identity.workspaceId,
          account.cashLedgerId,
        ],
      );

      expect(cashBalanceEffect.rows[0]?.amount_minor).toBe(
        "120000",
      );
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });
});