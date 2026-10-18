import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { presets } from "@/modules/trackers/domain/presets";
import { addCalendarDays } from "@/modules/reporting/domain/period";

export async function seedM6Inventory(page: Page) {
  const post = async (path: string, data: object, status = 201) => {
    const r = await page.request.post(path, {
      headers: { origin: "http://localhost:3100" },
      data: { clientCommandId: randomUUID(), ...data },
    });
    expect(r.status(), `${path}: ${await r.text()}`).toBe(status);
    return r.json();
  };
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const before = addCalendarDays(today, -1),
    future = addCalendarDays(today, 10);
  const account = await post("/api/v1/accounts", {
    name: "M6 acceptance wallet",
    accountType: "cash",
    openingCutoffDate: before,
    openingBalanceMinor: "1000000",
  });
  const action = await post("/api/v1/financial-actions", {
    actionKind: "expense",
    fundingAccountId: account.accountId,
    effectiveDate: today,
    purchaseMinor: "12345",
    description: "M6 exact purchase",
    splits: [{ amountMinor: "12345" }],
  });
  const debt = await post("/api/v1/debts", {
    name: "M6 imported loan",
    lenderName: "Synthetic lender",
    debtType: "personal_loan",
    startDate: before,
    openingCutoffDate: before,
    openingLiabilityMinor: "50000",
    openingComponents: [{ kind: "principal", amountMinor: "50000" }],
    installments: [
      {
        dueDate: future,
        contractualMinor: "50000",
        knownPrincipalMinor: "50000",
        knownInterestMinor: "0",
        knownFeeMinor: "0",
        breakdownComplete: true,
      },
    ],
    scheduleReason: "Acceptance provider evidence",
  });
  const card = await post("/api/v1/credit-cards", {
    name: "M6 synthetic card",
    issuerName: "Synthetic provider",
  });
  const purchase = await post("/api/v1/financial-actions", {
    actionKind: "card_purchase",
    cardId: card.cardId,
    effectiveDate: today,
    postingDate: today,
    purchaseMinor: "30000",
    splits: [{ categoryId: null, amountMinor: "30000" }],
    description: "M6 card purchase",
  });
  const statement = await post(
    `/api/v1/credit-cards/${card.cardId}/statements`,
    {
      cycleStart: before,
      cycleEnd: today,
      statementDate: today,
      dueDate: future,
      balanceMinor: "30000",
      minimumDueMinor: "1000",
      verificationSource: "Synthetic statement",
      verifiedDate: today,
      entries: [],
    },
  );
  const plan = await post(`/api/v1/credit-cards/${card.cardId}/installments`, {
    purchaseActionId: purchase.actionId,
    purchaseActionRevisionId: purchase.actionRevisionId,
    principalMinor: "30000",
    installmentCount: 1,
    verificationSource: "Synthetic schedule",
    verifiedDate: today,
    providerConfirmed: true,
    installments: [
      {
        principalMinor: "30000",
        dueDate: future,
        interestMinor: "0",
        feeMinor: "0",
        totalMinor: "30000",
      },
    ],
  });
  const cats = await (
    await page.request.get("/api/v1/categories?kind=expense")
  ).json();
  const budget = await post(
    "/api/v1/budgets",
    {
      operation: "save",
      budgetId: null,
      expectedVersion: null,
      reason: null,
      fields: {
        categoryId: cats.items[0].categoryId,
        startDate: today,
        endDateExclusive: future,
        limitMinor: "20000",
        basis: "net",
        notes: null,
      },
    },
    200,
  );
  const goal = await post(
    "/api/v1/savings-goals",
    {
      operation: "save",
      goalId: null,
      expectedVersion: null,
      reason: null,
      fields: {
        name: "M6 savings",
        targetMinor: "100000",
        targetDate: null,
        notes: null,
      },
    },
    200,
  );
  const recurring = await post(
    "/api/v1/recurring-obligations",
    {
      operation: "definition",
      obligationId: null,
      expectedVersion: null,
      name: "M6 recurring bill",
      kind: "bill",
      reason: null,
      rule: {
        effectiveFrom: today,
        frequency: "daily",
        intervalCount: 1,
        weekdays: null,
        dayOfMonth: null,
        shortMonthPolicy: null,
        endsOn: null,
        occurrenceLimit: 2,
        expectedMinor: "1000",
        currency: "PHP",
        categoryId: null,
        defaultAccountId: account.accountId,
        timezone: "Asia/Manila",
      },
      window: { from: today, through: future },
    },
    200,
  );
  const application = await post("/api/v1/applications", {
    companyName: "M6 synthetic company",
    roleTitle: "Engineer",
    initialStage: "applied",
    initialStageEffectiveDate: today,
    appliedDate: today,
  });
  const event = await post("/api/v1/personal-events", {
    title: "M6 civil event",
    temporalKind: "date",
    eventDate: today,
  });
  const tracker = await post(
    "/api/v1/trackers",
    { operation: "preset", preset: "tasks", name: "M6 task tracker" },
    200,
  );
  const entry = await post(
    "/api/v1/trackers",
    {
      operation: "save_entry",
      trackerId: tracker.trackerId,
      entryId: null,
      expectedRevisionId: null,
      values: { title: "M6 task" },
      reason: "Acceptance",
    },
    200,
  );
  const definition = structuredClone(presets.tasks);
  definition.fields[0]!.label = "Reviewed task title";
  const version = await post(
    "/api/v1/trackers",
    {
      operation: "publish",
      templateId: tracker.templateId,
      expectedVersionId: tracker.versionId,
      definition,
      reason: "Acceptance compatible revision",
    },
    200,
  );
  const migration = await post(
    "/api/v1/trackers",
    {
      operation: "preview",
      trackerId: tracker.trackerId,
      toVersionId: version.versionId,
      rules: {},
    },
    200,
  );
  const generated = await (
    await page.request.get(
      `/api/v1/recurring-obligations?obligationId=${recurring.obligationId}`,
    )
  ).json();
  const routes = [
    "/",
    "/onboarding",
    "/help",
    "/help/support",
    "/settings",
    "/settings/sessions",
    "/settings/notifications",
    "/settings/files",
    "/settings/portability",
    "/settings/lifecycle",
    "/money/accounts",
    `/money/accounts/${account.accountId}/history`,
    `/money/accounts/${account.accountId}/reconcile`,
    "/money/actions",
    `/money/actions/${action.actionId}`,
    "/money/transactions?kind=income",
    "/money/transactions?kind=expense",
    "/money/transfers",
    "/money/debts",
    "/money/debts/import",
    "/money/debts/borrow",
    ...["", "/pay", "/settle", "/revise-schedule"].map(
      (t) => `/money/debts/${debt.debtId}${t}`,
    ),
    "/money/cards",
    ...[
      "",
      "/commands/new",
      "/statements",
      "/statements/new",
      "/installments",
      "/installments/new",
    ].map((t) => `/money/cards/${card.cardId}${t}`),
    ...["", "/revise", "/allocations"].map(
      (t) =>
        `/money/cards/${card.cardId}/statements/${statement.statementId}${t}`,
    ),
    ...["", "/revise", "/applications"].map(
      (t) => `/money/cards/${card.cardId}/installments/${plan.planId}${t}`,
    ),
    "/money/recurring",
    `/money/recurring/${recurring.obligationId}`,
    "/money/budgets",
    `/money/budgets/${budget.budgetId}`,
    "/money/goals",
    `/money/goals/${goal.goalId}`,
    "/money/forecasts",
    "/career/applications",
    "/career/applications/new",
    `/career/applications/${application.applicationId}`,
    "/calendar",
    `/calendar/events/${event.eventId}`,
    `/calendar/reminders/personal_event/${event.eventId}`,
    "/trackers",
    `/trackers/${tracker.trackerId}`,
    `/trackers/entries/${entry.entryId}`,
    "/trackers/templates/new",
    `/trackers/templates/${tracker.templateId}`,
    `/trackers/versions/${version.versionId}`,
    `/trackers/migrations/${migration.migrationId}`,
    "/trackers/reports",
    "/reports",
    "/reports/financial",
    "/reports/career",
    `/reports/financial/detail?period=custom&startDate=${today}&endDate=${today}&metric=net`,
    `/dashboard/spending?startDate=${today}&endDate=${today}`,
    "/sharing",
    "/sharing/invitations",
  ];
  const occurrence = generated.occurrences.items[0]?.id;
  expect(
    occurrence,
    "Generated recurring source is required for route coverage",
  ).toBeTruthy();
  routes.push(`/money/recurring/occurrences/${occurrence}`);
  return {
    routes,
    today,
    account,
    card,
    application,
    event,
    tracker,
    version,
    migration,
    post,
  };
}
