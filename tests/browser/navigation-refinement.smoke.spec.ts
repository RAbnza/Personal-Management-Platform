import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";

test("adaptive navigation, named deep links and aligned account actions", async ({
  page,
  owner,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, owner);
  const primary = page.getByRole("navigation", {
    name: "Primary",
    exact: true,
  });
  await expect(
    primary.getByRole("link", { name: "Money", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("button", { name: "Modules", exact: true }),
  ).toBeHidden();
  const explore = primary.getByRole("button", { name: "Explore", exact: true });
  await explore.click();
  const explorePanel = page.getByRole("dialog", { name: "Your modules" });
  await expect(explorePanel).toBeVisible();
  await expect(explorePanel.locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(explore).toBeFocused();
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Workspace and account" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Your account", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Find a screen", exact: true })
    .click();
  await page.getByRole("combobox").fill("accounts");
  await page.getByRole("option", { name: /Accounts Balances/ }).click();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  await expect(
    primary.getByRole("link", { name: "Money", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const ids: string[] = [];
  for (const [name, notes] of [
    ["Cash Wallet", null],
    [
      "Savings for the next chapter and a much longer account name",
      "A long note with useful context. ".repeat(12),
    ],
  ]) {
    const response = await page.request.post("/api/v1/accounts", {
      headers: { origin: "http://localhost:3100" },
      data: {
        clientCommandId: randomUUID(),
        name,
        notes,
        accountType: "cash",
        openingCutoffDate: "2026-10-01",
        openingBalanceMinor: "100000",
      },
    });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).accountId);
  }
  await page.reload();
  const accounts = page.getByRole("region", {
    name: "financial accounts",
    exact: true,
  });
  const footers = accounts.locator("footer");
  await expect(footers).toHaveCount(2);
  async function aligned() {
    const boxes = await footers.evaluateAll((els) =>
      els.map((e) => ({
        top: e.getBoundingClientRect().top,
        height: e.getBoundingClientRect().height,
      })),
    );
    expect(Math.abs(boxes[0]!.top - boxes[1]!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[0]!.height - boxes[1]!.height)).toBeLessThanOrEqual(
      1,
    );
  }
  await aligned();
  await accounts.getByText("Account notes", { exact: true }).click();
  await aligned();
  const history = `/money/accounts/${ids[0]}/history`;
  await page.goto(history);
  const crumb = page.getByRole("navigation", {
    name: "Breadcrumb",
    exact: true,
  });
  await expect(crumb.getByText("Cash Wallet", { exact: true })).toBeVisible();
  await expect(crumb.locator('[aria-current="page"]')).toHaveText(
    "Account history",
  );
  await crumb.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${ids[0]}/history$`));
  await expect(crumb.getByText("Cash Wallet", { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/money\/accounts$/);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await aligned();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const modules = primary.getByRole("button", { name: "Modules", exact: true });
  await expect(modules).toBeVisible();
  await expect(
    primary.getByRole("link", { name: "Money", exact: true }),
  ).toBeHidden();
  await modules.click();
  await expect(
    page
      .getByRole("dialog", { name: "Your modules" })
      .getByRole("link", { name: /Money Activity/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modules).toBeFocused();
  await page.goto(`/money/accounts/${ids[0]}/reconcile`);
  await expect(
    crumb.getByRole("link", { name: "Cash Wallet", exact: true }),
  ).toHaveAttribute("href", history);
  await expect(crumb.locator('[aria-current="page"]')).toHaveText(
    "Check balance",
  );
  await expect(primary).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
