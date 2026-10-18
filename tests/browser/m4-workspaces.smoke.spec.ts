import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";

test("calendar navigation, contextual event creation and visual template composition", async ({
  page,
  owner,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, owner);
  await page.goto("/calendar");
  const calendar = page.getByRole("region", { name: "Interactive calendar" });
  await expect(
    calendar.getByText(/scheduled events in the visible range/),
  ).toBeVisible();
  await expect(calendar.getByRole("table").first()).toBeVisible();
  await calendar.getByLabel("Go to date").fill("2026-10-20");
  await calendar
    .getByRole("button", { name: "Add event", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Make time for something" });
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-10-20",
  );
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Calendar smoke commitment");
  await dialog
    .getByRole("button", { name: "Add personal event", exact: true })
    .click();
  await expect(
    dialog.getByText("Personal event created.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    calendar.getByRole("link", {
      name: "Calendar smoke commitment",
      exact: true,
    }),
  ).toBeVisible();
  for (const name of ["Week", "Day", "Agenda", "Month"]) {
    await calendar.getByRole("button", { name, exact: true }).click();
    await expect(
      calendar.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      calendar.getByText(/scheduled events in the visible range/),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/trackers/templates/new");
  await expect(
    page.getByText("Live entry preview", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page.getByLabel("Label", { exact: true }).fill("Reading deadline");
  await page
    .getByRole("combobox", { name: "Field type", exact: true })
    .selectOption("date");
  await expect(
    page.getByLabel("Reading deadline", { exact: true }),
  ).toHaveAttribute("type", "date");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("career attempts retain real stages, chronological history and archive browsing", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const response = await page.request.post("/api/v1/applications", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      companyName: "M4 synthetic company",
      roleTitle: "Product engineer",
      initialStage: "saved",
      initialStageEffectiveDate: "2026-10-01",
    },
  });
  expect(response.status()).toBe(201);
  const application = await response.json();
  await page.goto("/career/applications");
  await expect(
    page.getByRole("link", { name: "Product engineer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "grouped", exact: true }).click();
  await expect(
    page.getByText("Saved opportunity · not submitted", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Product engineer", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(application.applicationId));
  await expect(
    page.getByRole("heading", { name: "Your application timeline" }),
  ).toBeVisible();
  await expect(
    page.getByText("No next action scheduled", { exact: true }),
  ).toBeVisible();
  await page.goto("/career/applications?archive=archived");
  await expect(page.getByLabel("Lifecycle")).toHaveValue("archived");
  await expect(
    page.getByText("No matching applications", { exact: true }),
  ).toBeVisible();
});
