import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
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
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  }
  let response = await submit();
  if (response.status() === 429) {
    const seconds = Number(response.headers()["x-retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(10);
    await page.waitForTimeout(seconds * 1000 + 250);
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
test("financial periods, exact source drilldown and CSV download work on mobile", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  const accountResponse = await page.request.post("/api/v1/accounts", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      name: "Report browser cash",
      accountType: "checking",
      openingCutoffDate: cutoff.toISOString().slice(0, 10),
      openingBalanceMinor: "10000",
    },
  });
  expect(accountResponse.status()).toBe(201);
  const { accountId } = await accountResponse.json();
  const purchase = await page.request.post("/api/v1/financial-actions", {
    headers: { origin: "http://localhost:3100" },
    data: {
      actionKind: "expense",
      clientCommandId: randomUUID(),
      fundingAccountId: accountId,
      effectiveDate: today,
      purchaseMinor: "500",
      splits: [{ amountMinor: "200" }, { amountMinor: "300" }],
      description: "CSV browser purchase",
    },
  });
  expect(purchase.status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reports/financial");
  await page.getByLabel("Reporting period").selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill(today);
  await page.getByLabel("End date", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Apply period" }).click();
  await expect(page).toHaveURL(
    new RegExp(`period=custom.*startDate=${today}.*endDate=${today}`),
  );
  await expect(
    page.getByText("Both identities reconcile to signed postings."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reports-mobile.png",
    fullPage: true,
  });
  await page.screenshot({ path: "test-results/reports-mobile-top.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", {
      name: "Net recognized spending: PHP 5.00; view contributions",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Exact total: PHP 5.00/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "CSV browser purchase", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("link", { name: "Financial", exact: true }).click();
  await page.getByLabel("CSV contents").selectOption("transactions");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toContain("pmp-transactions-");
  const file = await download.path();
  expect(file).toBeTruthy();
  const rows = parse(await readFile(file!), {
    bom: true,
    columns: true,
  }) as Record<string, string>[];
  expect(rows[0]).toMatchObject({
    record_type: "manifest",
    period_start: today,
    period_end_inclusive: today,
    date_basis: "financial_effective_date",
    row_count: "3",
    schema_version: "1",
  });
  expect(
    rows
      .filter((r) => r.record_type === "posting")
      .map((r) => r.amount_minor)
      .sort(),
  ).toEqual(["-500", "200", "300"]);
  expect(rows[0]!.scope).toContain("not a complete workspace backup");
  expect(rows.every((r) => r.export_run_id === rows[0]!.export_run_id)).toBe(
    true,
  );
  await page.reload();
  await page
    .getByText("Recent prepared exports (30-day provenance)", { exact: true })
    .click();
  await expect(
    page.getByText(rows[0]!.export_run_id!, { exact: false }),
  ).toBeVisible();
});
test("Career reporting records actual response evidence and drills into the same cohort", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const response = await page.request.post("/api/v1/applications", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      companyName: "Report Career company",
      roleTitle: "Engineer",
      initialStage: "applied",
      initialStageEffectiveDate: today,
      appliedDate: today,
    },
  });
  expect(response.status()).toBe(201);
  const app = await response.json();
  await page.goto(`/career/applications/${app.applicationId}`);
  await page.getByLabel("Actual observation date").fill(today);
  await page.getByLabel("Observation title").fill("Dated employer reply");
  await expect(page.getByLabel("Actual observation date")).toHaveValue(today);
  const saved = page.waitForResponse(
    (r) =>
      r
        .url()
        .endsWith(`/api/v1/applications/${app.applicationId}/observations`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save observation" }).click();
  expect((await saved).status()).toBe(201);
  await expect(
    page.getByText("Observation saved to application history."),
  ).toBeVisible();
  await page.goto(
    `/reports/career?period=custom&startDate=${today}&endDate=${today}&asOfDate=${today}`,
  );
  await expect(
    page.getByRole("link", { name: "Explicit responses 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Explicit responses 1", exact: true })
    .click();
  await expect(page).toHaveURL(/#responded-records$/);
  await expect(
    page
      .locator("#responded-records")
      .getByRole("link", { name: /Report Career company/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reports-career.png",
    fullPage: true,
  });
});
test("Reports reject invalid ownership filters and exports stay isolated across owners", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const privateAccount = await page.request.post("/api/v1/accounts", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      name: "Private export isolation account",
      accountType: "checking",
      openingCutoffDate: today,
      openingBalanceMinor: "12345",
    },
  });
  expect(privateAccount.status()).toBe(201);
  const { accountId } = await privateAccount.json();
  const ownedCsv = parse(
    await (await page.request.get("/api/v1/exports/transactions.csv")).text(),
    { bom: true, columns: true },
  ) as Record<string, string>[];
  const privateLedger = ownedCsv.find(
    (r) => r.ledger_kind === "cash_asset",
  )!.ledger_account_id!;
  await page.goto(
    "/reports/financial?period=custom&startDate=2026-10-09&endDate=2026-10-01",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "valid ordered dates",
  );
  expect(
    (
      await page.request.get(
        `/api/v1/exports/transactions.csv?workspaceId=${owner.workspaceId}`,
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(
        "/api/v1/reports/financial?period=week&period=year",
      )
    ).status(),
  ).toBe(400);
  const second = await createBrowserOwner(),
    context = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const other = await context.newPage();
    await signIn(other, second);
    const r = await other.request.get("/api/v1/exports/transactions.csv");
    expect(r.status()).toBe(200);
    const rows = parse(await r.text(), { bom: true, columns: true }) as Record<
      string,
      string
    >[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_type: "manifest", row_count: "0" });
    expect(JSON.stringify(rows)).not.toContain(accountId);
    expect(JSON.stringify(rows)).not.toContain(privateLedger);
    expect(
      (
        await other.request.get(
          `/api/v1/reports/contributions?metric=closing_cash&ledgerId=${privateLedger}`,
        )
      ).status(),
    ).toBe(400);
    const report = await (
      await other.request.get("/api/v1/reports/career")
    ).json();
    expect(report.applications).toEqual([]);
    expect(report.summary.responseRate).toBeNull();
    const anonymous = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    try {
      expect(
        (await anonymous.request.get("/api/v1/exports/report.csv")).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await context.close();
    await removeBrowserOwner(second);
  }
});
