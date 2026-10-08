import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { closeRuntimeDatabasePools, getAuthPool } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import {
  removeProvisionedTestUser,
  type ProvisionedTestUser,
} from "./helpers/provisioned-test-user";
import { FinancialCommandConflictError } from "@/modules/finance/domain/financial-command";
import { FinancialAccountReferenceUnavailableError } from "@/modules/finance/domain/financial-reference";
import {
  PaymentPreviewStaleError,
  type RecordDebtPaymentBody,
} from "@/modules/finance/domain/debt-payment";
import { importExistingDebtInTransaction } from "@/modules/finance/services/import-existing-debt";
import { recordDebtPaymentInTransaction } from "@/modules/finance/services/record-debt-payment";
import {
  DebtUnavailableError,
  getDebtDetailInTransaction,
  listDebtPaymentsInTransaction,
} from "@/modules/finance/services/read-debts";
import * as financialWrites from "@/modules/finance/repositories/financial-write-repository";
import {
  finalizeSchedule,
  action,
  finish,
  fixture,
  scoped,
  mapPool,
  payment,
  schedule,
  withFixture,
  type DebtFixture,
} from "./helpers/debt-payment-fixture";

const foreignRoots: ProvisionedTestUser[] = [];
afterAll(async () => {
  for (const user of foreignRoots)
    await removeProvisionedTestUser(user, "d8b-payment-isolation-cleanup");
  await closeRuntimeDatabasePools();
});
// withFixture installs the real app_domain scope and rolls back this same
// checked-out connection. The service uses the production Drizzle transaction.
const transaction = (client: PoolClient) =>
  ({ db: drizzle({ client }) }) as ScopedTransaction;
const scope = (f: DebtFixture) => ({
  userId: f.userId,
  workspaceId: f.workspaceId,
});
async function prepare(
  client: PoolClient,
  f: DebtFixture,
  input: {
    empty?: boolean;
    components?: {
      kind: "principal" | "interest" | "fee" | "penalty" | "unclassified";
      amountMinor: string;
    }[];
    contractual?: string;
    openingSatisfied?: string;
  } = {},
) {
  const t = transaction(client);
  const components = input.components ?? [
    { kind: "principal" as const, amountMinor: "100000" },
  ];
  const result = await importExistingDebtInTransaction(t, {
    ...scope(f),
    clientCommandId: randomUUID(),
    name: "Payment test loan",
    lenderName: "Provider",
    debtType: "personal_loan",
    startDate: "2026-01-01",
    openingCutoffDate: "2026-09-30",
    openingLiabilityMinor: components
      .reduce((sum, c) => sum + BigInt(c.amountMinor), 0n)
      .toString(),
    openingComponents: components,
    scheduleReason: "Provider terms",
    installments: input.empty
      ? []
      : [
          {
            dueDate: "2026-10-20",
            contractualMinor: input.contractual ?? "110000",
            openingSatisfiedMinor: input.openingSatisfied ?? "0",
          },
        ],
  });
  const detail = await getDebtDetailInTransaction(t, {
    ...scope(f),
    debtId: result.debtId,
  });
  const body: RecordDebtPaymentBody = {
    clientCommandId: randomUUID(),
    debtId: result.debtId,
    payingAccountId: f.accountId,
    paymentDate: "2026-10-08",
    scheduleVersionId: result.scheduleVersionId,
    expectedFinancialRevision: detail.financialRevision,
    actualPaidMinor: "110000",
    contractualMinor: "110000",
    externalFeeMinor: "0",
    allocationCertainty: "known_components",
    components: [
      {
        disposition: "liability_reduction",
        liabilityComponent: "principal",
        amountMinor: "100000",
        label: "Principal",
      },
      {
        disposition: "new_interest",
        amountMinor: "10000",
        label: "New interest",
      },
    ],
    dueAllocations: input.empty
      ? []
      : [
          {
            installmentId: detail.installments[0]!.installmentId,
            amountMinor: "110000",
          },
        ],
    unappliedContractualMinor: input.empty ? "110000" : "0",
    dueAllocationConfirmed: true,
    confirmationSource: "provider",
    confirmationNote: "Provider receipt confirms allocation",
    acknowledgeNegativeBalance: true,
    description: "Provider payment",
  };
  return { t, body, detail };
}
async function totals(client: PoolClient, f: DebtFixture) {
  return (
    await client.query<{
      cash: string;
      expense: string;
      payment_count: number;
    }>(
      `SELECT
    COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE l.kind='cash_asset'),0)::text AS cash,
    COALESCE(sum(p.amount_minor::numeric) FILTER (WHERE l.kind='expense'),0)::text AS expense,
    (SELECT count(*)::integer FROM finance.debt_payment WHERE workspace_id=$1) AS payment_count
    FROM finance.posting p JOIN finance.ledger_account l ON l.workspace_id=p.workspace_id AND l.id=p.ledger_account_id
    JOIN finance.journal j ON j.workspace_id=p.workspace_id AND j.id=p.journal_id AND j.state='posted'
    WHERE p.workspace_id=$1`,
      [f.workspaceId],
    )
  ).rows[0]!;
}

describe("D8b transactional debt payments", () => {
  it("paginates retained payment evidence without using a revision cursor to filter the debt header", async () =>
    withFixture(async (client, f) => {
      for (let index = 0; index < 55; index++)
        await payment(client, f, { contractual: "1", due: "1" });
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const t = transaction(client);
      const first = await listDebtPaymentsInTransaction(t, {
        ...scope(f),
        debtId: f.debtId,
      });
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      const second = await listDebtPaymentsInTransaction(t, {
        ...scope(f),
        debtId: f.debtId,
        after: first.nextCursor!,
      });
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set(
          [...first.items, ...second.items].map(
            (item) => item.actionRevisionId,
          ),
        ).size,
      ).toBe(55);
    }));
  it("rejects real foreign debt, account and due references, and keeps the due view isolated", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      const userId = randomUUID();
      await getAuthPool().query(
        `INSERT INTO auth."user"(id,name,email,email_verified) VALUES ($1,'Foreign payment owner',$2,true)`,
        [userId, `d8b-foreign-${userId}@example.test`],
      );
      const provisioned = await provisionPersonalWorkspace({
        userId,
        displayName: "Foreign payment owner",
      });
      const foreign = { userId, workspaceId: provisioned.workspaceId };
      foreignRoots.push(foreign);
      await scoped(client, foreign);
      const foreignDebt = await fixture(client, foreign);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      await scoped(client, f);
      for (const [field, id, errorType] of [
        ["debtId", foreignDebt.debtId, DebtUnavailableError],
        [
          "payingAccountId",
          foreignDebt.accountId,
          FinancialAccountReferenceUnavailableError,
        ],
      ] as const) {
        await client.query("SAVEPOINT foreign_reference");
        await expect(
          recordDebtPaymentInTransaction(t, {
            ...scope(f),
            ...body,
            [field]: id,
          }),
        ).rejects.toBeInstanceOf(errorType);
        await client.query("ROLLBACK TO SAVEPOINT foreign_reference");
      }
      await client.query("SAVEPOINT foreign_due");
      await expect(
        recordDebtPaymentInTransaction(t, {
          ...scope(f),
          ...body,
          dueAllocations: [
            { installmentId: foreignDebt.installmentId, amountMinor: "110000" },
          ],
        }),
      ).rejects.toThrow("unavailable in this debt");
      await client.query("ROLLBACK TO SAVEPOINT foreign_due");
      expect(
        (
          await client.query(
            `SELECT count(*)::integer AS count FROM finance.current_installment_due_v WHERE workspace_id=$1`,
            [foreign.workspaceId],
          )
        ).rows[0]?.count,
      ).toBe(0);
      expect((await totals(client, f)).payment_count).toBe(0);
    }));
  it("pays principal 1,000 + new interest 100 + external fee 10 once, with exact dues and immutable opening satisfaction", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      const result = await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        actualPaidMinor: "111000",
        externalFeeMinor: "1000",
      });
      expect(await totals(client, f)).toEqual({
        cash: "-111000",
        expense: "11000",
        payment_count: 1,
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.debt.recognizedLiabilityMinor).toBe("0");
      expect(detail.debt.remainingScheduledMinor).toBe("0");
      expect(detail.installments[0]).toMatchObject({
        openingSatisfiedMinor: "0",
        paymentSatisfiedMinor: "110000",
        remainingMinor: "0",
      });
      expect(detail.payments[0]).toMatchObject({
        paymentId: result.paymentId,
        confirmationSource: "provider",
        confirmationNote: "Provider receipt confirms allocation",
        externalFeeMinor: "1000",
      });
      expect(
        (
          await client.query(
            `SELECT count(*)::integer AS count FROM time.agenda_v WHERE source_kind='debt_installment' AND source_id=(SELECT obligation_id FROM finance.scheduled_installment WHERE id=$1)`,
            [detail.installments[0]!.installmentId],
          )
        ).rows[0]?.count,
      ).toBe(0);
    }));
  it("repays already recognized 1,100 plus external fee 10 without expensing the recognized interest again", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f, {
        components: [
          { kind: "principal", amountMinor: "100000" },
          { kind: "interest", amountMinor: "10000" },
        ],
      });
      await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        actualPaidMinor: "111000",
        externalFeeMinor: "1000",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "principal",
            amountMinor: "100000",
            label: "Principal",
          },
          {
            disposition: "liability_reduction",
            liabilityComponent: "interest",
            amountMinor: "10000",
            label: "Recognized interest",
          },
        ],
      });
      expect(await totals(client, f)).toEqual({
        cash: "-111000",
        expense: "1000",
        payment_count: 1,
      });
    }));
  it("leaves a partial installment visible in debt detail and Agenda", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        actualPaidMinor: "40000",
        contractualMinor: "40000",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "principal",
            amountMinor: "40000",
            label: "Partial principal",
          },
        ],
        dueAllocations: [
          {
            installmentId: body.dueAllocations[0]!.installmentId,
            amountMinor: "40000",
          },
        ],
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.installments[0]).toMatchObject({
        remainingMinor: "70000",
        openingSatisfiedMinor: "0",
        paymentSatisfiedMinor: "40000",
      });
      expect(
        (
          await client.query(
            `SELECT count(*)::integer AS count FROM time.agenda_v WHERE source_kind='debt_installment' AND source_id=(SELECT obligation_id FROM finance.scheduled_installment WHERE id=$1)`,
            [body.dueAllocations[0]!.installmentId],
          )
        ).rows[0]?.count,
      ).toBe(1);
    }));
  it("supports no supplied due dates through an explicit unapplied payment and no invented Agenda entry", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f, { empty: true });
      await recordDebtPaymentInTransaction(t, { ...scope(f), ...body });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.installments).toEqual([]);
      expect(detail.debt.remainingScheduledMinor).toBeNull();
      expect(detail.debt.unappliedContractualMinor).toBe("110000");
    }));
  it("reduces confirmed unclassified liability without guessing principal", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f, {
        components: [{ kind: "unclassified", amountMinor: "110000" }],
      });
      await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        allocationCertainty: "confirmed_total",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "unclassified",
            amountMinor: "110000",
            label: "Confirmed total reduction",
          },
        ],
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.debt.unclassifiedLiabilityMinor).toBe("0");
      expect(detail.debt.outstandingPrincipalMinor).toBeNull();
      expect((await totals(client, f)).expense).toBe("0");
    }));
  it("creates clearing lazily for unresolved accounting while honoring explicitly confirmed dues", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        allocationCertainty: "unresolved",
        components: [
          {
            disposition: "clearing",
            amountMinor: "110000",
            label: "Breakdown pending",
          },
        ],
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.debt.recognizedLiabilityMinor).toBe("100000");
      expect(detail.debt.paymentClearingMinor).toBe("110000");
      expect(detail.debt.remainingScheduledMinor).toBe("0");
      expect((await totals(client, f)).expense).toBe("0");
    }));
  it("supports a partially known breakdown without inferring the unresolved part", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await recordDebtPaymentInTransaction(t, {
        ...scope(f),
        ...body,
        allocationCertainty: "unresolved",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "principal",
            amountMinor: "50000",
            label: "Confirmed principal",
          },
          {
            disposition: "clearing",
            amountMinor: "50000",
            label: "Unknown remainder",
          },
          {
            disposition: "new_interest",
            amountMinor: "10000",
            label: "Confirmed new interest",
          },
        ],
      });
      const detail = await getDebtDetailInTransaction(t, {
        ...scope(f),
        debtId: body.debtId,
      });
      expect(detail.debt.recognizedLiabilityMinor).toBe("50000");
      expect(detail.debt.paymentClearingMinor).toBe("50000");
      expect((await totals(client, f)).expense).toBe("10000");
    }));
  it("records known new interest, provider fee and penalty exactly once", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      const command = {
        ...scope(f),
        ...body,
        components: [
          {
            disposition: "liability_reduction" as const,
            liabilityComponent: "principal" as const,
            amountMinor: "100000",
            label: "Principal",
          },
          {
            disposition: "new_interest" as const,
            amountMinor: "5000",
            label: "Interest",
          },
          {
            disposition: "new_fee" as const,
            amountMinor: "3000",
            label: "Provider fee",
          },
          {
            disposition: "new_penalty" as const,
            amountMinor: "2000",
            label: "Penalty",
          },
        ],
      };
      const result = await recordDebtPaymentInTransaction(t, command);
      expect(await recordDebtPaymentInTransaction(t, command)).toEqual(result);
      expect(await totals(client, f)).toEqual({
        cash: "-110000",
        expense: "10000",
        payment_count: 1,
      });
    }));
  it("replays the same command before stale-preview and archived-account validation", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      const command = { ...scope(f), ...body };
      const result = await recordDebtPaymentInTransaction(t, command);
      await client.query(
        `UPDATE finance.financial_account SET archived_at=clock_timestamp() WHERE id=$1`,
        [f.accountId],
      );
      expect(await recordDebtPaymentInTransaction(t, command)).toEqual(result);
      expect((await totals(client, f)).payment_count).toBe(1);
    }));
  it("conflicts when a saved command key is reused with changed payload", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await recordDebtPaymentInTransaction(t, { ...scope(f), ...body });
      await expect(
        recordDebtPaymentInTransaction(t, {
          ...scope(f),
          ...body,
          description: "Different payment",
        }),
      ).rejects.toBeInstanceOf(FinancialCommandConflictError);
      expect((await totals(client, f)).payment_count).toBe(1);
    }));
  it.each(["debtId", "payingAccountId"] as const)(
    "rejects unavailable or foreign %s without financial evidence",
    async (field) =>
      withFixture(async (client, f) => {
        const { t, body } = await prepare(client, f);
        await client.query("SAVEPOINT invalid_reference");
        await expect(
          recordDebtPaymentInTransaction(t, {
            ...scope(f),
            ...body,
            [field]: randomUUID(),
          }),
        ).rejects.toBeInstanceOf(
          field === "debtId"
            ? DebtUnavailableError
            : FinancialAccountReferenceUnavailableError,
        );
        await client.query("ROLLBACK TO SAVEPOINT invalid_reference");
        expect((await totals(client, f)).payment_count).toBe(0);
      }),
  );
  it("rejects stale reviewed data before inserting a payment", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await expect(
        recordDebtPaymentInTransaction(t, {
          ...scope(f),
          ...body,
          expectedFinancialRevision: "0",
        }),
      ).rejects.toBeInstanceOf(PaymentPreviewStaleError);
      expect((await totals(client, f)).payment_count).toBe(0);
    }));
  it("requires explicit negative-balance acknowledgement and records the warning outcome", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await client.query("SAVEPOINT warning");
      await expect(
        recordDebtPaymentInTransaction(t, {
          ...scope(f),
          ...body,
          acknowledgeNegativeBalance: false,
        }),
      ).rejects.toThrow("explicitly acknowledge");
      await client.query("ROLLBACK TO SAVEPOINT warning");
      await recordDebtPaymentInTransaction(t, { ...scope(f), ...body });
      expect(
        (
          await getDebtDetailInTransaction(t, {
            ...scope(f),
            debtId: body.debtId,
          })
        ).payments[0]!.negativeBalanceAcknowledged,
      ).toBe(true);
    }));
  it("rejects excess due allocation and excess recognized liability rather than inventing a split", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await expect(
        recordDebtPaymentInTransaction(t, {
          ...scope(f),
          ...body,
          components: [
            {
              disposition: "liability_reduction",
              liabilityComponent: "principal",
              amountMinor: "110000",
              label: "Too much principal",
            },
          ],
        }),
      ).rejects.toThrow("exceeds recognized");
      expect((await totals(client, f)).payment_count).toBe(0);
    }));
  it("rolls back postings, payment evidence, audit and receipt after a late failure, then safely retries", async () =>
    withFixture(async (client, f) => {
      const { t, body } = await prepare(client, f);
      await client.query("SAVEPOINT late_failure");
      const failure = vi
        .spyOn(financialWrites, "enforceDeferredFinancialConstraints")
        .mockRejectedValueOnce(new Error("Injected late failure"));
      await expect(
        recordDebtPaymentInTransaction(t, { ...scope(f), ...body }),
      ).rejects.toThrow("Injected late failure");
      failure.mockRestore();
      await client.query("ROLLBACK TO SAVEPOINT late_failure");
      expect(await totals(client, f)).toEqual({
        cash: "0",
        expense: "0",
        payment_count: 0,
      });
      expect(
        (
          await client.query(
            `SELECT count(*)::integer AS count FROM core.command_receipt WHERE workspace_id=$1 AND client_command_id=$2`,
            [f.workspaceId, body.clientCommandId],
          )
        ).rows[0]?.count,
      ).toBe(0);
      await recordDebtPaymentInTransaction(t, { ...scope(f), ...body });
      expect((await totals(client, f)).payment_count).toBe(1);
    }));
  it("reads only current direct and mapped allocations after correction, without mutating opening satisfaction", async () =>
    withFixture(async (client, f) => {
      const first = await payment(client, f, {
        contractual: "400",
        due: "300",
        unapplied: "100",
      });
      const target = await schedule(client, f, {
        previousId: f.scheduleId,
        version: 2,
      });
      await mapPool(client, f, first, target, "300");
      await mapPool(
        client,
        f,
        first,
        { scheduleId: target.scheduleId },
        "100",
        null,
      );
      await finalizeSchedule(client, f, target.scheduleId);
      const direct = await payment(client, f, {
        contractual: "200",
        due: "200",
        scheduleId: target.scheduleId,
        installmentId: target.installmentId,
      });
      const detail = await getDebtDetailInTransaction(transaction(client), {
        ...scope(f),
        debtId: f.debtId,
      });
      expect(detail.installments[0]).toMatchObject({
        openingSatisfiedMinor: "0",
        paymentSatisfiedMinor: "500",
        remainingMinor: "500",
      });
      expect(detail.debt.unappliedContractualMinor).toBe("100");
      expect(detail.payments.map((item) => item.paymentId)).toEqual(
        expect.arrayContaining([first.paymentId, direct.paymentId]),
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const corrected = await payment(client, f, {
        previous: direct,
        contractual: "150",
        due: "150",
        scheduleId: target.scheduleId,
        installmentId: target.installmentId,
      });
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const correctedDetail = await getDebtDetailInTransaction(
        transaction(client),
        { ...scope(f), debtId: f.debtId },
      );
      expect(correctedDetail.installments[0]).toMatchObject({
        paymentSatisfiedMinor: "450",
        remainingMinor: "550",
        openingSatisfiedMinor: "0",
      });
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const voided = await action(client, f, "debt_payment", corrected, "void");
      await finish(client, f, voided);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      const voidDetail = await getDebtDetailInTransaction(transaction(client), {
        ...scope(f),
        debtId: f.debtId,
      });
      expect(voidDetail.installments[0]).toMatchObject({
        paymentSatisfiedMinor: "300",
        remainingMinor: "700",
        openingSatisfiedMinor: "0",
      });
      expect(
        voidDetail.payments.find(
          (item) => item.actionRevisionId === voided.revisionId,
        ),
      ).toMatchObject({
        current: true,
        changeKind: "void",
        actualPaidMinor: null,
      });
    }));
});
