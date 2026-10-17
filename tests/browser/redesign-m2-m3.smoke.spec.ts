import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";

test("production discovery and reviewed expense preserve private draft and identical retry", async ({
  page,
  owner,
}) => {
  // One bounded cross-workspace smoke, including cold local development compilation.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      console.log("Smoke route:", new URL(frame.url()).pathname);
  });
  await signIn(page, owner);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = page.getByRole("button", { name: "Modules", exact: true });
    await trigger.click();
    const menu = page.getByRole("dialog", {
      name: "Your modules",
      exact: true,
    });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: /Money/ })).toBeVisible();
    const panel = await menu.boundingBox(),
      dock = await page
        .getByRole("navigation", { name: "Primary", exact: true })
        .boundingBox();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(dock!.y + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Find a screen/ }).click();
  await page.getByRole("combobox").fill("accounts");
  await page.getByRole("option", { name: /Accounts Balances/ }).click();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: /^A clearer day,/ }),
  ).toBeVisible();
  for (const [route, title] of [
    ["/settings?section=appearance", "Settings"],
    ["/settings/sessions", "Sessions and security"],
    ["/help", "Help and guides"],
    ["/onboarding", "Getting started"],
    ["/money/actions", "Financial activity"],
    ["/money/debts", "Debts"],
    ["/money/cards", "Credit cards"],
    ["/money/recurring", "Recurring obligations"],
    ["/money/budgets", "Category budgets"],
    ["/money/goals", "Savings goals"],
  ]) {
    const response = await page.goto(route!);
    expect(response!.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: title!, exact: true, level: 1 }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const account = await page.request.post("/api/v1/accounts", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      name: "Review smoke cash",
      accountType: "cash",
      openingCutoffDate: "2026-10-01",
      openingBalanceMinor: "100000",
    },
  });
  expect(account.status()).toBe(201);
  const accountId = (await account.json()).accountId;
  await page.goto("/money/transactions?kind=expense");
  await expect(
    page.getByRole("navigation", { name: "Primary", exact: true }),
  ).toBeHidden();
  await page.getByLabel("Transaction date", { exact: true }).fill("2026-10-10");
  await expect(
    page.getByLabel("Transaction date", { exact: true }),
  ).toHaveValue("2026-10-10");
  await page.getByLabel("Amount (PHP)", { exact: true }).fill("12.34");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Reviewed browser expense");
  await page.locator("summary").filter({ hasText: "More details" }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Retained optional draft");
  const commands: string[] = [];
  await page.route("**/api/v1/financial-actions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    commands.push(route.request().postData()!);
    if (commands.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review expense", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toBeHidden();
  expect(commands).toHaveLength(0);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Retained optional draft",
  );
  await expect(page.getByLabel("Amount (PHP)", { exact: true })).toHaveValue(
    "12.34",
  );
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save transaction", exact: true })
    .click();
  await expect(
    page.getByText("Save outcome unconfirmed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit details", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry same save", exact: true })
    .click();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toBe(commands[0]);
  expect(JSON.parse(commands[0]!)).toMatchObject({
    actionKind: "expense",
    fundingAccountId: accountId,
    purchaseMinor: "1234",
    notes: "Retained optional draft",
  });
  await page.goto("/?period=custom&startDate=2026-10-01&endDate=2026-10-31");
  const overview = page.getByRole("region", {
    name: "account overview",
    exact: true,
  });
  await overview.getByRole("button", { name: "Next account overview" }).click();
  await expect(overview.getByText("2 / 2", { exact: false })).toBeVisible();
  await expect(
    overview.getByRole("link", { name: "Account history", exact: true }),
  ).toBeInViewport();
  const rail = overview.getByLabel(
    "account overview: scroll horizontally or use arrow keys",
  );
  await rail.focus();
  await rail.press("Home");
  await expect(
    overview.getByRole("button", { name: "Previous account overview" }),
  ).toBeDisabled();
  await page.getByText("Exact chart data", { exact: true }).click();
  await expect(
    page.getByRole("table", { name: /Recorded daily totals/ }),
  ).toContainText("PHP 12.34");
  await page
    .getByRole("button", { name: "Savings goals", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Set a savings goal" }),
  ).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
