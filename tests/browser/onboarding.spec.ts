import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";

test("onboarding skip survives reload, resumes and replays help without business records", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const paths = ["/api/v1/accounts", "/api/v1/debts", "/api/v1/applications"];
  const before = await Promise.all(
    paths.map(async (p) => (await page.request.get(p)).json()),
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/onboarding");
  await page
    .getByRole("button", {
      name: "Skip for now: Add your first financial account",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Resume: Add your first financial account",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Resume: Add your first financial account",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Skip for now: Add your first financial account",
      exact: true,
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/help");
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.getByRole("button", { name: "Start tour" }).click();
    for (let step = 0; step < 4; step++)
      await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Finish tour" }).click();
  }
  const after = await Promise.all(
    paths.map(async (p) => (await page.request.get(p)).json()),
  );
  expect(after).toEqual(before);
});
