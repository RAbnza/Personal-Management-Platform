import { expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const origin = { origin: "http://localhost:3100" };
async function visitWithDelayedHydration(
  page: Page,
  path: string,
  field: string,
) {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = "**/_next/static/chunks/*.js*";
  const holdScript = async (route: Route) => {
    await ready;
    await route.continue();
  };
  await page.route(pattern, holdScript);
  try {
    await page.goto(path, { waitUntil: "commit" });
    await expect(page.getByLabel(field, { exact: true })).toBeDisabled();
    release();
    await expect(page.getByLabel(field, { exact: true })).toBeEnabled();
  } finally {
    release();
    await page.unroute(pattern, holdScript);
  }
}
async function postCommand(page: Page, path: string, data: object) {
  const result = await page.request.post(path, { headers: origin, data });
  expect(result.status()).toBe(201);
  return result.json();
}
async function fillImport(page: Page, name: string) {
  await page.goto("/money/debts/import");
  await page.getByLabel("Debt name", { exact: true }).fill(name);
  await page.getByLabel("Lender / provider").fill("Provider evidence");
  await page.getByLabel("Debt start date").fill("2026-01-01");
  await page.getByLabel("Opening cutoff date (end of day)").fill("2026-10-01");
  await page.getByLabel("Recognized opening liability (PHP)").fill("6400.00");
  await page.getByLabel("Component 1 amount (PHP)").fill("6400.00");
}

test("backdated correction and later refund preserve history and reconcile exact reports", async ({
  page,
  owner,
}) => {
  test.setTimeout(60000);
  await signIn(page, owner);
  const account = await postCommand(page, "/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Correction browser cash",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "1000000",
  });
  const purchase = await postCommand(page, "/api/v1/financial-actions", {
    actionKind: "expense",
    clientCommandId: randomUUID(),
    fundingAccountId: account.accountId,
    effectiveDate: "2026-10-05",
    purchaseMinor: "10000",
    description: "Preserved corrected purchase",
    splits: [{ amountMinor: "4000" }, { amountMinor: "6000" }],
  });
  await visitWithDelayedHydration(
    page,
    `/money/actions/${purchase.actionId}`,
    "Effective date",
  );
  await page.getByLabel("Effective date", { exact: true }).fill("2026-10-03");
  await page.getByLabel("Purchase amount", { exact: true }).fill("120.00");
  const splits = page.getByRole("group", {
    name: "Category portions",
    exact: true,
  });
  await splits.getByLabel("Amount", { exact: true }).nth(0).fill("50.00");
  await splits.getByLabel("Amount", { exact: true }).nth(1).fill("70.00");
  await page
    .getByLabel("Required reason", { exact: true })
    .fill("Correct receipt amount and actual date");
  await page
    .getByRole("button", { name: "Review exact changes", exact: true })
    .click();
  await expect(
    page.getByLabel("Exact financial review", { exact: true }),
  ).toContainText("2026-10-03");
  await page
    .getByRole("checkbox", { name: /I confirm the exact dates/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/saved/i);
  await page.reload();
  await page
    .getByRole("button", { name: "Record genuine refund", exact: true })
    .click();
  await page.getByLabel("Effective date", { exact: true }).fill("2026-10-08");
  await page
    .getByRole("button", { name: "Add refund portions", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Refund portions", exact: true })
    .getByLabel("Amount", { exact: true })
    .fill("20.00");
  await page
    .getByRole("button", { name: "Review exact changes", exact: true })
    .click();
  await expect(
    page.getByLabel("Exact financial review", { exact: true }),
  ).toContainText("2026-10-08");
  await page
    .getByRole("checkbox", { name: /I confirm the exact dates/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/saved/i);
  const beforeRefund = await (
    await page.request.get(
      "/api/v1/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-04",
    )
  ).json();
  expect(beforeRefund.metrics.net).toBe("12000");
  const report = await (
    await page.request.get(
      "/api/v1/reports/financial?period=month&anchorDate=2026-10-01",
    )
  ).json();
  expect(report.metrics.net).toBe("10000");
  expect(report.metrics.income).toBe("0");
  expect(report.metrics.closing_cash).toBe("990000");
  await page.goto(`/money/accounts/${account.accountId}/history`);
  await expect(
    page.getByText("Preserved corrected purchase", { exact: true }).first(),
  ).toBeVisible();
});

test("reconciliation compares without automatic adjustment and reviews an explicit equity correction", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const account = await postCommand(page, "/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Reconciliation browser cash",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "200000",
  });
  await page.goto(`/money/accounts/${account.accountId}/reconcile`);
  await page
    .getByLabel("Comparison cutoff date", { exact: true })
    .fill("2026-10-01");
  await page
    .getByLabel("Observed/provider balance", { exact: true })
    .fill("2100.00");
  await page
    .getByRole("button", { name: "Review comparison", exact: true })
    .click();
  await expect(page.getByLabel("Exact confirmation preview")).toContainText(
    "PHP 100.00",
  );
  await expect(page.getByLabel("Exact confirmation preview")).toContainText(
    "Saving does not adjust the balance.",
  );
  await page
    .getByRole("button", { name: "Confirm comparison", exact: true })
    .click();
  await expect(
    page.getByText("Comparison recorded. No balance adjustment was made.", {
      exact: true,
    }),
  ).toBeVisible();
  let accounts = await (await page.request.get("/api/v1/accounts")).json();
  expect(JSON.stringify(accounts)).toContain('"200000"');
  await page.reload();
  await page
    .getByRole("button", { name: "Record explicit adjustment", exact: true })
    .click();
  await page
    .getByLabel("Adjustment effective date", { exact: true })
    .fill("2026-10-01");
  await page
    .getByLabel("Signed adjustment amount", { exact: true })
    .fill("100.00");
  await page
    .getByLabel("Adjustment reason", { exact: true })
    .fill("Explicit unexplained provider difference");
  await page
    .getByRole("button", { name: "Review adjustment", exact: true })
    .click();
  await expect(page.getByLabel("Exact confirmation preview")).toContainText(
    "Income: PHP 0.00. Spending: PHP 0.00.",
  );
  await page
    .getByRole("button", { name: "Confirm explicit adjustment", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/adjustment.*recorded/i);
  accounts = await (await page.request.get("/api/v1/accounts")).json();
  expect(JSON.stringify(accounts)).toContain('"210000"');
  const report = await (
    await page.request.get(
      "/api/v1/reports/financial?period=month&anchorDate=2026-10-01",
    )
  ).json();
  expect(report.metrics.income).toBe("0");
  expect(report.metrics.net).toBe("0");
  expect(report.metrics.closing_cash).toBe("210000");
});
test("D6b imported debt preserves paid history, overdue and future dues, exact preview and opening-only effects at 320px", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  await fillImport(page, "Verified historical loan");
  for (const [index, date, amount, satisfied] of [
    [0, "2026-09-01", "1000.00", "1000.00"],
    [1, "2026-10-08", "2000.00", "0.00"],
    [2, "2026-11-01", "5400.00", "0.00"],
  ] as const) {
    await page
      .getByRole("button", { name: "Add installment", exact: true })
      .click();
    await page.getByLabel("Due date", { exact: true }).nth(index).fill(date);
    await page
      .getByLabel("Contractual amount (PHP)", { exact: true })
      .nth(index)
      .fill(amount);
    await page
      .getByLabel("Already satisfied at cutoff (PHP)", { exact: true })
      .nth(index)
      .fill(satisfied);
  }
  await page
    .getByLabel("Schedule / historical evidence and limitations")
    .fill(
      "Provider supplied historical satisfaction; accounting components remain unclassified.",
    );
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(page.getByLabel("Import preview")).toBeFocused();
  await expect(page.getByLabel("Import preview")).toContainText("PHP 6,400.00");
  await expect(page.getByLabel("Import preview")).toContainText("PHP 7,400.00");
  await expect(page.getByLabel("Import preview")).toContainText(
    "No historical payment is posted",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/d6b-review-320.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page).toHaveURL(/\/money\/debts\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", {
      name: "Verified historical loan",
      exact: true,
    }),
  ).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const detail = await (await page.request.get(`/api/v1/debts/${id}`)).json();
  expect(detail.debt.recognizedLiabilityMinor).toBe("640000");
  expect(
    detail.installments.map(
      (i: { remainingMinor: string }) => i.remainingMinor,
    ),
  ).toEqual(["0", "200000", "540000"]);
  const agenda = await (
    await page.request.get(
      "/api/v1/agenda?startDate=2026-09-01&endDate=2026-11-30",
    )
  ).json();
  expect(JSON.stringify(agenda)).not.toContain('"2026-09-01"');
  await page.screenshot({
    path: "test-results/d6b-detail-320.png",
    fullPage: true,
  });
});
test("D6b unknown schedule stays unknown and a lost committed response safely replays the exact import", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  await fillImport(page, "No invented dues");
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(page.getByLabel("Import preview")).toContainText(
    /Unknown|not supplied/i,
  );
  let payload = "",
    first = true;
  await page.route("**/api/v1/debts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (first) {
      first = false;
      payload = route.request().postData()!;
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      await route.abort("failed");
    } else {
      expect(route.request().postData()).toBe(payload);
      await route.continue();
    }
  });
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByText(/couldn't confirm whether/i)).toBeVisible();
  await page.getByRole("button", { name: /Retry/i }).click();
  await expect(page).toHaveURL(/\/money\/debts\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  const detail = await (await page.request.get(`/api/v1/debts/${id}`)).json();
  expect(detail.installments).toHaveLength(0);
  expect(detail.debt.recognizedLiabilityMinor).toBe("640000");
  const list = await (await page.request.get("/api/v1/debts")).json();
  expect(JSON.stringify(list).match(/No invented dues/g)).toHaveLength(1);
});
test("salary and gift use selected accounts; transfer fee and category splits reconcile with one cash deduction", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  async function post(path: string, data: object) {
    const r = await page.request.post(path, { headers: origin, data });
    expect(r.status()).toBe(201);
    return r.json();
  }
  const bank = await post("/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "BDO",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "200000",
  });
  const wallet = await post("/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "GCash",
    accountType: "e_wallet",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "20000",
  });
  await post("/api/v1/financial-actions", {
    actionKind: "income",
    clientCommandId: randomUUID(),
    receivingAccountId: bank.accountId,
    effectiveDate: "2026-10-02",
    amountMinor: "1000000",
    incomeClass: "earned",
    description: "Salary into BDO",
  });
  await post("/api/v1/financial-actions", {
    actionKind: "income",
    clientCommandId: randomUUID(),
    receivingAccountId: wallet.accountId,
    effectiveDate: "2026-10-02",
    amountMinor: "50000",
    incomeClass: "gift",
    description: "Gift into GCash",
  });
  const accounts = await (await page.request.get("/api/v1/accounts")).json();
  expect(JSON.stringify(accounts)).toContain('"1200000"');
  expect(JSON.stringify(accounts)).toContain('"70000"');
  await post("/api/v1/financial-actions", {
    actionKind: "expense",
    clientCommandId: randomUUID(),
    fundingAccountId: bank.accountId,
    effectiveDate: "2026-10-03",
    purchaseMinor: "10000",
    description: "One split purchase",
    splits: [{ amountMinor: "4000" }, { amountMinor: "6000" }],
  });
  await page.goto("/money/transfers");
  await page
    .getByLabel("Source account", { exact: true })
    .selectOption(bank.accountId);
  await page
    .getByLabel("Destination account", { exact: true })
    .selectOption(wallet.accountId);
  await page.getByLabel("Transfer date", { exact: true }).fill("2026-10-04");
  await page
    .getByLabel("Amount destination receives (PHP)", { exact: true })
    .fill("500.00");
  await page.getByRole("button", { name: "Add fee", exact: true }).click();
  await page.getByLabel("Fee amount 1 (PHP)", { exact: true }).fill("15.00");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Transfer with external fee");
  await expect(page.getByLabel("Transfer preview")).toContainText("PHP 515.00");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Save completed transfer", exact: true })
    .click();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  const afterTransfer = await (
    await page.request.get("/api/v1/accounts")
  ).json();
  expect(JSON.stringify(afterTransfer)).toContain('"1138500"');
  expect(JSON.stringify(afterTransfer)).toContain('"120000"');
  await page.goto("/money/debts/borrow");
  await page.getByLabel("Lender / provider", { exact: true }).fill("Provider");
  await page.getByLabel("Borrowing date", { exact: true }).fill("2026-10-05");
  await page
    .getByLabel("Receiving account", { exact: true })
    .selectOption(bank.accountId);
  await page
    .getByLabel("Contractual principal (PHP)", { exact: true })
    .fill("10000.00");
  await page
    .getByLabel("Cash actually received (PHP)", { exact: true })
    .fill("9800.00");
  await page.getByRole("button", { name: "Add fee", exact: true }).click();
  await page.getByLabel("Fee amount 1 (PHP)", { exact: true }).fill("200.00");
  await page
    .getByLabel("Debt name", { exact: true })
    .fill("Net disbursement loan");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Confirmed net loan proceeds");
  await page
    .getByRole("button", { name: "Review borrowing", exact: true })
    .click();
  await expect(page.getByLabel("Borrowing preview")).toContainText(
    "PHP 9,800.00",
  );
  await expect(page.getByLabel("Borrowing preview")).toContainText(
    "PHP 10,000.00",
  );
  await expect(page.getByLabel("Borrowing preview")).toContainText(
    "PHP 200.00",
  );
  await page
    .getByRole("button", { name: "Confirm borrowing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/money\/debts\/[a-f0-9-]+$/);
  const report = await (
    await page.request.get(
      "/api/v1/reports/financial?period=month&anchorDate=2026-10-01",
    )
  ).json();
  expect(report.metrics.income).toBe("1050000");
  await page.goto(`/money/accounts/${bank.accountId}/history`);
  await expect(
    page.getByText("Salary into BDO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("One split purchase", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("payment, date revision and early settlement preserve historical satisfaction and deduct cash once", async ({
  page,
  owner,
}) => {
  test.setTimeout(60000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  async function post(path: string, data: object) {
    const r = await page.request.post(path, { headers: origin, data });
    expect(r.status()).toBe(201);
    return r.json();
  }
  const account = await post("/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Payment bank",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "200000",
  });
  const debt = await post("/api/v1/debts", {
    clientCommandId: randomUUID(),
    name: "Reviewed payment loan",
    lenderName: "Provider",
    debtType: "personal_loan",
    startDate: "2026-01-01",
    openingCutoffDate: "2026-10-01",
    openingLiabilityMinor: "100000",
    openingComponents: [{ kind: "principal", amountMinor: "100000" }],
    installments: [
      {
        dueDate: "2026-11-01",
        contractualMinor: "100000",
        openingSatisfiedMinor: "0",
      },
    ],
    scheduleReason: "Confirmed terms",
  });
  await visitWithDelayedHydration(
    page,
    `/money/debts/${debt.debtId}/pay`,
    "Payment date",
  );
  await page.getByLabel("Payment date", { exact: true }).fill("2026-10-02");
  await page
    .getByLabel("Actual total cash paid (PHP)", { exact: true })
    .fill("410.00");
  await page
    .getByLabel("Contractual portion (PHP)", { exact: true })
    .fill("400.00");
  await page
    .getByLabel("External payment fee (PHP)", { exact: true })
    .fill("10.00");
  await page
    .getByLabel("Accounting certainty", { exact: true })
    .selectOption("known_components");
  await page
    .getByLabel("Accounting meaning 1", { exact: true })
    .selectOption("liability_reduction");
  await page
    .getByLabel("Recognized liability component 1", { exact: true })
    .selectOption("principal");
  await page
    .getByLabel("Component amount 1 (PHP)", { exact: true })
    .fill("400.00");
  await page
    .getByRole("button", { name: "Propose oldest due first", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I confirm the installment allocations/ })
    .check();
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await expect(page.getByLabel("Payment review")).toContainText("PHP 410.00");
  await expect(page.getByLabel("Payment review")).toContainText("PHP 400.00");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/debts/${debt.debtId}$`));
  let detail = await (
    await page.request.get(`/api/v1/debts/${debt.debtId}`)
  ).json();
  expect(detail.installments[0].remainingMinor).toBe("60000");
  expect(detail.installments[0].openingSatisfiedMinor).toBe("0");
  await page.goto(`/money/debts/${debt.debtId}/revise-schedule`);
  await page.getByLabel("Due date 1", { exact: true }).fill("2026-12-01");
  await expect(page.getByLabel("Due date 1", { exact: true })).toHaveValue(
    "2026-12-01",
  );
  await page
    .getByLabel("Revision effective date", { exact: true })
    .fill("2026-10-03");
  await page
    .getByLabel("Revision reason", { exact: true })
    .fill("Provider corrected due date");
  await page.getByRole("checkbox", { name: /confirm/i }).check();
  await page
    .getByRole("button", { name: "Review schedule revision", exact: true })
    .click();
  await expect(page.getByLabel("Schedule revision review")).toContainText(
    "2026-12-01",
  );
  await expect(page.getByLabel("Schedule revision review")).toContainText(
    "PHP 600.00",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm schedule revision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Schedule revision saved",
  );
  detail = await (
    await page.request.get(`/api/v1/debts/${debt.debtId}`)
  ).json();
  expect(detail.installments[0].remainingMinor).toBe("60000");
  expect(detail.debt.recognizedLiabilityMinor).toBe("60000");
  await page.goto(`/money/debts/${debt.debtId}/settle`);
  await page.getByLabel("Settlement date", { exact: true }).fill("2026-10-04");
  await page
    .getByLabel("Paying account", { exact: true })
    .selectOption(account.accountId);
  await page.getByLabel("Actual cash paid", { exact: true }).fill("600.00");
  await page
    .getByLabel("Provider-confirmed payoff (excluding external fee)", {
      exact: true,
    })
    .fill("600.00");
  await page.getByLabel("principal repayment", { exact: true }).fill("600.00");
  await page
    .getByRole("button", { name: "Propose oldest due first", exact: true })
    .click();
  await page
    .getByLabel("Confirmation evidence", { exact: true })
    .fill("Provider confirmed final payoff");
  await page
    .getByLabel("Settlement reason", { exact: true })
    .fill("Paying early with confirmed payoff");
  await page
    .getByRole("checkbox", { name: /I confirm the contractual allocations/ })
    .check();
  await page
    .getByRole("button", {
      name: "Validate and review settlement",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review verified settlement" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm and save settlement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settlement saved", exact: true }),
  ).toBeVisible();
  detail = await (
    await page.request.get(`/api/v1/debts/${debt.debtId}`)
  ).json();
  expect(detail.debt.lifecycle).toBe("settled_early");
  expect(detail.debt.recognizedLiabilityMinor).toBe("0");
  const accounts = await (await page.request.get("/api/v1/accounts")).json();
  expect(JSON.stringify(accounts)).toContain('"99000"');
  const agenda = await (
    await page.request.get(
      "/api/v1/agenda?startDate=2026-11-01&endDate=2026-12-31",
    )
  ).json();
  expect(JSON.stringify(agenda)).not.toContain(debt.debtId);
});

test("full payment without provider due dates keeps an explicit unapplied contractual amount", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  async function post(path: string, data: object) {
    const r = await page.request.post(path, { headers: origin, data });
    expect(r.status()).toBe(201);
    return r.json();
  }
  await post("/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Full payment bank",
    accountType: "checking",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "200000",
  });
  const debt = await post("/api/v1/debts", {
    clientCommandId: randomUUID(),
    name: "No-dates full payoff",
    lenderName: "Provider",
    debtType: "personal_loan",
    startDate: "2026-01-01",
    openingCutoffDate: "2026-10-01",
    openingLiabilityMinor: "50000",
    openingComponents: [{ kind: "principal", amountMinor: "50000" }],
    installments: [],
    scheduleReason: "No supplied dues",
  });
  await page.goto(`/money/debts/${debt.debtId}/pay`);
  await page
    .getByLabel("Actual total cash paid (PHP)", { exact: true })
    .fill("500.00");
  await page
    .getByLabel("Contractual portion (PHP)", { exact: true })
    .fill("500.00");
  await page.getByLabel("Payment date", { exact: true }).fill("2026-10-02");
  await page
    .getByLabel("Accounting certainty", { exact: true })
    .selectOption("known_components");
  await page
    .getByLabel("Accounting meaning 1", { exact: true })
    .selectOption("liability_reduction");
  await page
    .getByLabel("Recognized liability component 1", { exact: true })
    .selectOption("principal");
  await page
    .getByLabel("Component amount 1 (PHP)", { exact: true })
    .fill("500.00");
  await page
    .getByRole("button", {
      name: "Leave contractual amount unapplied",
      exact: true,
    })
    .click();
  await page
    .getByRole("checkbox", { name: /I confirm the installment allocations/ })
    .check();
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await expect(page.getByLabel("Payment review")).toContainText(
    "Explicit unapplied contractual amount",
  );
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/debts/${debt.debtId}$`));
  const detail = await (
    await page.request.get(`/api/v1/debts/${debt.debtId}`)
  ).json();
  expect(detail.debt.recognizedLiabilityMinor).toBe("0");
  expect(detail.debt.unappliedContractualMinor).toBe("50000");
  expect(detail.installments).toEqual([]);
  const accounts = await (await page.request.get("/api/v1/accounts")).json();
  expect(JSON.stringify(accounts)).toContain('"150000"');
});
