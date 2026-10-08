import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  test,
  createBrowserOwner,
  removeBrowserOwner,
  type BrowserOwner,
} from "./helpers/owner";
async function signIn(page: Page, owner: BrowserOwner) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  async function submit() {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-in/email") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return responsePromise;
  }
  let response = await submit();
  // Multiple synthetic owners share localhost and the production database
  // rate limiter. Honor its explicit retry interval rather than disabling it.
  if (response.status() === 429) {
    const retrySeconds = Number(response.headers()["x-retry-after"]);
    expect(retrySeconds).toBeGreaterThan(0);
    expect(retrySeconds).toBeLessThanOrEqual(10);
    await page.waitForTimeout(retrySeconds * 1000 + 250);
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
test("empty tracking remains unknown and quick actions are usable on mobile", async ({
  page,
  owner,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, owner);
  await expect(
    page.getByRole("heading", { name: "What needs your attention?" }),
  ).toBeVisible();
  await expect(page.getByText("Coverage not established")).toBeVisible();
  await expect(page.getByText("No accounts tracked")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Add application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/career\/applications\/new$/);
  await expect(
    page.getByRole("heading", { name: /Add.*application/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("period selection drills into exact spending and owned account history", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const dashboard = await (await page.request.get("/api/v1/dashboard")).json(),
    today = dashboard.today;
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  const accountResponse = await page.request.post("/api/v1/accounts", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      name: "Browser cash",
      accountType: "checking",
      openingCutoffDate: cutoff.toISOString().slice(0, 10),
      openingBalanceMinor: "10000",
    },
  });
  expect(accountResponse.status()).toBe(201);
  const account = await accountResponse.json();
  const purchase = await page.request.post("/api/v1/financial-actions", {
    headers: { origin: "http://localhost:3100" },
    data: {
      actionKind: "expense",
      clientCommandId: randomUUID(),
      fundingAccountId: account.accountId,
      effectiveDate: today,
      purchaseMinor: "500",
      splits: [{ amountMinor: "200" }, { amountMinor: "300" }],
      description: "Browser purchase",
    },
  });
  expect(purchase.status()).toBe(201);
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Expense period" })
    .selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill(today);
  await page.getByLabel("End date", { exact: true }).fill(today);
  await page
    .getByRole("combobox", { name: "Agenda sources" })
    .selectOption("career");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `period=custom.*startDate=${today}.*endDate=${today}.*source=career`,
    ),
  );
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", {
      name: "Net recognized spending: PHP 5.00",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/spending\\?startDate=${today}&endDate=${today}`),
  );
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browser purchase" }),
  ).toHaveCount(2);
  await page
    .getByRole("link", { name: "Back to Dashboard", exact: true })
    .click();
  const hideMoney = await page.request.patch(
    "/api/v1/module-preferences/money",
    {
      headers: { origin: "http://localhost:3100" },
      data: {
        clientCommandId: randomUUID(),
        expectedVersion: 0,
        enabled: false,
        agendaVisible: true,
        remindersEnabled: true,
      },
    },
  );
  expect(hideMoney.status()).toBe(200);
  await page.reload();
  await expect(page.getByText(/Money is hidden in navigation/)).toBeVisible();
  await page.getByText("Supporting cash accounts", { exact: true }).click();
  await page
    .getByRole("link", { name: "Browser cash: PHP 95.00", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/money/accounts/${account.accountId}/history$`),
  );
  await expect(
    page.getByRole("heading", { name: "Account history", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Money module hidden/)).toBeVisible();
});
test("invalid filters and unauthenticated/foreign reads do not expose records", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const header = await (await page.request.get("/api/v1/dashboard")).json();
  const accountResponse = await page.request.post("/api/v1/accounts", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      name: "Private isolation cash",
      accountType: "checking",
      openingCutoffDate: header.today,
      openingBalanceMinor: "12345",
    },
  });
  expect(accountResponse.status()).toBe(201);
  const privateAccount = await accountResponse.json();
  await page.goto("/?period=custom&startDate=2026-10-09&endDate=2026-10-01");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "valid ordered dates",
  );
  await expect(
    page.getByText("Net recognized spending", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get(
        `/api/v1/dashboard?workspaceId=${owner.workspaceId}`,
      )
    ).status(),
  ).toBe(400);
  const second = await createBrowserOwner(),
    context = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const otherPage = await context.newPage();
    await signIn(otherPage, second);
    const a = await (await otherPage.request.get("/api/v1/dashboard")).json();
    expect(a.finance.accounts).toEqual([]);
    expect(a.activity).toEqual([]);
    expect(
      (
        await otherPage.request.get(
          `/api/v1/accounts/${privateAccount.accountId}/history`,
        )
      ).status(),
    ).toBe(404);
    const anonymous = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    try {
      expect((await anonymous.request.get("/api/v1/dashboard")).status()).toBe(
        401,
      );
    } finally {
      await anonymous.close();
    }
  } finally {
    await context.close();
    await removeBrowserOwner(second);
  }
});
