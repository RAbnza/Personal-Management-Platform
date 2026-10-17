import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const headers = { origin: "http://localhost:3100" };
test("ordinary Add Expense records a posted card purchase once after a lost response; history, reports, corrections and mobile accessibility agree", async ({
  page,
  owner,
}) => {
  test.setTimeout(90000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  const cash = await page.request.post("/api/v1/accounts", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name: "Unchanged cash",
      accountType: "cash",
      openingCutoffDate: "2026-09-30",
      openingBalanceMinor: "600000",
    },
  });
  expect(cash.status()).toBe(201);
  await page.goto("/money/cards");
  await page.getByText("Add credit card", { exact: true }).first().click();
  await page.getByLabel("Card name", { exact: true }).fill("Browser BPI Visa");
  await page.getByLabel("Issuer", { exact: true }).fill("BPI");
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/credit-cards") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Add credit card", exact: true })
    .click();
  const card = await (await created).json();
  await expect(page).toHaveURL(new RegExp(`/money/cards/${card.cardId}$`));
  await page.getByRole("link", { name: "Add Expense", exact: true }).click();
  await page.getByLabel("Paid with", { exact: true }).selectOption(card.cardId);
  await page.getByLabel("Transaction date", { exact: true }).fill("2026-10-10");
  await page.getByLabel("Amount (PHP)", { exact: true }).fill("3000.01");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Browser card groceries");
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await expect(
    page.getByLabel("Provider posting date", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Provider posting date", { exact: true })
    .fill("2026-10-12");
  await page.getByText("Optional card details", { exact: true }).click();
  await page
    .getByLabel("Provider reference", { exact: true })
    .fill("BPI confirmed line");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const commands: string[] = [];
  await page.screenshot({
    path: "test-results/card-purchase-form-320.png",
    fullPage: true,
  });
  let recorded: { actionId: string } | undefined;
  await page.route("**/api/v1/financial-actions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    commands.push(route.request().postData()!);
    if (commands.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      recorded = await response.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save transaction", exact: true })
    .click();
  await expect(
    page.getByText(/couldn't confirm whether this transaction/),
  ).toBeVisible();
  await expect(page.getByLabel("Paid with", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same save", exact: true })
    .click();
  await expect(page).toHaveURL(/\/money\/actions$/);
  expect(commands).toHaveLength(2);
  expect(commands[0]).toBe(commands[1]);
  await page.unroute("**/api/v1/financial-actions");
  await expect(
    page.getByRole("link", { name: "Browser card groceries", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Paid with Browser BPI Visa · Provider posted 2026-10-12", {
      exact: true,
    }),
  ).toBeVisible();
  const url =
    "/api/v1/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31";
  let report = await (await page.request.get(url)).json();
  expect(report.metrics).toMatchObject({
    gross: "300001",
    cash_out: "0",
    closing_cash: "600000",
    closing_liability: "300001",
    tracked_net: "299999",
  });
  await page.goto(`/money/cards/${card.cardId}`);
  await expect(
    page.getByText(/Transaction 2026-10-10 · Posted 2026-10-12/),
  ).toBeVisible();
  await expect(
    page.getByText("Provider reference: BPI confirmed line", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto(`/money/actions/${recorded!.actionId}`);
  await page
    .getByRole("button", { name: "Correct entry", exact: true })
    .click();
  await page
    .getByLabel("Provider posting date", { exact: true })
    .fill("2026-10-13");
  await page
    .getByLabel("Required reason", { exact: true })
    .fill("Provider date correction");
  await page
    .getByRole("button", { name: "Review exact changes", exact: true })
    .click();
  await expect(
    page.getByLabel("Exact financial review", { exact: true }),
  ).toContainText("Cash movement: PHP 0.00");
  await page
    .getByRole("checkbox", { name: /I confirm the exact dates/ })
    .check();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/saved/i);
  await page.goto(`/money/cards/${card.cardId}`);
  await expect(page.getByText(/Revision 2 · Current/)).toBeVisible();
  await expect(page.getByText(/Liability change PHP 0.00/)).toBeVisible();
  await page.screenshot({
    path: "test-results/card-purchase-history-320.png",
    fullPage: true,
  });
  await expect(
    page.getByText(/Transaction 2026-10-10 · Posted 2026-10-12/),
  ).toBeVisible();
  report = await (await page.request.get(url)).json();
  expect(report.metrics.gross).toBe("300001");
  await page.goto(
    "/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
  );
  await expect(
    page.getByRole("heading", {
      name: "Period card activity and recorded liability",
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Net spending PHP 3,000.01", exact: true })
    .click();
  await expect(
    page.getByText(/Card Browser BPI Visa · Provider posted/).first(),
  ).toBeVisible();
});
test("card pages and purchases reject foreign owner references; card forms keep contrast and reflow in dark mode", async ({
  page,
  owner,
  browser,
}) => {
  test.setTimeout(60000);
  const other = await createBrowserOwner(),
    context = await browser.newContext(),
    otherPage = await context.newPage();
  try {
    await signIn(otherPage, other);
    const result = await otherPage.request.post("/api/v1/credit-cards", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        name: "Private foreign card",
        issuerName: "Private issuer",
      },
    });
    expect(result.status()).toBe(201);
    const card = await result.json();
    await signIn(page, owner);
    const foreign = await page.request.get(`/money/cards/${card.cardId}`);
    // Next.js streaming can commit HTTP 200 before notFound() is rendered.
    // Prove unavailable UI and absence of private data; APIs retain exact 404s.
    const html = await foreign.text();
    expect(html).toContain("This page could not be found");
    expect(html).not.toContain("Private foreign card");
    expect(html).not.toContain("Private issuer");
    await page.goto(`/money/cards/${card.cardId}`);
    await expect(
      page.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Private foreign card", { exact: true }),
    ).toHaveCount(0);
    for (const cardId of [card.cardId, randomUUID()]) {
      const r = await page.request.post("/api/v1/financial-actions", {
        headers,
        data: {
          actionKind: "card_purchase",
          clientCommandId: randomUUID(),
          cardId,
          effectiveDate: "2026-10-10",
          postingDate: "2026-10-12",
          purchaseMinor: "100",
          splits: [{ amountMinor: "100" }],
          description: "Foreign purchase",
        },
      });
      expect(r.status()).toBe(404);
      expect(JSON.stringify(await r.json())).not.toContain(other.workspaceId);
    }
    await page.goto("/");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/money/cards");
    await expect(page.getByRole("main")).toBeVisible();
    await page.screenshot({
      path: "test-results/cards-dark-320.png",
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
});
