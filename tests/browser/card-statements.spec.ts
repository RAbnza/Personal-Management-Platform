import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const headers = { origin: "http://localhost:3100" };
test("statement pages and APIs isolate owners and preserve dark mobile accessibility", async ({
  page,
  owner,
  browser,
}) => {
  test.setTimeout(90000);
  const other = await createBrowserOwner(),
    context = await browser.newContext(),
    otherPage = await context.newPage();
  try {
    await signIn(otherPage, other);
    const c = await otherPage.request.post("/api/v1/credit-cards", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        name: "Foreign statement card",
        issuerName: "Private issuer",
      },
    });
    expect(c.status()).toBe(201);
    const { cardId } = await c.json();
    const s = await otherPage.request.post(
      `/api/v1/credit-cards/${cardId}/statements`,
      {
        headers,
        data: {
          clientCommandId: randomUUID(),
          cycleStart: "2026-10-01",
          cycleEnd: "2026-10-31",
          statementDate: "2026-11-01",
          dueDate: "2026-11-20",
          balanceMinor: "100",
          minimumDueMinor: "0",
          verificationSource: "Private provider PDF",
          verifiedDate: "2026-11-02",
          entries: [],
        },
      },
    );
    expect(s.status()).toBe(201);
    const { statementId } = await s.json();
    await signIn(page, owner);
    for (const path of [
      `/api/v1/credit-cards/${cardId}/statements`,
      `/api/v1/credit-cards/${cardId}/statements/${statementId}`,
    ]) {
      const r = await page.request.get(path);
      expect(r.status()).toBe(404);
      expect(await r.text()).not.toContain("Private provider PDF");
    }
    const foreignPage = await page.request.get(
        `/money/cards/${cardId}/statements/${statementId}`,
      ),
      html = await foreignPage.text();
    expect(html).toContain("This page could not be found");
    expect(html).not.toContain("Private provider PDF");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const mine = await page.request.post("/api/v1/credit-cards", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        name: "Dark statement card",
        issuerName: "Provider",
      },
    });
    const own = await mine.json();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/money/cards/${own.cardId}/statements/new`);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByLabel("Verification source", { exact: true }),
    ).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/card-statement-dark-320.png",
      fullPage: true,
    });
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
});
test("verified statement entry, lost-response replay, reconciliation and immutable revisions work at 320px without financial postings", async ({
  page,
  owner,
}) => {
  test.setTimeout(90000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  const cardResponse = await page.request.post("/api/v1/credit-cards", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name: "Statement Visa",
      issuerName: "Provider",
    },
  });
  expect(cardResponse.status()).toBe(201);
  const { cardId } = await cardResponse.json();
  const purchaseResponse = await page.request.post(
    "/api/v1/financial-actions",
    {
      headers,
      data: {
        actionKind: "card_purchase",
        clientCommandId: randomUUID(),
        cardId,
        effectiveDate: "2026-10-10",
        postingDate: "2026-10-12",
        purchaseMinor: "300001",
        splits: [{ amountMinor: "300001", categoryId: null }],
        description: "Statement browser groceries",
      },
    },
  );
  expect(purchaseResponse.status()).toBe(201);
  const purchase = await purchaseResponse.json();
  await page.goto(`/money/cards/${cardId}/statements/new`);
  for (const [label, value] of [
    ["Cycle start", "2026-10-01"],
    ["Cycle end", "2026-10-31"],
    ["Statement date", "2026-11-01"],
    ["Due date", "2026-11-20"],
    ["Statement balance (PHP)", "3000.01"],
    ["Minimum due (PHP)", "100.00"],
    ["Provider opening balance (PHP, optional)", "0"],
    ["Provider verification date", "2026-11-02"],
    ["Verification source", "Provider PDF checked"],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  await page
    .getByRole("button", { name: "Add provider line", exact: true })
    .click();
  await page
    .getByLabel("Recognized card activity link", { exact: true })
    .selectOption(purchase.actionRevisionId);
  await page
    .getByRole("button", { name: "Add provider line", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .nth(1)
    .fill("Unknown provider charge");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/card-statement-form-320.png",
    fullPage: true,
  });
  const requests: string[] = [];
  let statementId: string | undefined;
  await page.route(
    `**/api/v1/credit-cards/${cardId}/statements`,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests.push(route.request().postData()!);
      if (requests.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        statementId = (await response.json()).statementId;
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await page
    .getByRole("button", { name: "Review statement", exact: true })
    .click();
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", {
      name: "Confirm provider-verified statement",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The save outcome is unconfirmed" }),
  ).toHaveText(/save outcome is unconfirmed/);
  await expect(
    page.getByLabel("Statement balance (PHP)", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same save", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/statements/${statementId}$`));
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  await expect(
    page.getByText("Recorded remaining due: PHP 3,000.01", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Unexplained provider difference: Unknown/),
  ).toBeVisible();
  await expect(page.getByText(/Unlinked provider lines: 1/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/card-statement-reconciliation-320.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Correct statement evidence", exact: true })
    .click();
  await page
    .getByLabel("Signed amount (PHP, optional)", { exact: true })
    .nth(1)
    .fill("0.05");
  await page
    .getByLabel("Provider posting date (optional)", { exact: true })
    .nth(1)
    .fill("2026-10-20");
  await page
    .getByLabel("Statement balance (PHP)", { exact: true })
    .fill("3000.06");
  await page
    .getByLabel("Required correction reason", { exact: true })
    .fill("Provider confirmed missing charge details");
  await page
    .getByRole("button", { name: "Review statement", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm provider-verified statement",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/statements/${statementId}$`));
  await expect(
    page.getByText("Revision 2 · Current verified evidence", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unexplained provider difference: PHP 0.00", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Revision 1", exact: true }).click();
  await expect(
    page.getByText("Revision 1 · Preserved historical evidence", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded remaining due: PHP 3,000.01", { exact: true }),
  ).toBeVisible();
  const response = await page.request.get(
    `/api/v1/credit-cards/${cardId}/statements/${statementId}`,
  );
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.card.postedOutstandingMinor).toBe("300001");
  expect(data.snapshot.balanceMinor).toBe("300006");
  expect(data.history).toHaveLength(2);
  const foreign = await page.request.get(
      `/api/v1/credit-cards/${randomUUID()}/statements/${statementId}`,
    ),
    missing = await page.request.get(
      `/api/v1/credit-cards/${cardId}/statements/${randomUUID()}`,
    );
  expect(foreign.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await foreign.text()).not.toContain("Unknown provider charge");
});
