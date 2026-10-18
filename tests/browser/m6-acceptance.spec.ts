import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { seedM6Inventory } from "./helpers/m6-inventory";

test("production route inventory, responsive themes, keyboard and accessibility acceptance", async ({
  page,
  owner,
}, testInfo) => {
  test.setTimeout(600_000);
  const issues: string[] = [],
    errors: string[] = [],
    samples: object[] = [],
    axeResults: object[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, owner);
  const inventory = await seedM6Inventory(page);
  const auditRoutes = new Set([
    "/",
    "/money/accounts",
    "/money/transactions?kind=expense",
    "/calendar",
    "/trackers/templates/new",
    "/trackers/reports",
    "/reports/financial",
    "/reports/career",
    "/settings/notifications",
    "/settings/files",
    "/settings/portability",
    "/settings/lifecycle",
    "/settings/sessions",
    "/help",
  ]);
  for (const route of inventory.routes) {
    console.log("M6 route:", route);
    const started = Date.now();
    try {
      const r = await page.goto(route);
      expect(r?.status(), route).toBe(200);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      expect(await page.getByRole("main").count(), route).toBe(1);
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      if (geometry.documentWidth > geometry.width)
        issues.push(
          `${route}: desktop document overflow ${JSON.stringify(geometry)}`,
        );
      samples.push({ route, readyMs: Date.now() - started, ...geometry });
      if (auditRoutes.has(route)) {
        const result = await new AxeBuilder({ page }).analyze();
        const violations = result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        }));
        axeResults.push({ route, theme: "light", width: 1440, violations });
        if (violations.length)
          issues.push(
            `${route}: axe ${violations.map((v) => v.id).join(", ")}`,
          );
      }
    } catch (e) {
      issues.push(`${route}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await mkdir("out", { recursive: true });
  await writeFile(
    "out/m6-route-acceptance.json",
    JSON.stringify(
      { routes: inventory.routes, samples, axeResults, errors, issues },
      null,
      2,
    ),
  );
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Your account", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Theme", exact: true })
      .selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await page.keyboard.press("Escape");
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "/",
        "/calendar",
        "/money/accounts",
        "/money/transactions?kind=expense",
        "/trackers/templates/new",
        "/reports/financial",
        "/settings/portability",
      ]) {
        await page.goto(route);
        await expect(
          page.getByRole("main").getByRole("heading", { level: 1 }),
        ).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        samples.push({ route, theme, width, overflow });
        if (overflow) issues.push(`${route}: ${theme} ${width}px overflow`);
        if (
          width === 320 &&
          [
            "/calendar",
            "/trackers/templates/new",
            "/reports/financial",
          ].includes(route)
        ) {
          const result = await new AxeBuilder({ page }).analyze();
          const violations = result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          }));
          axeResults.push({ route, theme, width, violations });
          if (violations.length)
            issues.push(
              `${route}: ${theme} 320px axe ${violations.map((v) => v.id).join(", ")}`,
            );
        }
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/calendar");
  const trigger = page.getByRole("button", { name: "Add event", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Make time for something" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ forcedColors: "none" });
  await page.goto("/settings/notifications");
  const skip = page.getByRole("link", { name: /Skip to/ });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  // Chromium CSS text enlargement complements 320px reflow. It is not a claim
  // of real browser-UI zoom, a physical device or a manual screen-reader pass.
  for (const scale of [2, 4]) {
    await page.goto("/settings/portability");
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await page.addStyleTag({
      content: `html { font-size: ${16 * scale}px !important; }`,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    samples.push({
      route: "/settings/portability",
      textScale: scale,
      width: 320,
      overflow,
    });
    if (overflow) issues.push(`Portability ${scale * 100}% text overflow`);
  }
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const began = Date.now();
  await page.goto("/calendar");
  await expect(
    page
      .getByRole("region", { name: "Interactive calendar" })
      .getByRole("table")
      .first(),
  ).toBeVisible();
  samples.push({
    route: "/calendar",
    cpuThrottle: 4,
    readyMs: Date.now() - began,
  });
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await mkdir("out", { recursive: true });
  await writeFile(
    "out/m6-route-acceptance.json",
    JSON.stringify(
      {
        project: testInfo.project.name,
        routes: inventory.routes,
        samples,
        axeResults,
        errors,
        issues,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(issues).toEqual([]);
});

test("import file selection waits for its client handler before accepting a file", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = "**/_next/static/**/*.js*";
  await page.route(pattern, async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/settings/portability", { waitUntil: "commit" });
    await expect(
      page.getByLabel("UTF-8 cash CSV", { exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByLabel("UTF-8 cash CSV", { exact: true }),
    ).toBeEnabled();
  } finally {
    release();
    await page.unroute(pattern);
  }
});

test("public authentication and production proof boundary retain accessible routes", async ({
  page,
}) => {
  const results = [];
  for (const path of [
    "/auth/sign-in",
    "/auth/sign-up",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
  ]) {
    const r = await page.goto(path);
    expect(r?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    results.push({
      path,
      scriptEncodedBytes: await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes("/_next/") && r.name.includes(".js"))
          .reduce(
            (n, r) => n + (r as PerformanceResourceTiming).encodedBodySize,
            0,
          ),
      ),
    });
  }
  expect((await page.request.get("/dev/design")).status()).toBe(404);
  expect(
    (
      await page.request.get("/api/v1/accounts", {
        headers: { "x-workspace-id": "00000000-0000-4000-8000-000000000000" },
      })
    ).status(),
  ).toBe(401);
  await writeFile(
    "out/m6-public-acceptance.json",
    JSON.stringify(results, null, 2),
  );
});

test("calendar bounded loading, source filters and retry preserve honest coverage", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  for (let i = 0; i < 6; i++) {
    const r = await page.request.post("/api/v1/personal-events", {
      headers: { origin: "http://localhost:3100" },
      data: {
        clientCommandId: crypto.randomUUID(),
        title: `M6 pagination event ${i}`,
        temporalKind: "date",
        eventDate: today,
      },
    });
    expect(r.status()).toBe(201);
  }
  let unavailable = false;
  await page.route("**/api/v1/agenda**", async (route) => {
    if (unavailable) {
      await route.fulfill({
        status: 503,
        json: { message: "Synthetic unavailable read" },
      });
      return;
    }
    const url = new URL(route.request().url());
    url.searchParams.set("pageSize", "1");
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
  });
  await page.goto("/calendar");
  const calendar = page.getByRole("region", { name: "Interactive calendar" });
  await expect(
    calendar.getByText(/Partial calendar: 5 events loaded/),
  ).toBeVisible();
  await calendar
    .getByRole("button", { name: "Load more events", exact: true })
    .click();
  await expect(
    calendar.getByText(/6 scheduled events in the visible range/),
  ).toBeVisible();
  await calendar.getByRole("button", { name: "Money", exact: true }).click();
  await expect(
    calendar.getByText(/0 scheduled events in the visible range/),
  ).toBeVisible();
  unavailable = true;
  await calendar.getByRole("button", { name: "Personal", exact: true }).click();
  await expect(calendar.getByRole("alert")).toBeVisible();
  await expect(
    calendar.getByText("No scheduled events on this date.", { exact: true }),
  ).toHaveCount(0);
  unavailable = false;
  await calendar.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    calendar.getByText(/Partial calendar: 5 events loaded/),
  ).toBeVisible();
});
