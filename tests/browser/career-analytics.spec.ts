import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" },
  main = (p: Page) => p.getByRole("main");
async function create(
  p: Page,
  date: string,
  sourceName: string | null = "Referral",
  extra = {},
) {
  const r = await p.request.post("/api/v1/applications", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      companyName: "Analytics same company",
      roleTitle: "Engineer",
      initialStage: "applied",
      initialStageEffectiveDate: date,
      appliedDate: date,
      sourceName,
      allowPossibleDuplicate: true,
      ...extra,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function context(p: Page) {
  const r = await (await p.request.get("/api/v1/dashboard")).json();
  return {
    today: r.today as string,
    d: (n: number) => addCalendarDays(r.today, n),
  };
}
test("Career cohorts, completed progression, timing, source comparisons and CSV share exact evidence", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const c = await context(page);
  const a = await create(page, c.d(-2)),
    b = await create(page, c.d(-2), null);
  await create(page, c.d(-40));
  const response = await page.request.post(
    `/api/v1/applications/${a.applicationId}/observations`,
    {
      headers,
      data: {
        clientCommandId: randomUUID(),
        expectedApplicationVersion: a.version,
        kind: "response",
        date: c.d(-1),
        title: "Recorded employer reply",
      },
    },
  );
  expect(response.status()).toBe(201);
  const scheduled = await page.request.post(
    `/api/v1/applications/${b.applicationId}/events`,
    {
      headers,
      data: {
        clientCommandId: randomUUID(),
        eventKind: "interview",
        title: "Scheduled interview",
        temporalKind: "date",
        eventDate: c.today,
      },
    },
  );
  expect(scheduled.status()).toBe(201);
  const e = await scheduled.json();
  const dates = `period=custom&startDate=${c.d(-28)}&endDate=${c.today}&asOfDate=${c.today}`;
  await page.goto(`/reports/career?${dates}`);
  await expect(
    main(page).getByRole("link", { name: "Submitted attempts 2", exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", {
      name: "Applications reaching interview 0",
      exact: true,
    }),
  ).toBeVisible();
  const complete = await page.request.patch(
    `/api/v1/applications/${b.applicationId}/events/${e.eventId}`,
    {
      headers,
      data: {
        action: "complete",
        clientCommandId: randomUUID(),
        expectedEventVersion: e.eventVersion,
      },
    },
  );
  expect(complete.status(), await complete.text()).toBe(200);
  await page.reload();
  await expect(
    main(page).getByRole("link", {
      name: "Applications reaching interview 1",
      exact: true,
    }),
  ).toBeVisible();
  const evidence = await (
    await page.request.get(`/api/v1/reports/career?${dates}`)
  ).json();
  expect(evidence.summary).toMatchObject({
    submitted: 2,
    responded: 1,
    interviewed: 1,
    responseToInterviewRate: { numerator: 0, denominator: 1 },
    responseTiming: { medianDays: 1, missing: 1 },
  });
  await main(page).getByLabel("Cohort grouping").selectOption("week");
  await main(page)
    .getByRole("combobox", { name: /^Application source/ })
    .selectOption(JSON.stringify("Referral"));
  await main(page).getByLabel("Compare preceding equal-length cohort").check();
  await main(page).getByRole("button", { name: "Apply period" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sourceName=Referral/);
  await expect(
    main(page).getByRole("heading", {
      name: "Previous submission-cohort comparison",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    main(page).getByRole("link", { name: "Submitted attempts 1", exact: true }),
  ).toBeVisible();
  await expect(
    main(page).getByText(/Recent cohorts have less follow-up/),
  ).toBeVisible();
  await main(page).getByLabel("CSV contents").selectOption("report");
  const downloading = page.waitForEvent("download");
  await main(page).getByRole("button", { name: "Download CSV" }).click();
  const download = await downloading;
  const rows = parse(await readFile((await download.path())!), {
    bom: true,
    columns: true,
  }) as Record<string, string>[];
  expect(rows[0]).toMatchObject({
    schema_version: "4",
    career_calculation_version: "v2-f-corrected-cohorts-1",
  });
  expect(
    JSON.parse(
      rows.find((r) => r.record_type === "career_cohort_summary")!
        .summary_json!,
    ),
  ).toMatchObject({
    submitted: 1,
    responded: 1,
    responseTiming: { medianDays: 1 },
  });
  expect(
    JSON.parse(
      rows.find((r) => r.record_type === "career_comparison_summary")!
        .summary_json!,
    ).submitted,
  ).toBe(1);
  await main(page)
    .getByRole("link", { name: "Explicit responses 1", exact: true })
    .click();
  await expect(page).toHaveURL(/#responded-records$/);
  await main(page)
    .locator("#responded-records")
    .getByRole("link", { name: /Analytics same company/ })
    .click();
  await expect(
    main(page).getByRole("heading", { name: "Engineer", exact: true }),
  ).toBeVisible();
  await main(page)
    .getByRole("link", {
      name: "View this attempt’s submission cohort",
      exact: true,
    })
    .click();
  await expect(
    main(page).getByRole("heading", { name: "Career report", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    main(page).getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await main(page)
    .getByRole("link", {
      name: "Explore submission-cohort analytics for this period",
      exact: true,
    })
    .click();
  await expect(
    main(page).getByRole("heading", { name: "Career report", exact: true }),
  ).toBeVisible();
});
test("Career analytics exclude private fields and enforce owner scope and strict filters", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const c = await context(page);
  const a = await create(page, c.today, "Private source", {
    contactEmail: "sensitive-contact@example.test",
    contactName: "PRIVATE_CONTACT",
    notes: "PRIVATE_APPLICATION_NOTES",
    salaryMinMinor: "9000000",
    salaryMaxMinor: "9000000",
    salaryCurrency: "PHP",
    salaryPeriod: "month",
  });
  const owned = await (await page.request.get("/api/v1/reports/career")).text();
  expect(owned).toContain(a.applicationId);
  for (const sentinel of [
    "sensitive-contact",
    "PRIVATE_CONTACT",
    "PRIVATE_APPLICATION_NOTES",
    "9000000",
  ])
    expect(owned).not.toContain(sentinel);
  const aggregate = await (
    await page.request.get("/api/v1/exports/report.csv")
  ).text();
  for (const sentinel of [
    "sensitive-contact",
    "PRIVATE_CONTACT",
    "PRIVATE_APPLICATION_NOTES",
    "9000000",
  ])
    expect(aggregate).not.toContain(sentinel);
  const other = await createBrowserOwner(),
    ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const p = await ctx.newPage();
    await signIn(p, other);
    const r = await p.request.get("/api/v1/reports/career", {
      headers: { "x-workspace-id": owner.workspaceId },
    });
    expect(r.status()).toBe(200);
    const data = await r.json();
    expect(data.summary.submitted).toBe(0);
    expect(JSON.stringify(data)).not.toContain(a.applicationId);
    expect(data.availableSources).toEqual([]);
    expect(
      (
        await p.request.get(
          `/api/v1/reports/career?workspaceId=${owner.workspaceId}`,
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await p.request.get(
          "/api/v1/reports/career?sourceName=A&sourceMissing=true",
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await p.request.get(
          "/api/v1/reports/career?cohortInterval=week&cohortInterval=year",
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await p.request.get("/api/v1/reports/financial?cohortInterval=week")
      ).status(),
    ).toBe(400);
    expect(
      await (await p.request.get("/api/v1/exports/applications.csv")).text(),
    ).not.toContain(a.applicationId);
    const anonymous = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    try {
      expect(
        (await anonymous.request.get("/api/v1/reports/career")).status(),
      ).toBe(401);
      expect(
        (
          await anonymous.request.get("/api/v1/exports/applications.csv")
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    await ctx.close();
    await removeBrowserOwner(other);
  }
});
test("maximum-length Career analytics reflow, keyboard filters and both-theme accessibility at 320px", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const c = await context(page);
  await create(page, c.today, "s".repeat(200), {
    companyName: "c".repeat(200),
    roleTitle: "r".repeat(200),
    notes: "private ".repeat(2000),
  });
  await page.setViewportSize({ width: 320, height: 844 });
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/reports/career?cohortInterval=week&compare=previous");
    await expect(
      main(page).getByRole("heading", { name: "Career report", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/career-analytics-${theme}.png`,
    });
    await main(page)
      .locator("#submitted-records")
      .screenshot({
        path: `test-results/career-analytics-records-${theme}.png`,
      });
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await main(page).getByRole("button", { name: "Apply period" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    main(page).getByRole("link", { name: "Submitted attempts 1", exact: true }),
  ).toBeVisible();
  await cpu.detach();
});
