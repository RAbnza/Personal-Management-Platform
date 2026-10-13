import { expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withDomainTransaction } from "@/platform/db";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const headers = { origin: "http://localhost:3100" };
async function categories(page: Page) {
  const r = await page.request.get("/api/v1/categories?kind=expense");
  expect(r.status()).toBe(200);
  return (await r.json()).items as { categoryId: string; name: string }[];
}
function body(categoryId: string, extra: Record<string, unknown> = {}) {
  return {
    operation: "save",
    clientCommandId: randomUUID(),
    budgetId: null,
    expectedVersion: null,
    reason: null,
    fields: {
      categoryId,
      startDate: "2026-10-01",
      endDateExclusive: "2026-11-01",
      limitMinor: "10000",
      basis: "net",
      notes: "Private budget evidence",
      ...extra,
    },
  };
}
async function command(page: Page, data: object) {
  const r = await page.request.post("/api/v1/budgets", { headers, data });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
async function ready(page: Page, name?: string) {
  await expect(
    name
      ? page.getByRole("heading", { level: 1, name, exact: true })
      : page.getByRole("heading", { level: 1 }),
  ).toBeVisible();
}
async function allowance(page: Page, amount: string) {
  await expect(
    page
      .getByRole("main")
      .getByText("Remaining allowance", { exact: true })
      .locator("..")
      .locator("dd"),
  ).toHaveText(amount);
}
async function audit(page: Page, cpu: CDPSession) {
  await ready(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
test("reviewed budget creation and committed response-loss replay preserve spending and cash exactly once", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const c = (await categories(page))[0]!,
    accountResponse = await page.request.post("/api/v1/accounts", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        name: "Budget browser cash",
        accountType: "checking",
        openingCutoffDate: "2026-09-30",
        openingBalanceMinor: "10000",
      },
    });
  expect(accountResponse.status()).toBe(201);
  const account = await accountResponse.json();
  const requests: string[] = [];
  let lost = true,
    budgetId = "";
  await page.route("**/api/v1/budgets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    budgetId = (await response.json()).budgetId;
    if (lost) {
      lost = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.goto("/money/budgets");
  await ready(page, "Category budgets");
  await page
    .getByRole("combobox", { name: "Expense category", exact: true })
    .selectOption(c.categoryId);
  await page
    .getByRole("textbox", { name: "Spending limit (PHP)", exact: true })
    .fill("4.00");
  await page
    .getByLabel("Budget start date", { exact: true })
    .fill("2026-10-01");
  await page
    .getByLabel("Budget end date (inclusive)", { exact: true })
    .fill("2026-10-31");
  await page
    .getByRole("button", { name: "Review budget", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review budget", exact: true }),
  ).toBeFocused();
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry identical command", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Spending limit (PHP)", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry identical command", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/budgets/${budgetId}$`));
  await ready(page, `${c.name} budget`);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  await page.unroute("**/api/v1/budgets");
  await allowance(page, "PHP 4.00");
  const expense = await page.request.post("/api/v1/financial-actions", {
    headers,
    data: {
      actionKind: "expense",
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      effectiveDate: "2026-10-10",
      purchaseMinor: "500",
      splits: [{ amountMinor: "500", categoryId: c.categoryId }],
      description: "Budget browser actual purchase",
    },
  });
  expect(expense.status()).toBe(201);
  await page.reload();
  await ready(page, `${c.name} budget`);
  await allowance(page, "-PHP 1.00");
  await expect(page.getByText("Over budget", { exact: true })).toBeVisible();
  await page
    .getByRole("main")
    .getByText("Change budget definition", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Spending limit (PHP)", exact: true })
    .fill("6.00");
  await page
    .getByRole("textbox", { name: "Reason for budget change", exact: true })
    .fill("Review the recorded limit");
  await page
    .getByRole("button", { name: "Review budget", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await allowance(page, "PHP 1.00");
  const detail = await (
    await page.request.get(`/api/v1/budgets?budgetId=${budgetId}`)
  ).json();
  expect(detail.history.items).toHaveLength(2);
  expect(detail.budget.netMinor).toBe("500");
  const report = await (
    await page.request.get(
      "/api/v1/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
    )
  ).json();
  expect(report.metrics.net).toBe("500");
  expect(report.metrics.closing_cash).toBe("9500");
  await page.goto(
    "/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
  );
  await ready(page);
  await expect(
    page.getByRole("link", { name: "Manage category budgets", exact: true }),
  ).toHaveAttribute("href", /startDate=2026-10-01&endDate=2026-10-31/);
  await page
    .getByRole("link", { name: "Manage category budgets", exact: true })
    .click();
  await ready(page, "Category budgets");
  await allowance(page, "PHP 1.00");
  await page.goto("/?period=custom&startDate=2026-10-01&endDate=2026-10-31");
  await ready(page, "Dashboard");
  await expect(page.getByRole("main")).toContainText("Category budgets");
});
test("archive, restore, period conflicts and foreign access preserve private audited budget history", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const c = (await categories(page))[0]!,
    saved = await command(page, body(c.categoryId));
  await page.goto(`/money/budgets/${saved.budgetId}`);
  await ready(page, `${c.name} budget`);
  await page.getByText("Archive budget", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reason to archive budget", exact: true })
    .fill("Keep historical definition evidence");
  await page
    .getByRole("button", { name: "Review archive", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review budget lifecycle", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText("Archived");
  const overlap = await page.request.post("/api/v1/budgets", {
    headers,
    data: body(c.categoryId, {
      startDate: "2026-10-15",
      endDateExclusive: "2026-11-15",
    }),
  });
  expect(overlap.status()).toBe(409);
  const lifecycle = page.locator("details").filter({
    has: page.getByText("Restore budget", { exact: true }),
  });
  await expect(lifecycle).toBeVisible();
  if ((await lifecycle.getAttribute("open")) === null)
    await page.getByText("Restore budget", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reason to restore budget", exact: true })
    .fill("Use the original protected period");
  await page
    .getByRole("button", { name: "Review restore", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(page.getByText("Archive budget", { exact: true })).toBeVisible();
  const detail = await (
    await page.request.get(`/api/v1/budgets?budgetId=${saved.budgetId}`)
  ).json();
  expect(detail.history.items).toHaveLength(3);
  expect(detail.budget.version).toBe(3);
  const other = await createBrowserOwner();
  let context;
  try {
    context = await page.context().browser()!.newContext();
    const foreign = await context.newPage();
    expect((await foreign.request.get("/api/v1/budgets")).status()).toBe(401);
    expect(
      (
        await foreign.request.post("/api/v1/budgets", {
          headers,
          data: body(c.categoryId),
        })
      ).status(),
    ).toBe(401);
    await signIn(foreign, other);
    expect(
      (
        await foreign.request.get(`/api/v1/budgets?budgetId=${saved.budgetId}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreign.request.post("/api/v1/budgets", {
          headers,
          data: { ...body(c.categoryId), workspaceId: owner.workspaceId },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await foreign.request.post("/api/v1/budgets", {
          headers,
          data: body(c.categoryId),
        })
      ).status(),
    ).toBe(404);
    await foreign.goto(`/money/budgets/${saved.budgetId}`);
    await expect(
      foreign.getByText(/could not be found|not found/i),
    ).toBeVisible();
    await expect(foreign.locator("body")).not.toContainText(
      "Private budget evidence",
    );
  } finally {
    await context?.close();
    await removeBrowserOwner(other);
  }
});
test("maximum exact amounts, long categories and notes support keyboard review, both themes and 320px accessibility", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const c = (await categories(page))[0]!,
    name = "Budget category " + "x".repeat(184);
  await withDomainTransaction(owner, (t) =>
    t.db.execute(
      sql`UPDATE core.category SET name=${name} WHERE workspace_id=${owner.workspaceId}::uuid AND id=${c.categoryId}::uuid`,
    ),
  );
  const saved = await command(
      page,
      body(c.categoryId, {
        limitMinor: "9223372036854775807",
        notes: "n".repeat(2000),
      }),
    ),
    cpu = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/money/budgets");
    await ready(page, "Category budgets");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    for (const path of [
      "/money/budgets",
      `/money/budgets/${saved.budgetId}`,
      "/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
      "/?period=custom&startDate=2026-10-01&endDate=2026-10-31",
    ]) {
      await page.goto(path);
      await audit(page, cpu);
    }
    await page.goto(`/money/budgets/${saved.budgetId}`);
    await ready(page, `${name} budget`);
    await page.screenshot({ path: `test-results/budget-${theme}.png` });
  }
  await page
    .getByRole("main")
    .getByText("Change budget definition", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Spending limit (PHP)", exact: true })
    .fill("0");
  await page
    .getByRole("textbox", { name: "Reason for budget change", exact: true })
    .fill("Explicit zero-spending limit");
  const review = page.getByRole("button", {
    name: "Review budget",
    exact: true,
  });
  await expect(review).toBeEnabled();
  await review.focus();
  await expect(review).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Review budget", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(
    page
      .getByRole("main")
      .getByText("Zero limit: percentage not applicable.", { exact: true }),
  ).toBeVisible();
  await audit(page, cpu);
  await cpu.detach();
});
