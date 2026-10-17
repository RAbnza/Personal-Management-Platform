import { expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" };
async function command(page: Page, data: object) {
  const r = await page.request.post("/api/v1/recurring-obligations", {
    headers,
    data,
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
async function today(page: Page) {
  return String(
    (await (await page.request.get("/api/v1/dashboard")).json()).today,
  );
}
function definition(date: string, name = "Browser recurring bill") {
  return {
    operation: "definition",
    clientCommandId: randomUUID(),
    obligationId: null,
    expectedVersion: null,
    name,
    kind: "bill",
    reason: null,
    rule: {
      effectiveFrom: date,
      frequency: "daily",
      intervalCount: 1,
      weekdays: null,
      dayOfMonth: null,
      shortMonthPolicy: null,
      endsOn: null,
      occurrenceLimit: 5,
      expectedMinor: "10000",
      currency: "PHP",
      categoryId: null,
      defaultAccountId: null,
      timezone: "Asia/Manila",
    },
    window: { from: date, through: addCalendarDays(date, 30) },
  };
}
async function audit(page: Page, cpu: CDPSession, theme?: string) {
  // The persistent app shell can be visible while Next streams route content.
  // Audit the rendered page rather than its temporary loading boundary.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // New documents can hydrate the saved theme after their heading is visible.
  // Measure the selected theme after finite color transitions, not a blend.
  if (theme) await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
            animation.playState !== "idle" &&
            animation.playState !== "paused",
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    console.log(
      "Recurring reflow diagnostics",
      new URL(page.url()).pathname,
      await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
          .map((e) => ({
            tag: e.tagName,
            className: e.className,
            text: e.innerText?.slice(0, 60),
            width: e.getBoundingClientRect().width,
            left: e.getBoundingClientRect().left,
          }))
          .sort((a, b) => b.width - a.width)
          .slice(0, 8),
      ),
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
test("recurrence preview, existing actual entry and lost-link replay recognize spending once", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const date = await today(page);
  const bankResponse = await page.request.post("/api/v1/accounts", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name: "Recurring browser bank",
      accountType: "savings",
      openingCutoffDate: addCalendarDays(date, -1),
      openingBalanceMinor: "100000",
    },
  });
  expect(bankResponse.status()).toBe(201);
  const bank = await bankResponse.json();
  await page.goto("/money/recurring");
  await page
    .locator("summary")
    .filter({ hasText: "Create recurring plan" })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview and review recurrence" }),
  ).toBeEnabled();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Reviewed browser subscription");
  await page
    .getByLabel("Recurring kind", { exact: true })
    .selectOption("subscription");
  await page
    .getByLabel("Expected amount (PHP)", { exact: true })
    .fill("100.00");
  await page
    .getByLabel("Month day", { exact: true })
    .fill(String(Number(date.slice(8))));
  await page
    .getByLabel("Short-month behavior", { exact: true })
    .selectOption("last_valid_day");
  await page
    .getByText("Schedule options and suggestions", { exact: true })
    .click();
  await page
    .getByLabel("Suggested account (optional)", { exact: true })
    .selectOption(bank.accountId);
  await page
    .getByRole("button", { name: "Preview and review recurrence" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review recurring plan" }),
  ).toBeFocused();
  await expect(page.getByLabel("Recurrence preview")).toContainText(date);
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reviewed browser subscription",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(`${date} · planned`) })
    .first()
    .click();
  await page
    .getByRole("link", {
      name: "Record actual payment or receipt",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Amount (PHP)", { exact: true })).toHaveValue(
    "100.00",
  );
  await expect(page.getByLabel("Funding account", { exact: true })).toHaveValue(
    bank.accountId,
  );
  await page.getByLabel("Transaction date", { exact: true }).fill(date);
  await page
    .getByRole("button", { name: "Continue to review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save transaction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Planned occurrence", exact: true }),
  ).toBeVisible();
  const detail = await (
    await page.request.get(
      `/api/v1/recurring-obligations?occurrenceId=${new URL(page.url()).pathname.split("/").at(-1)}`,
    )
  ).json();
  expect(detail.actuals).toHaveLength(1);
  await page
    .getByLabel("Existing actual transaction", { exact: true })
    .selectOption(detail.actuals[0].actionId);
  await page
    .getByRole("button", { name: "Review actual link", exact: true })
    .click();
  let lost = true;
  const bodies: string[] = [];
  await page.route("**/api/v1/recurring-obligations", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.postDataJSON().operation === "link") {
      bodies.push(req.postData()!);
      if (lost) {
        lost = false;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The outcome could not be confirmed" }),
  ).toContainText("could not be confirmed");
  await expect(
    page.getByLabel("Existing actual transaction", { exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry identical command" }).click();
  await expect(
    page
      .getByRole("region", { name: "Planned occurrence" })
      .getByText("completed", { exact: true }),
  ).toBeVisible();
  expect(new Set(bodies).size).toBe(1);
  expect(bodies).toHaveLength(2);
  const report = await (
    await page.request.get(
      `/api/v1/reports/financial?period=custom&startDate=${date}&endDate=${date}`,
    )
  ).json();
  expect(report.metrics.gross).toBe("10000");
  expect(report.metrics.net).toBe("10000");
  await page.goto(`/money/actions/${detail.actuals[0].actionId}`);
  await page
    .getByText("Recurring occurrence confirmations", { exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: /Reviewed browser subscription.*linked.*completed/,
    }),
  ).toBeVisible();
});
test("individual skip, future revision, archive and foreign records retain private immutable history", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const date = await today(page),
    b = definition(date),
    p = await command(page, b),
    occurrenceId = p.occurrenceIds[0];
  await page.goto(`/money/recurring/occurrences/${occurrenceId}`);
  await page.getByText("Change this occurrence only", { exact: true }).click();
  await page
    .getByLabel("Occurrence change", { exact: true })
    .selectOption("skip");
  await page
    .getByLabel("Occurrence change reason", { exact: true })
    .fill("Skip this planned bill only");
  await page
    .getByRole("button", { name: "Review occurrence change", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(
    page
      .getByRole("region", { name: "Planned occurrence" })
      .getByText("skipped", { exact: true }),
  ).toBeVisible();
  const revised = await command(page, {
    ...b,
    clientCommandId: randomUUID(),
    obligationId: p.obligationId,
    expectedVersion: 1,
    reason: "Confirmed future schedule",
    rule: {
      ...b.rule,
      effectiveFrom: addCalendarDays(date, 2),
      intervalCount: 2,
    },
  });
  expect(revised.version).toBe(2);
  await page.goto(`/money/recurring/${p.obligationId}`);
  await page
    .getByText("Immutable rule and definition history", { exact: true })
    .click();
  await expect(page.getByText(/Rule 1: effective/)).toBeVisible();
  await expect(page.getByText(/Rule 2: effective/)).toBeVisible();
  await page.getByText("Archive this definition", { exact: true }).click();
  await page
    .getByLabel("Archive reason", { exact: true })
    .fill("Stop future generation");
  await page
    .getByRole("button", { name: "Review archive", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and record" }).click();
  await expect(page.getByRole("main")).toContainText("Archived");
  const other = await createBrowserOwner();
  try {
    const context = await page.context().browser()!.newContext(),
      foreign = await context.newPage();
    await signIn(foreign, other);
    const read = await foreign.request.get(
      `/api/v1/recurring-obligations?obligationId=${p.obligationId}`,
    );
    expect(read.status()).toBe(404);
    const spoof = await foreign.request.post("/api/v1/recurring-obligations", {
      headers,
      data: {
        operation: "generate",
        clientCommandId: randomUUID(),
        obligationId: p.obligationId,
        expectedVersion: 3,
        window: b.window,
        userId: owner.userId,
      },
    });
    expect(spoof.status()).toBe(422);
    await foreign.goto(`/money/recurring/occurrences/${occurrenceId}`);
    await expect(
      foreign.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await context.close();
  } finally {
    await removeBrowserOwner(other);
  }
});
test("planned sources support keyboard reminders, both themes and long-name 320px accessible pages", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const date = await today(page),
    p = await command(
      page,
      definition(date, "Recurring plan " + "x".repeat(185)),
    ),
    occurrenceId = p.occurrenceIds[0],
    cpu = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/money/recurring");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    for (const path of [
      "/money/recurring",
      `/money/recurring/${p.obligationId}`,
      `/money/recurring/occurrences/${occurrenceId}`,
      `/calendar/reminders/expected_occurrence/${occurrenceId}`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await audit(page, cpu, theme);
    }
  }
  const dismiss = page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .first();
  await expect(dismiss).toBeEnabled();
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Review reminder change", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm reminder change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore reminder", exact: true }).first(),
  ).toBeVisible();
  await page.goto(
    `/calendar?startDate=${date}&endDate=${addCalendarDays(date, 7)}`,
  );
  await expect(page.getByRole("main")).toContainText(
    "Planned recurring obligation",
  );
  await audit(page, cpu, "dark");
  await cpu.detach();
});
