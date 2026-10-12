import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const headers = { origin: "http://localhost:3100" };
async function post(page: Page, path: string, data: object) {
  const r = await page.request.post(path, { headers, data });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function setup(page: Page, name = "Installment Visa") {
  const { cardId } = await post(page, "/api/v1/credit-cards", {
    clientCommandId: randomUUID(),
    name,
    issuerName: "Provider",
  });
  const purchase = await post(page, "/api/v1/financial-actions", {
    clientCommandId: randomUUID(),
    actionKind: "card_purchase",
    cardId,
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-11",
    purchaseMinor: "300000",
    splits: [{ categoryId: null, amountMinor: "300000" }],
    description: "Recognized installment laptop",
  });
  return { cardId, purchase };
}
function planBody(purchase: { actionId: string; actionRevisionId: string }) {
  return {
    clientCommandId: randomUUID(),
    purchaseActionId: purchase.actionId,
    purchaseActionRevisionId: purchase.actionRevisionId,
    principalMinor: "300000",
    installmentCount: 1,
    verificationSource: "Private provider evidence",
    verifiedDate: "2026-10-12",
    providerConfirmed: true,
    installments: [
      {
        principalMinor: "300000",
        dueDate: "2026-11-10",
        interestMinor: "0",
        feeMinor: "0",
        totalMinor: "300000",
      },
    ],
  };
}
async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("provider schedule entry, lost response retry, explicit installment application, revision history and cancellation retain financial amounts at 320px", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  const { cardId, purchase } = await setup(page),
    api = `/api/v1/credit-cards/${cardId}/installments`,
    base = `/money/cards/${cardId}/installments`;
  await page.goto(`/money/actions/${purchase.actionId}`);
  await page.getByText("Installment details", { exact: true }).click();
  await page
    .getByRole("link", { name: "Record provider installment schedule" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Record provider installment plan" }),
  ).toBeVisible();
  for (const [label, value] of [
    ["Financed principal (PHP)", "3000"],
    ["Provider installment count", "3"],
    ["Provider verification source", "Full provider schedule"],
    ["Provider verification date", "2026-10-12"],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  for (let n = 1; n < 3; n++)
    await page
      .getByRole("button", { name: "Add provider installment line" })
      .click();
  for (let n = 0; n < 3; n++) {
    await page
      .getByLabel("Expected principal (PHP)", { exact: true })
      .nth(n)
      .fill("1000");
    await page
      .getByLabel("Expected interest (PHP, optional)", { exact: true })
      .nth(n)
      .fill("0");
    await page
      .getByLabel("Expected fee (PHP, optional)", { exact: true })
      .nth(n)
      .fill("0");
    await page
      .getByLabel("Provider due date (optional)", { exact: true })
      .nth(n)
      .fill(["2026-11-10", "2026-12-10", "2027-01-10"][n]!);
  }
  await page.getByLabel(/I confirm this complete schedule/).check();
  await accessible(page);
  const commands: string[] = [];
  await page.route(`**${api}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    commands.push(route.request().postData()!);
    if (commands.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Review installment evidence" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review card command" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The outcome could not be confirmed" }),
  ).toContainText("outcome could not be confirmed");
  await expect(
    page.getByLabel("Financed principal (PHP)", { exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry identical command" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}$`));
  expect(commands[0]).toBe(commands[1]);
  await page.unroute(`**${api}`);
  const plans = await (await page.request.get(api)).json();
  expect(plans.plans).toHaveLength(1);
  const { planId } = plans.plans[0],
    path = `${base}/${planId}`;
  await page.goto(path);
  await expect(
    page.getByText("Remaining scheduled principal: PHP 3,000.00"),
  ).toBeVisible();
  await accessible(page);
  const { accountId } = await post(page, "/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Bank",
    accountType: "savings",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "600000",
  });
  const payment = await post(page, `/api/v1/credit-cards/${cardId}/commands`, {
    clientCommandId: randomUUID(),
    actionKind: "card_payment",
    amountMinor: "100000",
    payingAccountId: accountId,
    effectiveDate: "2026-11-05",
    postingDate: "2026-11-06",
    description: "Actual cash payment",
    providerConfirmed: true,
    confirmationSource: "Actual provider receipt",
  });
  const statement = await post(
    page,
    `/api/v1/credit-cards/${cardId}/statements`,
    {
      clientCommandId: randomUUID(),
      cycleStart: "2026-10-01",
      cycleEnd: "2026-10-31",
      statementDate: "2026-11-01",
      dueDate: "2026-11-20",
      balanceMinor: "300000",
      minimumDueMinor: "0",
      verificationSource: "Provider verified",
      verifiedDate: "2026-11-02",
      entries: [],
    },
  );
  const allocation = await post(
    page,
    `/api/v1/credit-cards/${cardId}/allocations`,
    {
      clientCommandId: randomUUID(),
      statementRevisionId: statement.revisionId,
      sourceActionRevisionId: payment.actionRevisionId,
      amountMinor: "100000",
      confirmationKind: "provider",
      confirmationSource: "Explicit statement application",
      confirmedDate: "2026-11-07",
    },
  );
  let d = await (await page.request.get(`${api}/${planId}`)).json();
  expect(d.totals.remainingPrincipalMinor).toBe("300000");
  await page.goto(`${path}/applications`);
  await page
    .getByLabel("Confirmed statement allocation", { exact: true })
    .selectOption(allocation.allocationId);
  await page.getByLabel("Applied principal (PHP)", { exact: true }).fill("500");
  await page
    .getByLabel("Application confirmation source", { exact: true })
    .fill("Actual provider installment allocation");
  await page
    .getByLabel("Application confirmation date", { exact: true })
    .fill("2026-11-08");
  await page.getByLabel(/I confirm the exact installment/).check();
  await page
    .getByRole("button", { name: "Review installment application" })
    .click();
  await accessible(page);
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  d = await (await page.request.get(`${api}/${planId}`)).json();
  expect(d.totals.remainingPrincipalMinor).toBe("250000");
  expect(d.card.postedOutstandingMinor).toBe("200000");
  await page.goto(`${path}/revise`);
  await page
    .getByLabel("Required schedule correction reason", { exact: true })
    .fill("Provider revised due date");
  await page
    .getByLabel("Provider due date (optional)", { exact: true })
    .first()
    .fill("2026-11-12");
  await page.getByLabel(/I confirm this complete schedule/).check();
  await page
    .getByRole("button", { name: "Review installment evidence" })
    .click();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  d = await (await page.request.get(`${api}/${planId}`)).json();
  expect(d.version).toBe(2);
  expect(d.totals.remainingPrincipalMinor).toBe("300000");
  expect(d.applications.unresolvedMinor).toBe("50000");
  expect(
    (
      await (
        await page.request.get(
          `${api}/${planId}?revisionId=${d.history.find((r: { version: number }) => r.version === 1).revisionId}`,
        )
      ).json()
    ).snapshot.installments[0].dueDate,
  ).toBe("2026-11-10");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const nav = page.getByRole("dialog", { name: "Navigation" });
  await nav.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(nav.getByLabel("Theme", { exact: true })).toBeEnabled();
  await nav
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await accessible(page);
  await page.screenshot({
    path: "test-results/card-installment-dark-320.png",
    fullPage: true,
  });
  await page.goto(`${path}/applications`);
  await page
    .getByLabel("Installment application reversal reason", { exact: true })
    .fill("Provider corrected previous application");
  await page
    .getByRole("button", { name: "Review application reversal" })
    .click();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.goto(`${path}/revise`);
  await page
    .getByLabel("Provider plan status", { exact: true })
    .selectOption("cancelled");
  await page
    .getByLabel("Required schedule correction reason", { exact: true })
    .fill("Provider cancelled arrangement");
  await page.getByLabel(/I confirm this complete schedule/).check();
  await page
    .getByRole("button", { name: "Review installment evidence" })
    .click();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  d = await (await page.request.get(`${api}/${planId}`)).json();
  expect(d.status.kind).toBe("cancelled");
  expect(d.upcoming).toEqual([]);
  expect(d.card.postedOutstandingMinor).toBe("200000");
  expect(
    (
      await (
        await page.request.get(
          `/api/v1/credit-cards/${cardId}/statements/${statement.statementId}`,
        )
      ).json()
    ).snapshot.balanceMinor,
  ).toBe("300000");
  // Query navigation retains page components in Next. A new source must start
  // a fresh provider draft rather than inheriting another purchase's schedule.
  const another = await post(page, "/api/v1/financial-actions", {
    clientCommandId: randomUUID(),
    actionKind: "card_purchase",
    cardId,
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-11",
    purchaseMinor: "150000",
    splits: [{ categoryId: null, amountMinor: "150000" }],
    description: "Different purchase",
  });
  await page.goto(`${base}/new?purchaseActionId=${purchase.actionId}`);
  await page
    .getByRole("textbox", { name: "Provider verification source", exact: true })
    .fill("Draft for original purchase");
  await page
    .getByRole("link", { name: "Provider installment plans", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: "Record provider installment plan",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: /Different purchase/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`purchaseActionId=${another.actionId}$`),
  );
  await expect(
    page.getByRole("textbox", {
      name: "Financed principal (PHP)",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", {
      name: "Provider verification source",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("spinbutton", {
      name: "Provider installment count",
      exact: true,
    }),
  ).toHaveValue("1");
});
test("foreign installment evidence stays private and a reversed purchase suspends projections without an inferred cancellation", async ({
  page,
  owner,
  browser,
}) => {
  test.setTimeout(90000);
  const other = await createBrowserOwner(),
    context = await browser.newContext(),
    foreignPage = await context.newPage();
  try {
    await signIn(foreignPage, other);
    const foreign = await setup(
        foreignPage,
        "Private foreign installment Visa",
      ),
      fp = await post(
        foreignPage,
        `/api/v1/credit-cards/${foreign.cardId}/installments`,
        planBody(foreign.purchase),
      );
    await signIn(page, owner);
    const privatePath = `/api/v1/credit-cards/${foreign.cardId}/installments/${fp.planId}`;
    expect((await page.request.get(privatePath)).status()).toBe(404);
    expect(
      (
        await page.request.post(
          `/api/v1/credit-cards/${foreign.cardId}/installments`,
          { headers, data: planBody(foreign.purchase) },
        )
      ).status(),
    ).toBe(404);
    await page.goto(`/money/cards/${foreign.cardId}/installments/${fp.planId}`);
    await expect(page.getByText(/Private foreign installment/)).toHaveCount(0);
    const x = await setup(page),
      api = `/api/v1/credit-cards/${x.cardId}/installments`,
      p = await post(page, api, planBody(x.purchase));
    expect(
      (
        await page.request.post(api, {
          headers,
          data: { ...planBody(x.purchase), workspaceId: randomUUID() },
        })
      ).status(),
    ).toBe(422);
    const original = await (
      await page.request.get(`/api/v1/financial-actions/${x.purchase.actionId}`)
    ).json();
    await post(
      page,
      `/api/v1/financial-actions/${x.purchase.actionId}/reversals`,
      {
        clientCommandId: randomUUID(),
        expectedActionRevisionId: original.current.actionRevisionId,
        expectedFinancialRevision: original.current.financialRevision,
        reason: "Wrong original purchase",
      },
    );
    const d = await (await page.request.get(`${api}/${p.planId}`)).json();
    expect(d.status.kind).toBe("reconciliation required");
    expect(d.totals.remainingPrincipalMinor).toBeNull();
    expect(d.lines[0].remainingPrincipalMinor).toBeNull();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/money/cards/${x.cardId}/installments/${p.planId}/revise`);
    await expect(
      page.getByLabel("Provider plan status", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("option", { name: "Active provider arrangement" }),
    ).toBeDisabled();
    await accessible(page);
    await page.screenshot({
      path: "test-results/card-installment-reconcile-320.png",
      fullPage: true,
    });
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
});
