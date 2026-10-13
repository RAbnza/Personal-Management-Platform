import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { getAuthPool, closeRuntimeDatabasePools } from "@/platform/db/pools";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { listCategories } from "@/modules/core/services/list-categories";
import { openFinancialAccount } from "@/modules/finance/services/open-financial-account";
import {
  recordExpense,
  recordCardPurchase,
} from "@/modules/finance/services/record-expense";
import { recordIncome } from "@/modules/finance/services/record-income";
import { recordTransfer } from "@/modules/finance/services/record-transfer";
import { createCreditCard } from "@/modules/finance/services/credit-cards";
import { recordCardStatement } from "@/modules/finance/services/card-statements";
import { recordCardCommand } from "@/modules/finance/services/record-card-command";
import {
  recordCardAllocation,
  reverseCardAllocation,
} from "@/modules/finance/services/card-allocations";
import {
  recordCardInstallmentPlan,
  recordInstallmentApplication,
} from "@/modules/finance/services/card-installments";
import {
  getFinancialActionDetail,
  correctFinancialAction,
  reverseFinancialAction,
} from "@/modules/finance/services/correct-financial-action";
import { recordRecurringCommand } from "@/modules/planning/services/recurring";
import { getRecurringObligation } from "@/modules/planning/services/read-recurring";
import { recordSavingsGoalCommand } from "@/modules/planning/services/savings-goals";
import { recordBudgetCommand } from "@/modules/planning/services/budgets";
import {
  getForecast,
  getForecastInTransaction,
} from "@/modules/planning/services/get-forecast";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import { removeNamedFinancialFixture } from "./helpers/named-financial-fixture";
type Owner = { userId: string; workspaceId: string };
const label = "V2-E forecast fixture";
async function fixture(run: (o: Owner, other: Owner) => Promise<void>) {
  const owners: Owner[] = [];
  try {
    for (let n = 0; n < 2; n++) {
      const userId = randomUUID();
      await getAuthPool().query(
        'INSERT INTO auth."user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [userId, label, `${userId}@example.test`],
      );
      const w = await provisionPersonalWorkspace({
        userId,
        displayName: label,
      });
      owners.push({ userId, workspaceId: w.workspaceId });
    }
    await run(owners[0]!, owners[1]!);
  } finally {
    for (const o of owners) await removeNamedFinancialFixture(o, label);
  }
}
const cash = (o: Owner, amount = "10000") =>
  openFinancialAccount({
    ...o,
    clientCommandId: randomUUID(),
    name: "Forecast cash",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: amount,
  });
async function context(o: Owner) {
  const f = await getForecast(o);
  return {
    today: f.today,
    d: (n: number) => addCalendarDays(f.today, n),
    timezone: f.timezone,
  };
}
async function recurring(
  o: Owner,
  c: Awaited<ReturnType<typeof context>>,
  accountId: string | null,
  kind: "bill" | "income" = "bill",
  timezone = c.timezone,
) {
  return recordRecurringCommand({
    ...o,
    clientCommandId: randomUUID(),
    operation: "definition",
    obligationId: null,
    expectedVersion: null,
    name: `Expected ${kind}`,
    kind,
    reason: null,
    rule: {
      effectiveFrom: c.d(1),
      frequency: "daily",
      intervalCount: 1,
      weekdays: null,
      dayOfMonth: null,
      shortMonthPolicy: null,
      endsOn: c.d(4),
      occurrenceLimit: 4,
      expectedMinor: "3000",
      currency: "PHP",
      categoryId: null,
      defaultAccountId: accountId,
      timezone,
    },
    window: { from: c.d(1), through: c.d(2) },
  });
}
async function counts(o: Owner) {
  return withDomainTransaction(
    o,
    async (t) =>
      (
        await t.db.execute(
          sql`SELECT (SELECT count(*)::text FROM finance.financial_action) actions,(SELECT count(*)::text FROM finance.posting) postings,(SELECT count(*)::text FROM core.command_receipt) receipts,(SELECT count(*)::text FROM audit.private_revision) audits,(SELECT count(*)::text FROM planning.expected_occurrence) occurrences,(SELECT count(*)::text FROM planning.goal_reservation) reservations,(SELECT financial_revision::text FROM core.workspace WHERE id=${o.workspaceId}::uuid) revision`,
        )
      ).rows[0],
  );
}
async function cardSetup(o: Owner, c: Awaited<ReturnType<typeof context>>) {
  const card = await createCreditCard({
    ...o,
    clientCommandId: randomUUID(),
    name: "Forecast card",
    issuerName: "Verified provider",
  });
  const purchase = await recordCardPurchase({
    ...o,
    clientCommandId: randomUUID(),
    cardId: card.cardId,
    effectiveDate: c.d(-1),
    postingDate: c.d(-1),
    purchaseMinor: "10000",
    splits: [{ categoryId: null, amountMinor: "10000" }],
    description: "Original recognized purchase",
  });
  const stmt = await recordCardStatement({
    ...o,
    clientCommandId: randomUUID(),
    cardId: card.cardId,
    cycleStart: c.d(-14),
    cycleEnd: c.d(-1),
    statementDate: c.today,
    dueDate: c.d(5),
    balanceMinor: "10000",
    minimumDueMinor: "1000",
    openingBalanceMinor: "0",
    verificationSource: "Provider snapshot",
    verifiedDate: c.today,
    entries: [
      {
        description: "Original purchase",
        postingDate: c.d(-1),
        amountMinor: "10000",
        actionRevisionId: purchase.actionRevisionId,
      },
    ],
  });
  return { card, purchase, stmt };
}
afterAll(closeRuntimeDatabasePools);
describe("V2-E on-demand forecast integrity", () => {
  it("requires overlap review for unlinked future income and deducts supported partial links exactly once", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        r = await recurring(o, c, a.accountId, "income"),
        cat = (await listCategories({ ...o, kind: "income" })).items[0]!;
      const actual = await recordIncome({
        ...o,
        clientCommandId: randomUUID(),
        receivingAccountId: a.accountId,
        effectiveDate: c.d(1),
        amountMinor: "1000",
        incomeClass: "earned",
        categoryId: cat.categoryId,
        description: "Future recorded receipt awaiting source linkage",
      });
      const f = await getForecast({ ...o, scenario: { endDate: c.d(4) } });
      expect(f.totals).toMatchObject({
        openingActualMinor: "10000",
        recordedFutureNetMinor: "1000",
        expectedInflowsMinor: "0",
        closingProjectedMinor: "11000",
      });
      expect(
        f.sources
          .filter((s) => s.kind === "recurring_income")
          .every((s) => s.excludedReason?.includes("overlap")),
      ).toBe(true);
      expect(
        (
          await getForecast({
            ...o,
            scenario: { endDate: c.d(4), confirmIndependentRecurring: true },
          })
        ).totals.closingProjectedMinor,
      ).toBe("23000");
      const row = (
        await getRecurringObligation({ ...o, obligationId: r.obligationId! })
      ).occurrences.items[0]!;
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "link",
        occurrenceId: row.id,
        expectedVersion: 1,
        actionId: actual.actionId,
        actionRevisionId: actual.actionRevisionId,
        linkedMinor: "1000",
      });
      const linked = await getForecast({ ...o, scenario: { endDate: c.d(4) } });
      expect(linked.totals).toMatchObject({
        recordedFutureNetMinor: "1000",
        expectedInflowsMinor: "11000",
        closingProjectedMinor: "22000",
      });
      expect(
        linked.sources.find((s) => s.kind === "recorded_cash")?.unmatchedMinor,
      ).toBe("0");
    }));
  it("uses workspace-local date boundaries rather than the host timezone", () =>
    fixture(async (o) => {
      const a = await cash(o);
      await withDomainTransaction(o, (t) =>
        t.db.execute(
          sql`UPDATE core.workspace SET timezone='Pacific/Kiritimati' WHERE id=${o.workspaceId}::uuid`,
        ),
      );
      const c = await context(o),
        cat = (await listCategories({ ...o, kind: "income" })).items[0]!;
      await recordIncome({
        ...o,
        clientCommandId: randomUUID(),
        receivingAccountId: a.accountId,
        effectiveDate: c.today,
        amountMinor: "1000",
        incomeClass: "earned",
        categoryId: cat.categoryId,
        description: "Cash on the leading local date",
      });
      expect((await getForecast(o)).totals.openingActualMinor).toBe("11000");
      await withDomainTransaction(o, (t) =>
        t.db.execute(
          sql`UPDATE core.workspace SET timezone='Pacific/Pago_Pago' WHERE id=${o.workspaceId}::uuid`,
        ),
      );
      const f = await getForecast(o);
      expect(f.today < c.today).toBe(true);
      expect(f.timezone).toBe("Pacific/Pago_Pago");
      expect(f.totals).toMatchObject({
        openingActualMinor: "10000",
        recordedFutureNetMinor: "1000",
        closingProjectedMinor: "11000",
      });
    }));
  it("uses actual signed cash, future finalized evidence and neutral internal transfers once", () =>
    fixture(async (o) => {
      const a = await cash(o),
        b = await cash(o, "0"),
        c = await context(o),
        cat = (await listCategories({ ...o, kind: "income" })).items[0]!;
      await recordIncome({
        ...o,
        clientCommandId: randomUUID(),
        receivingAccountId: a.accountId,
        effectiveDate: c.d(2),
        amountMinor: "5000",
        incomeClass: "earned",
        categoryId: cat.categoryId,
        description: "Recorded future cash",
      });
      await recordTransfer({
        ...o,
        clientCommandId: randomUUID(),
        sourceAccountId: a.accountId,
        destinationAccountId: b.accountId,
        effectiveDate: c.d(3),
        destinationPrincipalMinor: "1000",
        description: "Internal transfer",
        fees: [],
      });
      const before = await counts(o),
        f = await getForecast({ ...o, scenario: { endDate: c.d(4) } });
      expect(f.totals).toMatchObject({
        openingActualMinor: "10000",
        recordedFutureNetMinor: "5000",
        expectedInflowsMinor: "0",
        closingProjectedMinor: "15000",
      });
      expect(f.sources.filter((s) => s.kind === "recorded_cash")).toHaveLength(
        1,
      );
      expect(await counts(o)).toEqual(before);
    }));
  it("derives unmaterialized rules, skips terminal records and preserves due overrides and partial actual links", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        r = await recurring(o, c, a.accountId),
        detail = await getRecurringObligation({
          ...o,
          obligationId: r.obligationId!,
        }),
        rows = detail.occurrences.items;
      const expense = await recordExpense({
        ...o,
        clientCommandId: randomUUID(),
        fundingAccountId: a.accountId,
        effectiveDate: c.today,
        purchaseMinor: "1000",
        splits: [{ categoryId: null, amountMinor: "1000" }],
        description: "Already recognized partial bill",
      });
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "link",
        occurrenceId: rows[0]!.id,
        expectedVersion: 1,
        actionId: expense.actionId,
        actionRevisionId: expense.actionRevisionId,
        linkedMinor: "1000",
      });
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "occurrence",
        occurrenceId: rows[1]!.id,
        expectedVersion: 1,
        change: "skip",
        dueDate: null,
        expectedMinor: null,
        reason: "Explicit skip",
      });
      const f = await getForecast({ ...o, scenario: { endDate: c.d(4) } });
      expect(f.totals).toMatchObject({
        openingActualMinor: "9000",
        expectedOutflowsMinor: "8000",
        closingProjectedMinor: "1000",
      });
      expect(
        f.sources.filter((s) => s.kind === "recurring_outflow"),
      ).toHaveLength(3);
      expect(
        f.sources.some((s) => s.provenance.startsWith("derived rule:")),
      ).toBe(true);
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "occurrence",
        occurrenceId: rows[0]!.id,
        expectedVersion: 2,
        change: "override",
        dueDate: c.d(6),
        expectedMinor: "3000",
        reason: "Provider moved due date",
      });
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(4) } })).totals
          .expectedOutflowsMinor,
      ).toBe("6000");
    }));
  it("does not revive cancelled rules, uses future supersession and stops archived generation", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        r = await recurring(o, c, a.accountId),
        detail = await getRecurringObligation({
          ...o,
          obligationId: r.obligationId!,
        }),
        row = detail.occurrences.items[0]!;
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "occurrence",
        occurrenceId: row.id,
        expectedVersion: 1,
        change: "cancel",
        dueDate: null,
        expectedMinor: null,
        reason: "Cancelled provider expectation",
      });
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(4) } })).totals
          .expectedOutflowsMinor,
      ).toBe("9000");
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "definition",
        obligationId: r.obligationId!,
        expectedVersion: 1,
        name: "Revised expectation",
        kind: "bill",
        reason: "New provider rule",
        rule: {
          ...detail.versions[0]!.rule,
          effectiveFrom: c.d(3),
          expectedMinor: "2000",
          endsOn: c.d(4),
        },
        window: { from: c.d(3), through: c.d(4) },
      });
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(4) } })).totals
          .expectedOutflowsMinor,
      ).toBe("7000");
      await recordRecurringCommand({
        ...o,
        clientCommandId: randomUUID(),
        operation: "archive",
        obligationId: r.obligationId!,
        expectedVersion: 2,
        reason: "Stop future expectations",
      });
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(4) } })).totals
          .expectedOutflowsMinor,
      ).toBe("0");
    }));
  it("requires explicit cash/calendar assumptions and discloses overdue expectations", () =>
    fixture(async (o) => {
      const c = await context(o);
      await recurring(o, c, null, "income", "America/New_York");
      const f = await getForecast({ ...o, scenario: { endDate: c.d(4) } });
      expect(f.totals.expectedInflowsMinor).toBe("0");
      expect(f.sources.every((s) => !s.included)).toBe(true);
      expect(
        (
          await getForecast({
            ...o,
            scenario: {
              endDate: c.d(4),
              includeUnassignedRecurring: true,
              useSourceCalendarDates: true,
            },
          })
        ).totals.expectedInflowsMinor,
      ).toBe("12000");
    }));
  it("treats statements/installments as alternatives and requires recurring overlap review", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        x = await cardSetup(o, c);
      await recurring(o, c, a.accountId);
      await recordCardInstallmentPlan({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        purchaseActionId: x.purchase.actionId,
        purchaseActionRevisionId: x.purchase.actionRevisionId,
        principalMinor: "10000",
        installmentCount: 2,
        providerConfirmed: true,
        verificationSource: "Provider schedule",
        verifiedDate: c.today,
        installments: [
          {
            dueDate: c.d(3),
            principalMinor: "5000",
            interestMinor: "0",
            feeMinor: "0",
            totalMinor: "5000",
          },
          {
            dueDate: c.d(20),
            principalMinor: "5000",
            interestMinor: "0",
            feeMinor: "0",
            totalMinor: "5000",
          },
        ],
      });
      const stmt = {
        cardId: x.card.cardId,
        basis: "statement" as const,
        statementId: x.stmt.statementId,
      };
      const f = await getForecast({
        ...o,
        scenario: { endDate: c.d(6), cards: [stmt] },
      });
      expect(f.totals.expectedOutflowsMinor).toBe("10000");
      expect(
        f.sources
          .filter((s) => s.kind === "installment")
          .every((s) => !s.included),
      ).toBe(true);
      expect(
        (
          await getForecast({
            ...o,
            scenario: {
              endDate: c.d(6),
              cards: [{ cardId: x.card.cardId, basis: "installments" }],
            },
          })
        ).totals.expectedOutflowsMinor,
      ).toBe("5000");
      expect(
        (
          await getForecast({
            ...o,
            scenario: {
              endDate: c.d(6),
              cards: [stmt],
              confirmIndependentRecurring: true,
            },
          })
        ).totals.expectedOutflowsMinor,
      ).toBe("22000");
    }));
  it("uses effective partial allocations, blocks unapplied credits and invalidates reversed allocations", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        x = await cardSetup(o, c),
        selection = {
          cards: [
            {
              cardId: x.card.cardId,
              basis: "statement" as const,
              statementId: x.stmt.statementId,
            },
          ],
          endDate: c.d(6),
        };
      const payment = await recordCardCommand({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        actionKind: "card_payment",
        payingAccountId: a.accountId,
        effectiveDate: c.today,
        postingDate: c.today,
        amountMinor: "2000",
        description: "Recorded real payment",
        providerConfirmed: true,
        confirmationSource: "Provider receipt",
      });
      expect(
        (await getForecast({ ...o, scenario: selection })).sources.find(
          (s) => s.kind === "statement",
        )?.excludedReason,
      ).toContain("Unapplied");
      const alloc = await recordCardAllocation({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        statementRevisionId: x.stmt.revisionId,
        sourceActionRevisionId: payment.actionRevisionId,
        amountMinor: "2000",
        confirmationKind: "user",
        confirmationSource: "Confirmed membership",
        confirmedDate: c.today,
      });
      const f = await getForecast({ ...o, scenario: selection });
      expect(f.totals).toMatchObject({
        openingActualMinor: "8000",
        expectedOutflowsMinor: "8000",
        closingProjectedMinor: "0",
      });
      await reverseCardAllocation({
        ...o,
        cardId: x.card.cardId,
        clientCommandId: randomUUID(),
        allocationId: alloc.allocationId,
        reason: "Provider corrected membership",
      });
      expect(
        (await getForecast({ ...o, scenario: selection })).sources.find(
          (s) => s.kind === "statement",
        )?.excludedReason,
      ).toContain("Unapplied");
    }));
  it("counts future booked payments once and uses only confirmed installment applications", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        x = await cardSetup(o, c);
      const plan = await recordCardInstallmentPlan({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        purchaseActionId: x.purchase.actionId,
        purchaseActionRevisionId: x.purchase.actionRevisionId,
        principalMinor: "10000",
        installmentCount: 2,
        providerConfirmed: true,
        verificationSource: "Provider installment arrangement",
        verifiedDate: c.today,
        installments: [
          {
            dueDate: c.d(3),
            principalMinor: "5000",
            interestMinor: "0",
            feeMinor: "0",
            totalMinor: "5000",
          },
          {
            dueDate: c.d(20),
            principalMinor: "5000",
            interestMinor: "0",
            feeMinor: "0",
            totalMinor: "5000",
          },
        ],
      });
      const payment = await recordCardCommand({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        actionKind: "card_payment",
        payingAccountId: a.accountId,
        effectiveDate: c.d(1),
        postingDate: c.d(1),
        amountMinor: "2000",
        description: "Finalized future-dated payment evidence",
        providerConfirmed: true,
        confirmationSource: "Provider recorded transfer",
      });
      const allocation = await recordCardAllocation({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        statementRevisionId: x.stmt.revisionId,
        sourceActionRevisionId: payment.actionRevisionId,
        amountMinor: "2000",
        confirmationKind: "provider",
        confirmationSource: "Provider statement allocation",
        confirmedDate: c.d(1),
      });
      const selection = {
        endDate: c.d(6),
        cards: [{ cardId: x.card.cardId, basis: "installments" as const }],
      };
      expect(
        (await getForecast({ ...o, scenario: selection })).sources.find(
          (s) => s.kind === "installment",
        )?.excludedReason,
      ).toContain("Unapplied");
      await recordInstallmentApplication({
        ...o,
        cardId: x.card.cardId,
        planId: plan.planId,
        clientCommandId: randomUUID(),
        planRevisionId: plan.revisionId,
        installmentNo: 1,
        allocationId: allocation.allocationId,
        principalMinor: "2000",
        interestMinor: "0",
        feeMinor: "0",
        confirmationKind: "provider",
        confirmationSource: "Provider installment satisfaction",
        confirmedDate: c.d(1),
      });
      const f = await getForecast({ ...o, scenario: selection });
      expect(f.totals).toMatchObject({
        openingActualMinor: "10000",
        recordedFutureNetMinor: "-2000",
        expectedOutflowsMinor: "3000",
        closingProjectedMinor: "5000",
      });
    }));
  it("keeps unknown schedule totals and reversed purchase plans explicit", () =>
    fixture(async (o) => {
      await cash(o);
      const c = await context(o),
        x = await cardSetup(o, c);
      await recordCardInstallmentPlan({
        ...o,
        clientCommandId: randomUUID(),
        cardId: x.card.cardId,
        purchaseActionId: x.purchase.actionId,
        purchaseActionRevisionId: x.purchase.actionRevisionId,
        principalMinor: "10000",
        installmentCount: 1,
        providerConfirmed: true,
        verificationSource: "Provider confirmed principal only",
        verifiedDate: c.today,
        installments: [
          {
            dueDate: null,
            principalMinor: "10000",
            interestMinor: null,
            feeMinor: null,
            totalMinor: null,
          },
        ],
      });
      const selection = {
          endDate: c.d(6),
          cards: [{ cardId: x.card.cardId, basis: "installments" as const }],
        },
        f = await getForecast({ ...o, scenario: selection });
      expect(f.coverage.unknownInstallmentDateCount).toBe(1);
      expect(f.sources.find((s) => s.kind === "installment")?.included).toBe(
        false,
      );
      const detail = await getFinancialActionDetail({
        ...o,
        actionId: x.purchase.actionId,
      });
      await reverseFinancialAction({
        ...o,
        clientCommandId: randomUUID(),
        actionId: x.purchase.actionId,
        expectedActionRevisionId: detail.current.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason: "Reverse mistaken originating purchase",
        acknowledgeNegativeBalance: true,
      });
      expect(
        (await getForecast({ ...o, scenario: selection })).sources.find(
          (s) => s.kind === "installment",
        )?.excludedReason,
      ).toContain("reconciliation");
    }));
  it("preserves physical cash separately from savings, budgets and negative scenarios", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        g = await recordSavingsGoalCommand({
          ...o,
          operation: "save",
          clientCommandId: randomUUID(),
          goalId: null,
          expectedVersion: null,
          reason: null,
          fields: { name: "Reserved goal", targetMinor: "5000" },
        });
      await recordSavingsGoalCommand({
        ...o,
        operation: "reserve",
        clientCommandId: randomUUID(),
        goalId: g.goalId,
        expectedVersion: 1,
        expectedFinancialRevision: g.financialRevision,
        financialAccountId: a.accountId,
        reservedMinor: "5000",
        reason: "Conceptual only",
      });
      const cat = (await listCategories({ ...o, kind: "expense" })).items[0]!;
      await recordBudgetCommand({
        ...o,
        operation: "save",
        clientCommandId: randomUUID(),
        budgetId: null,
        expectedVersion: null,
        reason: null,
        fields: {
          categoryId: cat.categoryId,
          startDate: c.today,
          endDateExclusive: c.d(20),
          limitMinor: "999999",
          basis: "net",
          notes: null,
        },
      });
      const before = await counts(o),
        f = await getForecast({
          ...o,
          scenario: {
            endDate: c.d(2),
            adjustments: [
              {
                label: "Explicit cash stress",
                date: c.d(1),
                direction: "outflow",
                amountMinor: "12000",
              },
            ],
          },
        });
      expect(f.totals).toMatchObject({
        openingActualMinor: "10000",
        expectedOutflowsMinor: "0",
        closingProjectedMinor: "-2000",
      });
      expect(f.closingLessReservationsMinor).toBe("-7000");
      expect(f.savings.summary.reservedMinor).toBe("5000");
      expect(await counts(o)).toEqual(before);
    }));
  it("recalculates future cash after corrections/reversals and preserves one stable snapshot", () =>
    fixture(async (o) => {
      const a = await cash(o),
        c = await context(o),
        e = await recordExpense({
          ...o,
          clientCommandId: randomUUID(),
          fundingAccountId: a.accountId,
          effectiveDate: c.d(2),
          purchaseMinor: "1000",
          splits: [{ categoryId: null, amountMinor: "1000" }],
          description: "Future actual expense",
        });
      const detail = await getFinancialActionDetail({
        ...o,
        actionId: e.actionId,
      });
      await correctFinancialAction({
        ...o,
        clientCommandId: randomUUID(),
        actionId: e.actionId,
        expectedActionRevisionId: detail.current.actionRevisionId,
        expectedFinancialRevision: detail.current.financialRevision,
        reason: "Correct recorded amount",
        replacement: {
          ...detail.replacement!,
          purchaseMinor: "2000",
          splits: [{ categoryId: null, amountMinor: "2000" }],
        } as NonNullable<typeof detail.replacement>,
      });
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(3) } })).totals
          .recordedFutureNetMinor,
      ).toBe("-2000");
      await withDomainTransaction(
        o,
        async (t) => {
          const before = await getForecastInTransaction(t, o.workspaceId, {
              endDate: c.d(3),
            }),
            d = await getFinancialActionDetail({ ...o, actionId: e.actionId });
          await reverseFinancialAction({
            ...o,
            clientCommandId: randomUUID(),
            actionId: e.actionId,
            expectedActionRevisionId: d.current.actionRevisionId,
            expectedFinancialRevision: d.current.financialRevision,
            reason: "Reverse future entry",
            acknowledgeNegativeBalance: true,
          });
          expect(
            await getForecastInTransaction(t, o.workspaceId, {
              endDate: c.d(3),
            }),
          ).toEqual(before);
        },
        { readOnlySnapshot: true },
      );
      expect(
        (await getForecast({ ...o, scenario: { endDate: c.d(3) } })).totals
          .recordedFutureNetMinor,
      ).toBe("0");
    }));
  it("enforces active-owner RLS, rejects foreign scenario references and runs in a read-only transaction", () =>
    fixture(async (o, other) => {
      await cash(o);
      const c = await context(o),
        x = await cardSetup(o, c);
      expect((await getForecast(other)).totals.openingActualMinor).toBe("0");
      expect((await getForecast(other)).cardOptions).toEqual([]);
      await expect(
        getForecast({
          ...other,
          scenario: {
            cards: [
              {
                cardId: x.card.cardId,
                basis: "statement",
                statementId: x.stmt.statementId,
              },
            ],
          },
        }),
      ).rejects.toThrow("owned");
      await expect(
        getForecast({ ...other, workspaceId: o.workspaceId }),
      ).rejects.toThrow("Workspace unavailable");
      await withDomainTransaction(
        o,
        async (t) => {
          await expect(
            t.db.execute(
              sql`UPDATE core.workspace SET week_start=1 WHERE id=${o.workspaceId}::uuid`,
            ),
          ).rejects.toMatchObject({ cause: { code: "25006" } });
        },
        { readOnlySnapshot: true },
      );
    }));
});
