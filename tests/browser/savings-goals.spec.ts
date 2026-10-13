import { expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
const headers = { origin: "http://localhost:3100" },
  main = (p: Page) => p.getByRole("main");
async function ready(p: Page, name?: string) {
  await expect(
    main(p).getByRole("heading", {
      level: 1,
      ...(name ? { name, exact: true } : {}),
    }),
  ).toBeVisible();
}
async function metric(p: Page, label: string, value: string) {
  await expect(
    main(p).getByText(label, { exact: true }).locator("..").locator("dd"),
  ).toHaveText(value);
}
async function disclose(p: Page, label: string) {
  const summary = main(p).getByText(label, { exact: true });
  if ((await summary.locator("..").getAttribute("open")) === null)
    await summary.click();
}
async function cash(p: Page, name = "Owned savings cash") {
  const r = await p.request.post("/api/v1/accounts", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name,
      accountType: "checking",
      openingCutoffDate: "2026-09-30",
      openingBalanceMinor: "10000",
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).accountId as string;
}
const goalBody = (name = "Emergency", extra: Record<string, unknown> = {}) => ({
  operation: "save",
  clientCommandId: randomUUID(),
  goalId: null,
  expectedVersion: null,
  reason: null,
  fields: {
    name,
    targetMinor: "10000",
    targetDate: null,
    notes: "Private savings evidence",
    ...extra,
  },
});
async function goal(
  p: Page,
  name = "Emergency",
  extra: Record<string, unknown> = {},
) {
  const r = await p.request.post("/api/v1/savings-goals", {
    headers,
    data: goalBody(name, extra),
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).goalId as string;
}
async function reserve(p: Page, accountId: string, amount: string) {
  await disclose(p, "Reserve or release funds");
  await main(p)
    .getByRole("combobox", { name: "Reservation account", exact: true })
    .selectOption(accountId);
  await main(p)
    .getByRole("textbox", { name: "Total reservation (PHP)", exact: true })
    .fill(amount);
  await main(p)
    .getByRole("textbox", {
      name: "Reason for reservation change",
      exact: true,
    })
    .fill("Explicit reviewed reservation");
  await main(p)
    .getByRole("button", { name: "Review reservation", exact: true })
    .click();
  await expect(
    main(p).getByRole("heading", { name: "Review reservation", exact: true }),
  ).toBeFocused();
  await main(p)
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
}
async function milestone(
  p: Page,
  operation: "complete" | "archive" | "reopen",
) {
  await disclose(
    p,
    operation === "complete"
      ? "Complete goal"
      : operation === "archive"
        ? "Archive goal"
        : "Reopen goal",
  );
  await main(p)
    .getByRole("textbox", { name: `Reason to ${operation} goal`, exact: true })
    .fill("Explicit management milestone");
  await main(p)
    .getByRole("button", { name: `Review ${operation}`, exact: true })
    .click();
  await main(p)
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
}
async function audit(p: Page, cpu: CDPSession) {
  await ready(p);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const layout = await p.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((e) => e.getBoundingClientRect().right > innerWidth)
      .slice(-12)
      .map((e) => ({
        tag: e.tagName,
        className: e.className,
        href: e.getAttribute("href"),
      })),
  }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport,
  );
  expect((await new AxeBuilder({ page: p }).analyze()).violations).toEqual([]);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
test("reviewed goal response-loss retry and real spending preserve cash, reservations and supported funding", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const accountId = await cash(page),
    requests: string[] = [];
  let lose = true,
    goalId = "";
  await page.route("**/api/v1/savings-goals", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    requests.push(route.request().postData()!);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    goalId = (await response.json()).goalId;
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.goto("/money/goals");
  await ready(page, "Savings goals");
  await main(page)
    .getByRole("textbox", { name: "Goal name", exact: true })
    .fill("Emergency");
  await main(page)
    .getByRole("textbox", { name: "Target amount (PHP)", exact: true })
    .fill("100.00");
  await main(page)
    .getByRole("button", { name: "Review goal", exact: true })
    .click();
  await expect(
    main(page).getByRole("heading", {
      name: "Review savings goal",
      exact: true,
    }),
  ).toBeFocused();
  expect(requests).toHaveLength(0);
  await main(page)
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await expect(
    main(page).getByRole("button", {
      name: "Retry identical command",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    main(page).getByRole("textbox", { name: "Goal name", exact: true }),
  ).toBeDisabled();
  await main(page)
    .getByRole("button", { name: "Retry identical command", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/money/goals/${goalId}$`));
  await ready(page, "Emergency savings goal");
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  await page.unroute("**/api/v1/savings-goals");
  await reserve(page, accountId, "80.00");
  await metric(page, "Currently reserved", "PHP 80.00");
  await metric(page, "Minimum supported funding", "PHP 80.00");
  const categories = await (
    await page.request.get("/api/v1/categories?kind=expense")
  ).json();
  const actual = await page.request.post("/api/v1/financial-actions", {
    headers,
    data: {
      actionKind: "expense",
      clientCommandId: randomUUID(),
      fundingAccountId: accountId,
      effectiveDate: "2026-10-02",
      purchaseMinor: "6000",
      splits: [
        { categoryId: categories.items[0].categoryId, amountMinor: "6000" },
      ],
      description: "Real cash remains spendable",
    },
  });
  expect(actual.status()).toBe(201);
  await page.reload();
  await ready(page, "Emergency savings goal");
  await metric(page, "Currently reserved", "PHP 80.00");
  await metric(page, "Minimum supported funding", "PHP 40.00");
  await metric(page, "Reservation shortfall", "PHP 40.00");
  const d = await (
    await page.request.get(`/api/v1/savings-goals?goalId=${goalId}`)
  ).json();
  expect(d.history.items).toHaveLength(3);
  const report = await (
    await page.request.get(
      "/api/v1/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
    )
  ).json();
  expect(report.metrics.net).toBe("6000");
  expect(report.metrics.closing_cash).toBe("4000");
  expect(report.savingsGoals.items[0].reservedMinor).toBe("8000");
  await page.goto(
    "/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
  );
  await ready(page, "Financial report");
  await expect(
    main(page).getByRole("link", { name: "Manage savings goals", exact: true }),
  ).toHaveAttribute("href", "/money/goals");
  await page.goto("/?period=custom&startDate=2026-10-01&endDate=2026-10-31");
  await ready(page, "Dashboard");
  await expect(main(page)).toContainText("Savings goals");
});
test("explicit reallocation, completion, release, archive/reopen and private isolation retain immutable evidence", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const accountId = await cash(page),
    source = await goal(page, "Holiday"),
    target = await goal(page, "Travel");
  await page.goto(`/money/goals/${source}`);
  await ready(page, "Holiday savings goal");
  await reserve(page, accountId, "80.00");
  await metric(page, "Currently reserved", "PHP 80.00");
  await disclose(page, "Reallocate reservations");
  for (const label of [
    "Source reservation account",
    "Destination cash account",
  ])
    await main(page)
      .getByRole("combobox", { name: label, exact: true })
      .selectOption(accountId);
  await main(page)
    .getByRole("combobox", { name: "Destination savings goal", exact: true })
    .selectOption(target);
  await main(page)
    .getByRole("textbox", { name: "Reallocation amount (PHP)", exact: true })
    .fill("30.00");
  await main(page)
    .getByRole("textbox", { name: "Reason for reallocation", exact: true })
    .fill("Reassign without transferring money");
  await main(page)
    .getByRole("button", { name: "Review reallocation", exact: true })
    .click();
  await main(page)
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await metric(page, "Currently reserved", "PHP 50.00");
  await metric(page, "All goal reservations", "PHP 80.00");
  await milestone(page, "complete");
  await expect(main(page).getByText(/^completed ·/)).toBeVisible();
  await metric(page, "All goal reservations", "PHP 80.00");
  await milestone(page, "archive");
  await expect(main(page).locator("p[role='alert']")).toContainText(
    "Release reservations explicitly",
  );
  await reserve(page, accountId, "0");
  await metric(page, "Currently reserved", "PHP 0.00");
  await milestone(page, "archive");
  await expect(main(page).getByText(/^archived ·/)).toBeVisible();
  await milestone(page, "reopen");
  await expect(main(page).getByText(/^active ·/)).toBeVisible();
  const d = await (
    await page.request.get(`/api/v1/savings-goals?goalId=${source}`)
  ).json();
  expect(d.goal.version).toBe(7);
  expect(d.history.items).toHaveLength(10);
  expect(
    (
      await (
        await page.request.get(`/api/v1/savings-goals?goalId=${target}`)
      ).json()
    ).goal.reservedMinor,
  ).toBe("3000");
  const other = await createBrowserOwner();
  let context;
  try {
    context = await page.context().browser()!.newContext();
    const foreign = await context.newPage();
    expect((await foreign.request.get("/api/v1/savings-goals")).status()).toBe(
      401,
    );
    expect(
      (
        await foreign.request.post("/api/v1/savings-goals", {
          headers,
          data: goalBody(),
        })
      ).status(),
    ).toBe(401);
    await signIn(foreign, other);
    expect(
      (
        await foreign.request.get(`/api/v1/savings-goals?goalId=${source}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreign.request.post("/api/v1/savings-goals", {
          headers,
          data: { ...goalBody(), workspaceId: owner.workspaceId },
        })
      ).status(),
    ).toBe(422);
    await foreign.goto(`/money/goals/${source}`);
    await expect(
      foreign.getByRole("heading", { name: /could not be found|not found/i }),
    ).toBeVisible();
    await expect(foreign.locator("body")).not.toContainText(
      "Private savings evidence",
    );
    await page.goto(`/money/goals/${source}?goalId=${target}`);
    await expect(
      page.getByRole("heading", { name: /could not be found|not found/i }),
    ).toBeVisible();
  } finally {
    await context?.close();
    await removeBrowserOwner(other);
  }
});
test("maximum goal/account names, notes and exact targets pass keyboard review, both themes and 320px accessibility", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const name = "Savings goal " + "x".repeat(187),
    accountName = "Savings cash " + "y".repeat(187),
    accountId = await cash(page, accountName),
    id = await goal(page, name, {
      targetMinor: "9223372036854775807",
      notes: "n".repeat(2000),
    }),
    cpu = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/money/goals");
    await ready(page, "Savings goals");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    for (const path of [
      "/money/goals",
      `/money/goals/${id}`,
      "/reports/financial?period=custom&startDate=2026-10-01&endDate=2026-10-31",
      "/?period=custom&startDate=2026-10-01&endDate=2026-10-31",
    ]) {
      await page.goto(path);
      await audit(page, cpu);
    }
    await page.goto(`/money/goals/${id}`);
    await ready(page, `${name} savings goal`);
    await page.screenshot({ path: `test-results/savings-${theme}.png` });
  }
  await reserve(page, accountId, "1.00");
  await metric(page, "Currently reserved", "PHP 1.00");
  await disclose(page, "Reserve or release funds");
  await main(page)
    .getByRole("combobox", { name: "Reservation account", exact: true })
    .selectOption(accountId);
  await main(page)
    .getByRole("textbox", { name: "Total reservation (PHP)", exact: true })
    .fill("0");
  await main(page)
    .getByRole("textbox", {
      name: "Reason for reservation change",
      exact: true,
    })
    .fill("Explicit release");
  const review = main(page).getByRole("button", {
    name: "Review reservation",
    exact: true,
  });
  await review.focus();
  await expect(review).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    main(page).getByRole("heading", {
      name: "Review reservation",
      exact: true,
    }),
  ).toBeFocused();
  await main(page)
    .getByRole("button", { name: "Confirm and record", exact: true })
    .click();
  await metric(page, "Currently reserved", "PHP 0.00");
  await audit(page, cpu);
  await cpu.detach();
});
