import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" },
  main = (p: Page) => p.getByRole("main");
async function post(
  p: Page,
  path: string,
  data: unknown,
  status = path.startsWith("credit-cards/") ? 201 : 200,
) {
  const r = await p.request.post(`/api/v1/${path}`, { headers, data });
  expect(r.status(), await r.text()).toBe(status);
  return r.json();
}
async function metric(p: Page, label: string, value: string) {
  await expect(
    main(p).getByText(label, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(value);
}
async function cash(p: Page, name = "Forecast bank") {
  return post(
    p,
    "accounts",
    {
      clientCommandId: randomUUID(),
      name,
      accountType: "checking",
      openingCutoffDate: "2026-09-30",
      openingBalanceMinor: "10000",
    },
    201,
  );
}
async function context(p: Page) {
  const f = await (await p.request.get("/api/v1/forecasts")).json();
  return {
    today: f.today as string,
    timezone: f.timezone as string,
    d: (n: number) => addCalendarDays(f.today, n),
  };
}
async function bill(
  p: Page,
  c: Awaited<ReturnType<typeof context>>,
  accountId: string,
  name = "Future bill",
) {
  return post(p, "recurring-obligations", {
    operation: "definition",
    clientCommandId: randomUUID(),
    obligationId: null,
    expectedVersion: null,
    name,
    kind: "bill",
    reason: null,
    rule: {
      effectiveFrom: c.d(2),
      frequency: "daily",
      intervalCount: 1,
      weekdays: null,
      dayOfMonth: null,
      shortMonthPolicy: null,
      endsOn: c.d(2),
      occurrenceLimit: 1,
      expectedMinor: "3000",
      currency: "PHP",
      categoryId: null,
      defaultAccountId: accountId,
      timezone: c.timezone,
    },
    window: { from: c.d(2), through: c.d(2) },
  });
}
async function open(p: Page, label: string) {
  const s = main(p).getByText(label, { exact: true });
  if ((await s.locator("..").getAttribute("open")) === null) await s.click();
}
test("read-only scenarios separate actual/expected cash, retain negative shortfalls and link Money/Dashboard/Reports", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const a = await cash(page),
    c = await context(page);
  await bill(page, c, a.accountId);
  await page.goto("/money/forecasts");
  await expect(
    main(page).getByRole("heading", { name: "Forecasts", exact: true }),
  ).toBeVisible();
  await metric(page, "Opening actual liquid cash", "PHP 100.00");
  await metric(page, "Expected outflows", "PHP 30.00");
  await metric(page, "Projected closing cash", "PHP 70.00");
  await open(page, "Optional what-if adjustments");
  await main(page)
    .getByRole("button", { name: "Add adjustment", exact: true })
    .click();
  await main(page)
    .getByLabel("Adjustment 1 label", { exact: true })
    .fill("Explicit cash stress");
  await main(page)
    .getByLabel("Adjustment 1 amount (PHP)", { exact: true })
    .fill("120.00");
  const capture = page.waitForRequest(
    (r) => r.url().endsWith("/api/v1/forecasts") && r.method() === "POST",
  );
  await main(page)
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const req = await capture;
  expect(req.postDataJSON().adjustments[0].amountMinor).toBe("12000");
  await metric(page, "Projected closing cash", "-PHP 50.00");
  await expect(
    main(page).getByRole("heading", {
      name: "Projected cash breakdown",
      exact: true,
    }),
  ).toBeFocused();
  await expect(main(page)).toContainText("Projected cash shortfall");
  const base = await (await page.request.get("/api/v1/forecasts")).json();
  expect(base.totals.openingActualMinor).toBe("10000");
  expect(base.totals.closingProjectedMinor).toBe("7000");
  await page.goto("/reports/financial");
  await expect(
    main(page).getByRole("heading", { name: "Financial report", exact: true }),
  ).toBeVisible();
  await expect(
    main(page)
      .getByRole("row", { name: /^Net recognized spending/ })
      .locator("td")
      .first(),
  ).toHaveText("PHP 0.00");
  await expect(
    main(page).getByRole("link", {
      name: "Explore cash-flow forecasts",
      exact: true,
    }),
  ).toHaveAttribute("href", "/money/forecasts");
  await page.goto("/");
  await expect(
    main(page).getByRole("link", {
      name: "Explore cash-flow forecasts",
      exact: true,
    }),
  ).toBeVisible();
});
test("explicit card bases avoid recurring/statement/installment duplication and foreign scenarios remain private", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const a = await cash(page),
    c = await context(page),
    card = await post(
      page,
      "credit-cards",
      {
        clientCommandId: randomUUID(),
        name: "Provider forecast card",
        issuerName: "Provider",
      },
      201,
    );
  await bill(page, c, a.accountId);
  const purchase = await post(
    page,
    "financial-actions",
    {
      clientCommandId: randomUUID(),
      actionKind: "card_purchase",
      cardId: card.cardId,
      effectiveDate: c.d(-1),
      postingDate: c.d(-1),
      purchaseMinor: "10000",
      splits: [{ categoryId: null, amountMinor: "10000" }],
      description: "Recognized provider purchase",
    },
    201,
  );
  const stmt = await post(page, `credit-cards/${card.cardId}/statements`, {
    clientCommandId: randomUUID(),
    cycleStart: c.d(-14),
    cycleEnd: c.d(-1),
    statementDate: c.today,
    dueDate: c.d(5),
    balanceMinor: "10000",
    minimumDueMinor: "1000",
    openingBalanceMinor: "0",
    verificationSource: "Verified provider snapshot",
    verifiedDate: c.today,
    entries: [
      {
        description: "Purchase",
        postingDate: c.d(-1),
        amountMinor: "10000",
        actionRevisionId: purchase.actionRevisionId,
      },
    ],
  });
  await post(page, `credit-cards/${card.cardId}/installments`, {
    clientCommandId: randomUUID(),
    purchaseActionId: purchase.actionId,
    purchaseActionRevisionId: purchase.actionRevisionId,
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
  await page.goto("/money/forecasts");
  await main(page)
    .getByLabel("Forecast end date", { exact: true })
    .fill(c.d(6));
  await open(page, "Source and payment assumptions");
  const select = main(page).getByLabel(
    "Payment assumption for Provider forecast card",
    { exact: true },
  );
  await select.selectOption(stmt.statementId);
  await main(page)
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .click();
  await metric(page, "Expected outflows", "PHP 100.00");
  await metric(page, "Projected closing cash", "PHP 0.00");
  const independent = main(page).getByLabel(
    "Recurring expectations are separate from recorded future cash and card repayments",
    { exact: true },
  );
  await independent.check();
  await main(page)
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .click();
  await metric(page, "Projected closing cash", "-PHP 30.00");
  await independent.uncheck();
  await select.selectOption("installments");
  await main(page)
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .click();
  await metric(page, "Expected outflows", "PHP 50.00");
  await metric(page, "Projected closing cash", "PHP 50.00");
  const other = await createBrowserOwner(),
    ctx = await page.context().browser()!.newContext();
  try {
    const p = await ctx.newPage();
    expect((await p.request.get("/api/v1/forecasts")).status()).toBe(401);
    expect(
      (
        await p.request.post("/api/v1/forecasts", { headers, data: {} })
      ).status(),
    ).toBe(401);
    await signIn(p, other);
    expect(
      (
        await p.request.post("/api/v1/forecasts", {
          headers,
          data: {
            cards: [
              {
                cardId: card.cardId,
                basis: "statement",
                statementId: stmt.statementId,
              },
            ],
          },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await p.request.post("/api/v1/forecasts", {
          headers,
          data: { workspaceId: owner.workspaceId },
        })
      ).status(),
    ).toBe(422);
    const f = await (
      await p.request.get("/api/v1/forecasts", {
        headers: { "x-workspace-id": owner.workspaceId },
      })
    ).json();
    expect(f.cardOptions).toEqual([]);
    expect(f.sources).toEqual([]);
  } finally {
    await ctx.close();
    await removeBrowserOwner(other);
  }
});
test("long source names, exact assumptions, keyboard controls and coverage reflow at 320px in both themes", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const a = await cash(page),
    c = await context(page);
  await bill(page, c, a.accountId, "Forecast bill " + "x".repeat(186));
  await page.setViewportSize({ width: 320, height: 844 });
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/money/forecasts");
    await expect(
      main(page).getByRole("heading", { name: "Forecasts", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/forecast-${theme}.png` });
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await open(page, "Optional what-if adjustments");
  await main(page)
    .getByRole("button", { name: "Add adjustment", exact: true })
    .click();
  await main(page)
    .getByLabel("Adjustment 1 label", { exact: true })
    .fill("Explicit very large inflow");
  await main(page)
    .getByLabel("Adjustment 1 direction", { exact: true })
    .selectOption("inflow");
  await main(page)
    .getByLabel("Adjustment 1 amount (PHP)", { exact: true })
    .fill("92233720368547758.07");
  await main(page)
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await metric(page, "Projected closing cash", "PHP 92,233,720,368,547,828.07");
  await expect(
    main(page).getByRole("heading", {
      name: "Projected cash breakdown",
      exact: true,
    }),
  ).toBeFocused();
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await cpu.detach();
});
