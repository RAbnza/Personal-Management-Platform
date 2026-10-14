import { expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" };
async function post(page: Page, path: string, data: object) {
  const r = await page.request.post(path, { headers, data });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function setup(page: Page) {
  const today = (await (await page.request.get("/api/v1/dashboard")).json())
    .today as string;
  const card = await post(page, "/api/v1/credit-cards", {
    clientCommandId: randomUUID(),
    name: "Integrated browser Visa",
    issuerName: "Provider",
    creditLimitMinor: "1000000",
    limitVerifiedDate: today,
  });
  const cash = await post(page, "/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Integrated browser bank",
    accountType: "savings",
    openingCutoffDate: addCalendarDays(today, -1),
    openingBalanceMinor: "900000",
  });
  const purchase = await post(page, "/api/v1/financial-actions", {
    clientCommandId: randomUUID(),
    actionKind: "card_purchase",
    cardId: card.cardId,
    effectiveDate: today,
    postingDate: today,
    purchaseMinor: "300000",
    splits: [{ categoryId: null, amountMinor: "300000" }],
    description: "Integrated recognized laptop",
  });
  const statement = await post(
    page,
    `/api/v1/credit-cards/${card.cardId}/statements`,
    {
      clientCommandId: randomUUID(),
      cycleStart: today,
      cycleEnd: today,
      statementDate: today,
      dueDate: addCalendarDays(today, 2),
      balanceMinor: "300000",
      minimumDueMinor: "10000",
      openingBalanceMinor: "0",
      verificationSource: "Provider statement",
      verifiedDate: today,
      entries: [
        {
          description: "Laptop provider line",
          amountMinor: "300000",
          postingDate: today,
          actionRevisionId: purchase.actionRevisionId,
        },
      ],
    },
  );
  const plan = await post(
    page,
    `/api/v1/credit-cards/${card.cardId}/installments`,
    {
      clientCommandId: randomUUID(),
      purchaseActionId: purchase.actionId,
      purchaseActionRevisionId: purchase.actionRevisionId,
      principalMinor: "300000",
      installmentCount: 2,
      providerConfirmed: true,
      verificationSource: "Provider schedule",
      verifiedDate: today,
      installments: [
        {
          principalMinor: "150000",
          interestMinor: "1000",
          feeMinor: "0",
          totalMinor: "151000",
          dueDate: addCalendarDays(today, 3),
        },
        {
          principalMinor: "150000",
          interestMinor: null,
          feeMinor: null,
          totalMinor: null,
          dueDate: null,
        },
      ],
    },
  );
  const payment = await post(
    page,
    `/api/v1/credit-cards/${card.cardId}/commands`,
    {
      clientCommandId: randomUUID(),
      actionKind: "card_payment",
      payingAccountId: cash.accountId,
      amountMinor: "100000",
      effectiveDate: today,
      postingDate: today,
      description: "Actual integrated payment",
      providerConfirmed: true,
      confirmationSource: "Provider receipt",
    },
  );
  const allocation = await post(
    page,
    `/api/v1/credit-cards/${card.cardId}/allocations`,
    {
      clientCommandId: randomUUID(),
      statementRevisionId: statement.revisionId,
      sourceActionRevisionId: payment.actionRevisionId,
      amountMinor: "100000",
      confirmationKind: "provider",
      confirmationSource: "Exact statement allocation",
      confirmedDate: today,
    },
  );
  await post(
    page,
    `/api/v1/credit-cards/${card.cardId}/installments/${plan.planId}/applications`,
    {
      clientCommandId: randomUUID(),
      planRevisionId: plan.revisionId,
      allocationId: allocation.allocationId,
      installmentNo: 1,
      principalMinor: "50000",
      confirmationKind: "provider",
      confirmationSource: "Exact principal confirmation",
      confirmedDate: today,
    },
  );
  for (const actionKind of ["card_fee", "card_interest", "card_refund"])
    await post(page, `/api/v1/credit-cards/${card.cardId}/commands`, {
      clientCommandId: randomUUID(),
      actionKind,
      amountMinor: actionKind === "card_refund" ? "10000" : "2000",
      effectiveDate: today,
      postingDate: today,
      description: actionKind,
      providerConfirmed: true,
      confirmationSource: "Posted provider line",
    });
  return { today, card, cash, purchase, statement, plan };
}
async function accessible(page: Page, cpu?: CDPSession) {
  // Throttle product interactions, not the test audit's DOM traversal.
  if (cpu) await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (cpu) await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
test("integrated cards, exact reporting and CSV, due-date Agenda and reviewed reminders agree at 320px in both themes", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const x = await setup(page);
  await page.setViewportSize({ width: 320, height: 844 });
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const dates = new URLSearchParams({
    period: "custom",
    startDate: x.today,
    endDate: addCalendarDays(x.today, 14),
  }).toString();
  for (const theme of ["light", "dark"]) {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(nav.getByLabel("Theme", { exact: true })).toBeEnabled();
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    const cardPanel = page.getByRole("region", {
      name: "Credit card overview",
      exact: true,
    });
    await expect(
      cardPanel.getByText(/Posted outstanding PHP 1,940.00/),
    ).toBeVisible();
    await expect(
      cardPanel.getByText(/Available credit estimate PHP 8,060.00/),
    ).toBeVisible();
    await expect(
      cardPanel.getByText(/Remaining due PHP 2,000.00/),
    ).toBeVisible();
    await expect(cardPanel.getByText("19.40%", { exact: true })).toBeVisible();
    await cardPanel
      .getByText("Provider installment projections", { exact: true })
      .click();
    await expect(
      cardPanel.getByText(/Expected remaining principal PHP 1,000.00/),
    ).toBeVisible();
    await expect(
      cardPanel.getByText(/1 eligible installments have unknown dates/),
    ).toBeVisible();
    await accessible(page, cpu);
    await page.goto(`/reports/financial?${dates}`);
    await expect(
      page.getByRole("link", {
        name: "Actual card payments (not spending): PHP 1,000.00; view contributions",
        exact: true,
      }),
    ).toBeVisible();
    await accessible(page, cpu);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await accessible(page, cpu);
  await page
    .getByLabel("CSV contents")
    .filter({ visible: true })
    .selectOption("report");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  const download = await downloaded;
  const rows = parse(await readFile((await download.path())!), {
    columns: true,
    bom: true,
  }) as Record<string, string>[];
  expect(rows[0]).toMatchObject({
    schema_version: "4",
    definition_version: "v2-a6-integrated-cards-1",
  });
  expect(
    rows.find((r) => r.record_type === "verified_card_statement"),
  ).toMatchObject({
    provider_balance_minor: "300000",
    remaining_due_minor: "200000",
    date_basis: "current_verified_statement_dates",
  });
  expect(
    rows.find((r) => r.record_type === "card_installment_projection"),
  ).toMatchObject({
    expected_remaining_principal_minor: "100000",
    expected_remaining_total_minor: "101000",
    date_basis: "selected_due_dates_current_provider_version",
  });
  await page.goto(
    `/calendar?startDate=${x.today}&endDate=${addCalendarDays(x.today, 14)}&source=money`,
  );
  await expect(
    page.getByRole("link", { name: "Open statement", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open installment plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Verified statement remaining due: PHP 2,000.00/),
  ).toBeVisible();
  await expect(
    page.getByText(/Projected remaining obligation: PHP 1,010.00/),
  ).toBeVisible();
  await accessible(page, cpu);
  await page.goto(
    `/calendar/reminders/card_statement/${x.statement.statementId}`,
  );
  const dismissButton = page.getByRole("button", {
    name: "Dismiss reminder",
    exact: true,
  });
  await expect(dismissButton).toBeEnabled();
  await dismissButton.focus();
  await expect(dismissButton).toBeFocused();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Confirm reminder change", exact: true })
    .click();
  await expect(page.getByText(/Reminder change saved/)).toBeVisible();
  await accessible(page, cpu);
  await page.getByRole("link", { name: "Open source", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Statement ${x.today}`, exact: true }),
  ).toBeVisible();
  const api = await (await page.request.get("/api/v1/dashboard")).json();
  expect(api.finance).toMatchObject({
    liquidMinor: "800000",
    liabilitiesMinor: "194000",
    spending: { netMinor: "294000" },
  });
});
test("card metadata retry preserves limits and history, archive remains reversible, and foreign card reminder reads stay private", async ({
  page,
  owner,
  browser,
}) => {
  test.setTimeout(90000);
  await signIn(page, owner);
  const x = await setup(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`/money/cards/${x.card.cardId}`);
  await page.getByText("Edit card metadata", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Recorded credit limit (PHP)", exact: true })
    .fill("20000");
  let once = true;
  const bodies: string[] = [];
  await page.route("**/api/v1/credit-cards", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    bodies.push(route.request().postData()!);
    if (once) {
      once = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save card metadata", exact: true })
    .click();
  await expect(page.getByText(/save outcome is unconfirmed/)).toBeVisible();
  await page
    .getByRole("button", { name: "Retry same save", exact: true })
    .click();
  await expect(
    page.getByText(/Available credit estimate PHP 18,060.00/),
  ).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  await page.unroute("**/api/v1/credit-cards");
  const archiveCheckbox = page.getByRole("checkbox", {
    name: "Archive card (keeps recorded history)",
    exact: true,
  });
  if (!(await archiveCheckbox.isVisible()))
    await page.getByText("Edit card metadata", { exact: true }).click();
  await archiveCheckbox.check();
  await page
    .getByRole("button", { name: "Save card metadata", exact: true })
    .click();
  await expect(page.getByText(/Limit archived/)).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Integrated recognized laptop",
      exact: true,
    }),
  ).toBeVisible();
  await accessible(page);
  if (!(await archiveCheckbox.isVisible()))
    await page.getByText("Edit card metadata", { exact: true }).click();
  await archiveCheckbox.uncheck();
  await page
    .getByRole("button", { name: "Save card metadata", exact: true })
    .click();
  await expect(
    page.getByText(/Available credit estimate PHP 18,060.00/),
  ).toBeVisible();
  const other = await createBrowserOwner(),
    context = await browser.newContext();
  try {
    const p = await context.newPage();
    await signIn(p, other);
    expect(
      (
        await p.request.get(
          `/api/v1/reminders?sourceKind=card_statement&sourceId=${x.statement.statementId}`,
        )
      ).status(),
    ).toBe(404);
    await p.goto(`/money/cards/${x.card.cardId}`);
    await expect(
      p.getByRole("heading", { name: "Integrated browser Visa", exact: true }),
    ).toHaveCount(0);
    expect(
      (await (await p.request.get("/api/v1/dashboard")).json()).finance
        .cardSurface.cards,
    ).toEqual([]);
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
  expect(
    (await (await page.request.get("/api/v1/dashboard")).json()).finance
      .liquidMinor,
  ).toBe("800000");
});

test("maximum length card names wrap on Dashboard, card list and detail at 320px", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const name = "Private".repeat(28) + "Card";
  expect(name.length).toBe(200);
  const card = await post(page, "/api/v1/credit-cards", {
    clientCommandId: randomUUID(),
    name,
    issuerName: "Issuer".repeat(33),
    creditLimitMinor: "0",
  });
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of ["/", "/money/cards", `/money/cards/${card.cardId}`]) {
    await page.goto(path);
    await expect(
      page.getByRole("region", { name: "Credit card overview", exact: true }),
    ).toBeVisible();
    await accessible(page);
  }
});
