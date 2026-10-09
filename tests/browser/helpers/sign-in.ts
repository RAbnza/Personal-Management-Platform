import { expect, type Page } from "@playwright/test";
import type { BrowserOwner } from "./owner";
export async function signIn(page: Page, owner: BrowserOwner) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  const submit = async () => {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  };
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
