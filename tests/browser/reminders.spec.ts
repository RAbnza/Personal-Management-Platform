import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  test,
  createBrowserOwner,
  removeBrowserOwner,
  type BrowserOwner,
} from "./helpers/owner";
async function signIn(page: Page, owner: BrowserOwner) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  async function submit() {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  }
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

async function event(page: Page) {
  const today = (await (await page.request.get("/api/v1/dashboard")).json())
    .today;
  const response = await page.request.post("/api/v1/personal-events", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      title: "Reminder browser source",
      temporalKind: "date",
      eventDate: "2026-01-01",
    },
  });
  expect(response.status()).toBe(201);
  return { ...(await response.json()), today };
}
test("in-app attention finds older overdue sources and supports reviewed dismissal, snooze and source navigation on mobile", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const e = await event(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  await expect(
    page.getByText("1 source with due in-app reminders"),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: /Reminder browser source.*2026-01-01/,
      exact: true,
    })
    .click();
  await expect(page.getByText(/Due reminder/)).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm reminder change" }),
  ).toBeVisible();
  const view = await (
    await page.request.get(
      `/api/v1/reminders?sourceKind=personal_event&sourceId=${e.eventId}`,
    )
  ).json();
  expect(view.rules[0].state).toBe("active");
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(page.getByText(/Reminder change saved/)).toBeVisible();
  await expect(page.getByText(/^Dismissed ?/)).toBeVisible();
  const source = await (
    await page.request.get(
      `/api/v1/agenda?startDate=2026-01-01&endDate=2026-01-02`,
    )
  ).json();
  expect(source.items[0].status).toBe("scheduled");
  expect(source.items[0].reminder.label).toBe("Reminder dismissed");
  await page
    .getByRole("button", { name: "Restore reminder", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(page.getByText(/Due reminder/)).toBeVisible();
  const tomorrow = new Date(`${e.today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
  await page
    .getByLabel("Snooze until (Asia/Manila)")
    .fill(`${tomorrow.toISOString().slice(0, 10)}T10:00`);
  await page
    .getByRole("button", { name: "Snooze reminder", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(page.getByText(/Next display:/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/reminders-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Open source", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reminder browser source", exact: true }),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByText("No in-app reminders due")).toBeVisible();
});
test("reminder stale previews require reload; changed source cancels old generation and module hiding preserves acknowledgement", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const e = await event(page);
  await page.goto(`/calendar/reminders/personal_event/${e.eventId}`);
  await page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  const changed = await page.request.patch(
    `/api/v1/personal-events/${e.eventId}`,
    {
      headers: { origin: "http://localhost:3100" },
      data: {
        clientCommandId: randomUUID(),
        expectedEventVersion: 1,
        action: "edit",
        title: "Reminder browser source",
        temporalKind: "date",
        eventDate: "2026-01-02",
      },
    },
  );
  expect(changed.status()).toBe(200);
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed" }),
  ).toContainText("changed");
  await expect(
    page.getByRole("button", { name: "Dismiss reminder" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload reminder state" }).click();
  await expect(page.getByText("2026-01-02", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(page.getByText(/^Dismissed ?/)).toBeVisible();
  const hide = await page.request.patch("/api/v1/module-preferences/time", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      expectedVersion: 0,
      enabled: false,
      agendaVisible: true,
      remindersEnabled: true,
    },
  });
  expect(hide.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText(/Module hidden; reminder preferences are separate/),
  ).toBeVisible();
  await expect(page.getByText(/^Dismissed ?/)).toBeVisible();
  const restored = await page.request.patch("/api/v1/module-preferences/time", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      expectedVersion: 1,
      enabled: true,
      agendaVisible: true,
      remindersEnabled: true,
    },
  });
  expect(restored.status()).toBe(200);
  await page.reload();
  await expect(page.getByText(/^Dismissed/)).toBeVisible();
  const cancelled = await page.request.patch(
    `/api/v1/personal-events/${e.eventId}`,
    {
      headers: { origin: "http://localhost:3100" },
      data: {
        clientCommandId: randomUUID(),
        expectedEventVersion: 2,
        action: "cancel",
      },
    },
  );
  expect(cancelled.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText(/resolved, cancelled, replaced or archived/),
  ).toBeVisible();
});
test("uncertain reminder save retries the same committed command; foreign owners cannot read its source", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const e = await event(page);
  await page.goto(`/calendar/reminders/personal_event/${e.eventId}`);
  const bodies: string[] = [];
  let lost = true;
  await page.route("**/api/v1/reminders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData()!);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (lost) {
      lost = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm reminder change" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "uncertain" }),
  ).toContainText("uncertain");
  await page
    .getByRole("button", { name: "Retry same reminder command" })
    .click();
  await expect(page.getByText(/^Dismissed ?/)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  const other = await createBrowserOwner();
  const context = await browser.newContext();
  try {
    const another = await context.newPage();
    await signIn(another, other);
    expect(
      (
        await another.request.get(
          `/api/v1/reminders?sourceKind=personal_event&sourceId=${e.eventId}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
});
