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
async function fill(page: Page, kind: string, amount: string) {
  await page.getByLabel("Activity kind", { exact: true }).selectOption(kind);
  for (const [label, value] of [
    ["Amount (PHP)", amount],
    ["Transaction date", "2026-11-05"],
    ["Provider posting date", "2026-11-06"],
    ["Description", `Actual ${kind}`],
    ["Actual evidence source", "Provider confirmed posted record"],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByLabel(/I confirm this actual posted transaction/).check();
}
test("card payment lost-response retry, explicit allocations/reversals, provider charges, linked refund and overpayment work without duplicate spending at 320px", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  const { cardId } = await post(page, "/api/v1/credit-cards", {
    clientCommandId: randomUUID(),
    name: "A4 browser Visa",
    issuerName: "Provider",
  });
  const { accountId } = await post(page, "/api/v1/accounts", {
    clientCommandId: randomUUID(),
    name: "Card paying bank",
    accountType: "savings",
    openingCutoffDate: "2026-09-30",
    openingBalanceMinor: "600000",
  });
  const purchase = await post(page, "/api/v1/financial-actions", {
    clientCommandId: randomUUID(),
    actionKind: "card_purchase",
    cardId,
    effectiveDate: "2026-10-10",
    postingDate: "2026-10-11",
    purchaseMinor: "300000",
    splits: [{ categoryId: null, amountMinor: "300000" }],
    description: "Refundable groceries",
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
      minimumDueMinor: "10000",
      openingBalanceMinor: "0",
      verificationSource: "Actual provider statement",
      verifiedDate: "2026-11-02",
      entries: [
        {
          description: "Groceries",
          amountMinor: "300000",
          postingDate: "2026-10-11",
          actionRevisionId: purchase.actionRevisionId,
        },
      ],
    },
  );
  const commandPath = `/api/v1/credit-cards/${cardId}/commands`,
    newPath = `/money/cards/${cardId}/commands/new`;
  await page.goto(newPath);
  await fill(page, "card_payment", "2000.00");
  await page
    .getByLabel("Paying cash account", { exact: true })
    .selectOption(accountId);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const commands: string[] = [];
  await page.route(`**${commandPath}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    commands.push(route.request().postData()!);
    if (commands.length === 1) {
      const r = await route.fetch();
      expect(r.status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Review card command", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review card command" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The outcome could not be confirmed" }),
  ).toBeVisible();
  await expect(page.getByLabel("Amount (PHP)", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry identical command", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/cards/${cardId}$`));
  expect(commands[0]).toBe(commands[1]);
  await page.unroute(`**${commandPath}`);
  const setup = await (await page.request.get(commandPath)).json();
  expect(setup.creditSources.items).toHaveLength(1);
  expect(setup.creditSources.items[0].unappliedMinor).toBe("200000");
  const allocationPath = `/money/cards/${cardId}/statements/${statement.statementId}/allocations`;
  await page.goto(allocationPath);
  await page
    .getByLabel("Recorded payment or refund", { exact: true })
    .selectOption(setup.creditSources.items[0].actionRevisionId);
  await page
    .getByLabel("Allocation amount (PHP)", { exact: true })
    .fill("1500");
  await page
    .getByLabel("Allocation evidence", { exact: true })
    .fill("Provider confirmed partial application");
  await page
    .getByLabel("Confirmation date", { exact: true })
    .fill("2026-11-07");
  await page.getByLabel(/I confirm this amount applies/).check();
  await page
    .getByRole("button", { name: "Review allocation", exact: true })
    .click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/statements/${statement.statementId}$`),
  );
  let detail = await (
    await page.request.get(
      `/api/v1/credit-cards/${cardId}/statements/${statement.statementId}`,
    )
  ).json();
  expect(detail.snapshot.balanceMinor).toBe("300000");
  expect(detail.reconciliation.recordedRemainingDueMinor).toBe("150000");
  await page.goto(allocationPath);
  await page
    .getByLabel("Allocation reversal reason", { exact: true })
    .fill("Wrong confirmed application");
  await page
    .getByRole("button", { name: "Review reversal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/statements/${statement.statementId}$`),
  );
  detail = await (
    await page.request.get(
      `/api/v1/credit-cards/${cardId}/statements/${statement.statementId}`,
    )
  ).json();
  expect(detail.reconciliation.recordedRemainingDueMinor).toBe("300000");
  expect(
    detail.allocations.items.map((a: { status: string }) => a.status),
  ).toContain("reversed");
  for (const [kind, amount] of [
    ["card_fee", "100"],
    ["card_interest", "200"],
    ["card_refund", "500"],
  ]) {
    await page.goto(
      kind === "card_refund"
        ? `${newPath}?purchaseActionId=${purchase.actionId}`
        : newPath,
    );
    await fill(page, kind!, amount!);
    if (kind === "card_refund")
      await page.getByLabel(/Purchase portion 1 refund/).fill("500");
    await page
      .getByRole("button", { name: "Review card command", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm and record", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/money/cards/${cardId}$`));
  }
  await page.goto(newPath);
  await fill(page, "card_payment", "1000");
  await page
    .getByLabel("Paying cash account", { exact: true })
    .selectOption(accountId);
  await page
    .getByRole("button", { name: "Review card command", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/cards/${cardId}$`));
  const final = await (await page.request.get(commandPath)).json();
  expect(final.card.postedOutstandingMinor).toBe("0");
  expect(final.card.cardCreditMinor).toBe("20000");
  expect(final.accounts[0].currentBalanceMinor).toBe("300000");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await navigation.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(navigation.getByLabel("Theme", { exact: true })).toBeEnabled();
  await navigation
    .getByRole("button", { name: "Close navigation", exact: true })
    .click();
  await page.goto(allocationPath);
  await expect(
    page.getByRole("heading", { name: "Statement allocations", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/card-allocation-dark-320.png",
    fullPage: true,
  });
});
test("A4 commands isolate owners and reject spoofed scope while keeping dark mobile entry accessible", async ({
  page,
  owner,
  browser,
}) => {
  test.setTimeout(60000);
  const other = await createBrowserOwner(),
    ctx = await browser.newContext(),
    foreignPage = await ctx.newPage();
  try {
    await signIn(foreignPage, other);
    const { cardId } = await post(foreignPage, "/api/v1/credit-cards", {
      clientCommandId: randomUUID(),
      name: "Private A4 foreign Visa",
      issuerName: "Private provider",
    });
    await signIn(page, owner);
    const path = `/api/v1/credit-cards/${cardId}/commands`;
    expect((await page.request.get(path)).status()).toBe(404);
    const b = {
      clientCommandId: randomUUID(),
      actionKind: "card_fee",
      amountMinor: "1",
      effectiveDate: "2026-10-10",
      postingDate: "2026-10-11",
      description: "Private fee",
      confirmationSource: "Actual provider evidence",
      providerConfirmed: true,
    };
    expect((await page.request.post(path, { headers, data: b })).status()).toBe(
      404,
    );
    expect(
      (
        await page.request.post(path, {
          headers,
          data: { ...b, workspaceId: randomUUID() },
        })
      ).status(),
    ).toBe(422);
    const html = await (
      await page.request.get(`/money/cards/${cardId}/commands/new`)
    ).text();
    expect(html).toContain("This page could not be found");
    expect(html).not.toContain("Private A4 foreign Visa");
    const own = await post(page, "/api/v1/credit-cards", {
      clientCommandId: randomUUID(),
      name: "Own A4 card",
      issuerName: "Provider",
    });
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByLabel("Theme", { exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/money/cards/${own.cardId}/commands/new`);
    await expect(
      page.getByRole("heading", {
        name: "Record card payment, charge or refund",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/card-command-dark-320.png",
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await removeBrowserOwner(other);
  }
});
