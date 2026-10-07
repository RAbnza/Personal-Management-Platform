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

type LedgerKind = "cash_asset" | "expense" | "debt_liability";

type FinancialAccountFixture = {
  accountId: string;
  cashLedgerId: string;
};

type BorrowingFeeFixture = {
  label: string;
  amountMinor: number;
  treatment: "withheld" | "capitalized";
  bearer?: "debt" | "cash";
};

type BorrowingFixture = {
  debtId: string;
  liabilityLedgerId: string;

  actionId: string;
  revisionId: string;
  receiptId: string;
  journalId: string;

  receivingAccountId: string;
  receivingCashLedgerId: string;

  principalMinor: number;
  actualReceivedMinor: number;
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
    // An intentionally rejected deferred invariant may already have aborted
    // the transaction. Cleanup remains best-effort.
  }
}

async function insertLedgerAccount(
  client: PoolClient,
  input: {
    workspaceId: string;
    name: string;
    kind: LedgerKind;
  },
): Promise<string> {
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
      id,
      input.workspaceId,
      `${input.kind}:${randomUUID()}`,
      input.name,
      input.kind,
    ],
  );

  return id;
}

async function createFinancialAccount(
  client: PoolClient,
  identity: TestIdentity,
  input?: {
    openingCutoffDate?: string;
    archived?: boolean;
  },
): Promise<FinancialAccountFixture> {
  const cashLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    name: "Borrowing receiving cash",
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
        opening_cutoff_date,
        archived_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'Borrowing Destination',
        'checking',
        'PHP',
        $4,
        CASE
          WHEN $5::boolean
          THEN clock_timestamp()
          ELSE NULL
        END
      )
    `,
    [
      accountId,
      identity.workspaceId,
      cashLedgerId,
      input?.openingCutoffDate ?? "2026-01-01",
      input?.archived ?? false,
    ],
  );

  return {
    accountId,
    cashLedgerId,
  };
}

async function createCommandReceipt(
  client: PoolClient,
  input: {
    workspaceId: string;
    payloadByte?: number;
  },
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
        'finance.borrowing',
        $4
      )
    `,
    [
      receiptId,
      input.workspaceId,
      randomUUID(),
      Buffer.alloc(32, input.payloadByte ?? 9),
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
    debtId: string;
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
        debtId: input.debtId,
      }),
      input.workspaceId,
      input.receiptId,
    ],
  );
}

async function finalizeJournal(
  client: PoolClient,
  workspaceId: string,
  journalId: string,
): Promise<void> {
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
): Promise<void> {
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

    expenseClass?: "none" | "gross";

    cashFlowKind?: "none" | "borrowing";
    cashFlowDirection?: "none" | "in";

    liabilityComponent?: "principal" | "fee" | null;
  },
): Promise<string> {
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
        expense_class,
        income_class,
        cash_flow_kind,
        cash_flow_direction,
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
        $7,
        $8,
        $9,
        'none',
        $10,
        $11,
        $12
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
      input.expenseClass ?? "none",
      input.cashFlowKind ?? "none",
      input.cashFlowDirection ?? "none",
      input.liabilityComponent ?? null,
    ],
  );

  return postingId;
}

async function createBorrowingFixture(
  client: PoolClient,
  identity: TestIdentity,
  input?: {
    principalMinor?: number;
    actualReceivedMinor?: number;

    effectiveDate?: string;
    debtStartDate?: string;

    accountOpeningCutoffDate?: string;
    archiveReceivingAccount?: boolean;

    openingCutoffDate?: string | null;

    debtType?:
      | "personal_loan"
      | "installment_loan"
      | "financed_purchase"
      | "flexible_manual";

    breakdownStatus?: "known" | "partial" | "unknown";

    principalPostingMinor?: number;

    fees?: BorrowingFeeFixture[];
  },
): Promise<BorrowingFixture> {
  const principalMinor = input?.principalMinor ?? 1_000_000;

  const effectiveDate = input?.effectiveDate ?? "2026-10-08";

  const debtStartDate = input?.debtStartDate ?? effectiveDate;

  const fees = input?.fees ?? [];

  const withheldFeeMinor = fees.reduce(
    (total, fee) =>
      fee.treatment === "withheld" ? total + fee.amountMinor : total,
    0,
  );

  const capitalizedFeeMinor = fees.reduce(
    (total, fee) =>
      fee.treatment === "capitalized" ? total + fee.amountMinor : total,
    0,
  );

  const actualReceivedMinor =
    input?.actualReceivedMinor ?? principalMinor - withheldFeeMinor;

  const principalPostingMinor = input?.principalPostingMinor ?? principalMinor;

  const receivingAccount = await createFinancialAccount(client, identity, {
    openingCutoffDate: input?.accountOpeningCutoffDate ?? "2026-01-01",

    archived: input?.archiveReceivingAccount ?? false,
  });

  const liabilityLedgerId = await insertLedgerAccount(client, {
    workspaceId: identity.workspaceId,
    name: "Borrowing liability",
    kind: "debt_liability",
  });

  const expenseLedgerId =
    fees.length > 0
      ? await insertLedgerAccount(client, {
          workspaceId: identity.workspaceId,
          name: "Borrowing fees",
          kind: "expense",
        })
      : null;

  const debtId = randomUUID();

  await client.query(
    `
      INSERT INTO finance."debt" (
        id,
        workspace_id,
        name,
        lender_name,
        product_name,
        debt_type,
        currency,
        liability_ledger_account_id,
        original_principal_minor,
        start_date,
        opening_cutoff_date,
        breakdown_status,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        'Integration borrowing',
        'Integration lender',
        'Integration loan',
        $3,
        'PHP',
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        'user'
      )
    `,
    [
      debtId,
      identity.workspaceId,
      input?.debtType ?? "personal_loan",
      liabilityLedgerId,
      principalMinor,
      debtStartDate,
      input?.openingCutoffDate ?? null,
      input?.breakdownStatus ?? "known",
      identity.userId,
    ],
  );

  const receiptId = await createCommandReceipt(client, {
    workspaceId: identity.workspaceId,
  });

  const actionId = randomUUID();
  const revisionId = randomUUID();
  const journalId = randomUUID();

  await client.query(
    `
      INSERT INTO finance."financial_action" (
        id,
        workspace_id,
        original_command_receipt_id,
        current_revision_id,
        description,
        reference,
        recorded_by_user_id,
        actor_kind
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Integration borrowing',
        'BORROW-INTEGRATION',
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
        'borrowing',
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
      receiptId,
      effectiveDate,
      identity.userId,
    ],
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
        'borrowing'
      )
    `,
    [identity.workspaceId, actionId, revisionId, debtId],
  );

  await client.query(
    `
      INSERT INTO finance."receipt_detail" (
        workspace_id,
        action_id,
        action_revision_id,
        receiving_account_id,
        actual_received_minor,
        sender_name,
        source_label
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'Integration lender',
        'New borrowing proceeds'
      )
    `,
    [
      identity.workspaceId,
      actionId,
      revisionId,
      receivingAccount.accountId,
      actualReceivedMinor,
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
    [journalId, identity.workspaceId, actionId, revisionId, effectiveDate],
  );

  let lineNo = 1;

  await insertPosting(client, {
    workspaceId: identity.workspaceId,
    actionId,
    revisionId,
    journalId,
    ledgerAccountId: receivingAccount.cashLedgerId,
    lineNo,
    amountMinor: actualReceivedMinor,
    cashFlowKind: "borrowing",
    cashFlowDirection: "in",
  });

  lineNo += 1;

  await insertPosting(client, {
    workspaceId: identity.workspaceId,
    actionId,
    revisionId,
    journalId,
    ledgerAccountId: liabilityLedgerId,
    lineNo,
    amountMinor: -principalPostingMinor,
    liabilityComponent: "principal",
  });

  lineNo += 1;

  for (const fee of fees) {
    if (!expenseLedgerId) {
      throw new Error("Borrowing fee expense ledger was not created.");
    }

    const expensePostingId = await insertPosting(client, {
      workspaceId: identity.workspaceId,
      actionId,
      revisionId,
      journalId,
      ledgerAccountId: expenseLedgerId,
      lineNo,
      amountMinor: fee.amountMinor,
      expenseClass: "gross",
    });

    lineNo += 1;

    if (fee.treatment === "capitalized") {
      await insertPosting(client, {
        workspaceId: identity.workspaceId,
        actionId,
        revisionId,
        journalId,
        ledgerAccountId: liabilityLedgerId,
        lineNo,
        amountMinor: -fee.amountMinor,
        liabilityComponent: "fee",
      });

      lineNo += 1;
    }

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
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
      `,
      [
        identity.workspaceId,
        actionId,
        revisionId,
        fee.label,
        fee.amountMinor,
        effectiveDate,

        fee.bearer === "cash"
          ? receivingAccount.cashLedgerId
          : liabilityLedgerId,

        expensePostingId,
        fee.treatment,
      ],
    );
  }

  /*
   * Some negative tests deliberately override the principal posting while
   * keeping the journal balanced so failure comes from the borrowing recipe
   * rather than only the generic journal-balancing invariant.
   */
  const journalBalance =
    actualReceivedMinor +
    fees.reduce((total, fee) => total + fee.amountMinor, 0) -
    principalPostingMinor -
    capitalizedFeeMinor;

  if (journalBalance !== 0) {
    /*
     * This compensating liability line is deliberately classified as
     * principal. The borrowing recipe must reject the resulting principal
     * total when it no longer equals original_principal_minor.
     *
     * It is only used by negative test fixtures.
     */
    await insertPosting(client, {
      workspaceId: identity.workspaceId,
      actionId,
      revisionId,
      journalId,
      ledgerAccountId: liabilityLedgerId,
      lineNo,
      amountMinor: -journalBalance,
      liabilityComponent: "principal",
    });
  }

  await finalizeJournal(client, identity.workspaceId, journalId);

  await finalizeRevision(client, identity.workspaceId, revisionId);

  await completeCommandReceipt(client, {
    workspaceId: identity.workspaceId,
    receiptId,
    actionId,
    revisionId,
    debtId,
  });

  return {
    debtId,
    liabilityLedgerId,

    actionId,
    revisionId,
    receiptId,
    journalId,

    receivingAccountId: receivingAccount.accountId,
    receivingCashLedgerId: receivingAccount.cashLedgerId,

    principalMinor,
    actualReceivedMinor,
  };
}

afterAll(async () => {
  await closeRuntimeDatabasePools();
});

describe("D7 borrowing database integrity", () => {
  it("accepts a borrowing where the full contractual principal is received as cash", async () => {
    const identity = createTestIdentity("BorrowingFullPrincipal");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const borrowing = await createBorrowingFixture(client, identity);

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        actual_received_minor: string;

        cash_minor: string;

        principal_liability_minor: string;

        fee_expense_minor: string;

        income_posting_count: string;
      }>(
        `
          SELECT
            receipt.actual_received_minor::text
              AS actual_received_minor,

            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'cash_asset'
                ),
              0
            )::text AS cash_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE
                    ledger.kind = 'debt_liability'
                    AND posting.liability_component = 'principal'
                ),
              0
            )::text AS principal_liability_minor,

            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'expense'
                ),
              0
            )::text AS fee_expense_minor,

            count(*) FILTER (
              WHERE ledger.kind = 'income'
            )::text AS income_posting_count

          FROM finance."receipt_detail" AS receipt

          INNER JOIN finance."posting" AS posting
            ON posting.workspace_id = receipt.workspace_id
            AND posting.action_revision_id =
              receipt.action_revision_id

          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id

          WHERE
            receipt.workspace_id = $1
            AND receipt.action_revision_id = $2

          GROUP BY receipt.actual_received_minor
        `,
        [identity.workspaceId, borrowing.revisionId],
      );

      expect(result.rows).toEqual([
        {
          actual_received_minor: "1000000",
          cash_minor: "1000000",
          principal_liability_minor: "1000000",
          fee_expense_minor: "0",
          income_posting_count: "0",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts the canonical net-proceeds borrowing with a withheld fee", async () => {
    const identity = createTestIdentity("BorrowingWithheld");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const borrowing = await createBorrowingFixture(client, identity, {
        principalMinor: 1_000_000,
        actualReceivedMinor: 980_000,

        fees: [
          {
            label: "Processing fee",
            amountMinor: 20_000,
            treatment: "withheld",
          },
        ],
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        cash_minor: string;
        expense_minor: string;
        liability_minor: string;

        withheld_fee_minor: string;
        capitalized_fee_minor: string;

        income_posting_count: string;
        fee_cash_out_count: string;
      }>(
        `
          SELECT
            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'cash_asset'
                ),
              0
            )::text AS cash_minor,

            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'expense'
                ),
              0
            )::text AS expense_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE ledger.kind = 'debt_liability'
                ),
              0
            )::text AS liability_minor,

            COALESCE(
              (
                SELECT sum(fee.amount_minor)
                FROM finance."fee_component" AS fee
                WHERE
                  fee.workspace_id = $1
                  AND fee.action_revision_id = $2
                  AND fee.treatment = 'withheld'
              ),
              0
            )::text AS withheld_fee_minor,

            COALESCE(
              (
                SELECT sum(fee.amount_minor)
                FROM finance."fee_component" AS fee
                WHERE
                  fee.workspace_id = $1
                  AND fee.action_revision_id = $2
                  AND fee.treatment = 'capitalized'
              ),
              0
            )::text AS capitalized_fee_minor,

            count(*) FILTER (
              WHERE ledger.kind = 'income'
            )::text AS income_posting_count,

            count(*) FILTER (
              WHERE
                posting.cash_flow_kind = 'fee'
                AND posting.cash_flow_direction = 'out'
            )::text AS fee_cash_out_count

          FROM finance."posting" AS posting

          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id

          WHERE
            posting.workspace_id = $1
            AND posting.action_revision_id = $2
        `,
        [identity.workspaceId, borrowing.revisionId],
      );

      expect(result.rows).toEqual([
        {
          cash_minor: "980000",
          expense_minor: "20000",
          liability_minor: "1000000",
          withheld_fee_minor: "20000",
          capitalized_fee_minor: "0",
          income_posting_count: "0",
          fee_cash_out_count: "0",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts a capitalized borrowing fee without reducing cash proceeds", async () => {
    const identity = createTestIdentity("BorrowingCapitalized");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const borrowing = await createBorrowingFixture(client, identity, {
        principalMinor: 1_000_000,
        actualReceivedMinor: 1_000_000,

        fees: [
          {
            label: "Capitalized processing fee",
            amountMinor: 20_000,
            treatment: "capitalized",
          },
        ],
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        cash_minor: string;
        expense_minor: string;

        principal_liability_minor: string;
        fee_liability_minor: string;

        total_liability_minor: string;
      }>(
        `
          SELECT
            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'cash_asset'
                ),
              0
            )::text AS cash_minor,

            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'expense'
                ),
              0
            )::text AS expense_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE
                    ledger.kind = 'debt_liability'
                    AND posting.liability_component = 'principal'
                ),
              0
            )::text AS principal_liability_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE
                    ledger.kind = 'debt_liability'
                    AND posting.liability_component = 'fee'
                ),
              0
            )::text AS fee_liability_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE ledger.kind = 'debt_liability'
                ),
              0
            )::text AS total_liability_minor

          FROM finance."posting" AS posting

          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id

          WHERE
            posting.workspace_id = $1
            AND posting.action_revision_id = $2
        `,
        [identity.workspaceId, borrowing.revisionId],
      );

      expect(result.rows).toEqual([
        {
          cash_minor: "1000000",
          expense_minor: "20000",
          principal_liability_minor: "1000000",
          fee_liability_minor: "20000",
          total_liability_minor: "1020000",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("accepts distinct withheld and capitalized borrowing fees without double counting", async () => {
    const identity = createTestIdentity("BorrowingMixedFees");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      const borrowing = await createBorrowingFixture(client, identity, {
        principalMinor: 1_000_000,
        actualReceivedMinor: 980_000,

        fees: [
          {
            label: "Withheld disbursement fee",
            amountMinor: 20_000,
            treatment: "withheld",
          },
          {
            label: "Capitalized service fee",
            amountMinor: 10_000,
            treatment: "capitalized",
          },
        ],
      });

      await client.query("SET CONSTRAINTS ALL IMMEDIATE");

      const result = await client.query<{
        cash_minor: string;
        expense_minor: string;
        liability_minor: string;
        journal_total: string;
      }>(
        `
          SELECT
            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'cash_asset'
                ),
              0
            )::text AS cash_minor,

            COALESCE(
              sum(posting.amount_minor)
                FILTER (
                  WHERE ledger.kind = 'expense'
                ),
              0
            )::text AS expense_minor,

            COALESCE(
              sum(-(posting.amount_minor))
                FILTER (
                  WHERE ledger.kind = 'debt_liability'
                ),
              0
            )::text AS liability_minor,

            COALESCE(
              sum(posting.amount_minor),
              0
            )::text AS journal_total

          FROM finance."posting" AS posting

          INNER JOIN finance."ledger_account" AS ledger
            ON ledger.workspace_id = posting.workspace_id
            AND ledger.id = posting.ledger_account_id

          WHERE
            posting.workspace_id = $1
            AND posting.action_revision_id = $2
        `,
        [identity.workspaceId, borrowing.revisionId],
      );

      expect(result.rows).toEqual([
        {
          cash_minor: "980000",
          expense_minor: "30000",
          liability_minor: "1010000",
          journal_total: "0",
        },
      ]);
    } finally {
      await rollbackQuietly(client);
      client.release();

      await deleteAuthUsers([identity]);
    }
  });

  it("rejects borrowing when recognized principal does not equal original principal", async () => {
    const identity = createTestIdentity("BorrowingPrincipalMismatch");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        principalMinor: 1_000_000,

        /*
         * Keep the journal balanced while making the principal liability
         * evidence inconsistent with the debt's contractual principal.
         */
        actualReceivedMinor: 990_000,

        principalPostingMinor: 1_010_000,

        fees: [
          {
            label: "Processing fee",
            amountMinor: 20_000,
            treatment: "withheld",
          },
        ],
      });

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

  it("rejects borrowing fees whose bearer is not the linked debt liability", async () => {
    const identity = createTestIdentity("BorrowingWrongFeeBearer");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        principalMinor: 1_000_000,
        actualReceivedMinor: 980_000,

        fees: [
          {
            label: "Processing fee",
            amountMinor: 20_000,
            treatment: "withheld",

            bearer: "cash",
          },
        ],
      });

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

  it("rejects a cash borrowing that uses an imported-debt opening cutoff", async () => {
    const identity = createTestIdentity("BorrowingOpeningCutoff");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        openingCutoffDate: "2026-10-07",
      });

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

  it("rejects borrowing on or before the receiving account opening cutoff", async () => {
    const identity = createTestIdentity("BorrowingAccountCutoff");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        effectiveDate: "2026-10-08",

        accountOpeningCutoffDate: "2026-10-08",
      });

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

  it("rejects borrowing into an archived receiving account", async () => {
    const identity = createTestIdentity("BorrowingArchivedAccount");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        archiveReceivingAccount: true,
      });

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

  it("rejects financed purchases from the cash-borrowing recipe", async () => {
    const identity = createTestIdentity("BorrowingFinancedPurchase");

    await createAuthUser(identity);

    const client = await getDomainPool().connect();

    try {
      await beginScopedTestTransaction(client, identity);

      await createBorrowingFixture(client, identity, {
        debtType: "financed_purchase",
      });

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
});
