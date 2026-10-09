import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
test("V1 critical routes reflow at 320px, expose labels/noncolor states and meet automated accessibility checks", async ({
  page,
  owner,
}) => {
  test.setTimeout(60000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of [
    "/",
    "/money/accounts",
    "/money/debts/import",
    "/money/transfers",
    "/career/applications/new",
    "/calendar",
    "/reports/financial",
    "/reports/career",
    "/settings",
    "/settings/sessions",
    "/help",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBe(true);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations, path).toEqual([]);
  }
});

test("saved dark theme preserves contrast and error cues at 320px", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const savedTheme = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/settings/preference") &&
      r.request().method() === "PATCH",
  );
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  expect((await savedTheme).status()).toBe(200);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of [
    "/",
    "/reports/financial",
    "/money/debts/import",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("main")).toBeVisible();
    if (path === "/money/debts/import") {
      await page
        .getByRole("button", { name: "Review import", exact: true })
        .click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Review these import details" }),
      ).toBeVisible();
      await expect(page.getByLabel("Debt name", { exact: true })).toBeFocused();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual(
      [],
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBe(true);
  }
});
test("mobile navigation traps keyboard focus and restores the trigger; financial validation/review focus is meaningful", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let n = 0; n < 15; n++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.goto("/money/debts/import");
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Review these import details" }),
  ).toContainText("Review these import details");
  await expect(page.getByLabel("Debt name", { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
