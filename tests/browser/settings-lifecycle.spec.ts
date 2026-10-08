import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  test,
  createBrowserOwner,
  removeBrowserOwner,
  type BrowserOwner,
} from "./helpers/owner";
const origin = { origin: "http://localhost:3100" };
test("account switching clears private rendered state in other tabs", async ({
  page,
  owner,
  context,
}) => {
  const other = await createBrowserOwner();
  const switchTab = await context.newPage();
  try {
    await signIn(page, owner);
    const created = await page.request.post("/api/v1/personal-events", {
      headers: origin,
      data: {
        clientCommandId: randomUUID(),
        title: "Prior account private event",
        temporalKind: "date",
        eventDate: "2026-10-20",
      },
    });
    expect(created.status()).toBe(201);
    const { eventId } = await created.json();
    await page.goto(`/calendar/events/${eventId}`);
    await expect(
      page.getByRole("heading", {
        name: "Prior account private event",
        exact: true,
      }),
    ).toBeVisible();
    await signIn(switchTab, other);
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(
      page.getByText("Prior account private event", { exact: true }),
    ).not.toBeVisible();
    const agenda = await page.request.get(
      "/api/v1/agenda?startDate=2026-10-01&endDate=2026-10-31",
    );
    expect(agenda.status()).toBe(200);
    expect(await agenda.text()).not.toContain("Prior account private event");
    await page.goto(`/calendar/events/${eventId}`);
    await expect(
      page.getByRole("heading", {
        name: "Prior account private event",
        exact: true,
      }),
    ).not.toBeVisible();
  } finally {
    await switchTab.close();
    await removeBrowserOwner(other);
  }
});
async function signIn(page: Page, owner: BrowserOwner, pending = false) {
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
    expect(seconds).toBeLessThanOrEqual(10);
    await page.waitForTimeout(seconds * 1000 + 250);
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: pending ? "Workspace deletion is pending" : "Dashboard",
      exact: true,
    }),
  ).toBeVisible();
}
test("Settings retains hidden module history, restores access and replays Help on mobile", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const created = await page.request.post("/api/v1/applications", {
    headers: origin,
    data: {
      clientCommandId: randomUUID(),
      companyName: "Settings fixture company",
      roleTitle: "Retained application",
      initialStageEffectiveDate: today,
    },
  });
  expect(created.status()).toBe(201);
  const { applicationId } = await created.json();
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Settings owner");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Saved. Current settings are being refreshed."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Settings owner");
  const career = page.getByRole("group", { name: "Career", exact: true });
  await career.getByLabel("Show module in normal access").uncheck();
  await career.getByRole("button", { name: "Save Career preferences" }).click();
  await expect(
    career.getByText("Saved. Current settings are being refreshed."),
  ).toBeVisible();
  await page.reload();
  await expect(
    career.getByLabel("Show module in normal access"),
  ).not.toBeChecked();
  await expect(
    career.getByLabel("Show source deadlines in Agenda"),
  ).toBeChecked();
  expect(
    (await page.request.get(`/api/v1/applications/${applicationId}`)).status(),
  ).toBe(200);
  await career.getByLabel("Show module in normal access").check();
  await career.getByRole("button", { name: "Save Career preferences" }).click();
  await expect(
    career.getByText("Saved. Current settings are being refreshed."),
  ).toBeVisible();
  await page.reload();
  await expect(career.getByLabel("Show module in normal access")).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/help");
  await page.getByRole("button", { name: "Start tour" }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Finish tour" }).click();
  await page.getByRole("button", { name: "Start tour" }).click();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await page.goto("/help/support");
  await page.getByLabel("Topic").fill("Settings feedback");
  await page.getByLabel("Details").fill("Test-only draft; no private records.");
  await expect(
    page.getByRole("button", { name: "Copy feedback draft" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/settings-help-mobile.png",
    fullPage: true,
  });
});
test("session review isolates owners and individual/all revocation takes effect on the next request", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const second = await browser.newContext(),
    foreignContext = await browser.newContext();
  const foreign = await createBrowserOwner();
  try {
    const p = await second.newPage();
    await signIn(p, owner);
    const q = await foreignContext.newPage();
    await signIn(q, foreign);
    const foreignSessions = (
      await (await q.request.get("/api/v1/sessions")).json()
    ).sessions;
    const own = (await (await page.request.get("/api/v1/sessions")).json())
      .sessions;
    expect(own).toHaveLength(2);
    expect(JSON.stringify(own)).not.toMatch(/token|ipAddress|userAgent/);
    expect(
      own.some((s: { id: string }) => s.id === foreignSessions[0].id),
    ).toBe(false);
    expect(
      (
        await page.request.post("/api/v1/sessions", {
          headers: origin,
          data: { kind: "one", sessionId: foreignSessions[0].id },
        })
      ).status(),
    ).toBe(404);
    expect((await q.request.get("/api/v1/dashboard")).status()).toBe(200);
    const other = own.find((s: { current: boolean }) => !s.current);
    expect(
      (
        await page.request.post("/api/v1/sessions", {
          headers: origin,
          data: { kind: "one", sessionId: other.id },
        })
      ).status(),
    ).toBe(200);
    expect((await p.request.get("/api/v1/dashboard")).status()).toBe(401);
    expect((await page.request.get("/api/v1/dashboard")).status()).toBe(200);
    await page.goto("/settings/sessions");
    await expect(page.getByText(/Current session/)).toBeVisible();
    await page.getByRole("button", { name: "Sign out all devices" }).click();
    await page.getByRole("button", { name: "Confirm revocation" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    expect((await page.request.get("/api/v1/dashboard")).status()).toBe(401);
  } finally {
    await second.close();
    await foreignContext.close();
    await removeBrowserOwner(foreign);
  }
});
test("deletion requires exact scope and recent proof, blocks access, revokes sessions and cancels through limited lifecycle access", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const response = await page.request.post("/api/v1/personal-events", {
    headers: origin,
    data: {
      clientCommandId: randomUUID(),
      title: "Lifecycle retained event",
      temporalKind: "date",
      eventDate: "2026-10-20",
    },
  });
  expect(response.status()).toBe(201);
  const { eventId } = await response.json();
  const preview = await (
    await page.request.get("/api/v1/lifecycle/preview")
  ).json();
  const body = {
    clientCommandId: randomUUID(),
    expectedSnapshot: preview.snapshot,
    confirmation: "DELETE MY WORKSPACE AND ACCOUNT",
  };
  expect(
    (
      await page.request.post("/api/v1/lifecycle", {
        headers: origin,
        data: body,
      })
    ).status(),
  ).toBe(403);
  await page.goto("/settings/lifecycle");
  await page.getByRole("button", { name: "Review deletion scope" }).click();
  await page.getByLabel(/I reviewed the entire scope/).check();
  await page
    .getByLabel("Type DELETE MY WORKSPACE AND ACCOUNT")
    .fill("DELETE MY WORKSPACE AND ACCOUNT");
  await page.getByLabel("Current password").fill(owner.password);
  await page.getByRole("button", { name: "Verify password" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm whole-workspace deletion" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm whole-workspace deletion" })
    .click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  expect((await page.request.get("/api/v1/agenda")).status()).toBe(401);
  await signIn(page, owner, true);
  expect((await page.request.get("/api/v1/dashboard")).status()).toBe(409);
  await page.goto("/settings/lifecycle");
  await expect(
    page.getByRole("heading", { name: "Deletion status: pending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm cancellation" }),
  ).toBeDisabled();
  await page.getByLabel("Current password").fill(owner.password);
  await page.getByRole("button", { name: "Verify password" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm cancellation" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto(`/calendar/events/${eventId}`);
  await expect(
    page.getByRole("heading", {
      name: "Lifecycle retained event",
      exact: true,
    }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/dashboard")).status()).toBe(200);
});
test("password recovery consumes its one-time link and revokes every prior session", async ({
  page,
  owner,
  browser,
}) => {
  await signIn(page, owner);
  const second = await browser.newContext();
  try {
    const p = await second.newPage();
    await signIn(p, owner);
    await page.goto("/auth/forgot-password");
    await page.getByLabel("Email address").fill(owner.email);
    await page.getByRole("button", { name: "Send reset instructions" }).click();
    await expect(page.getByText(/If an account matches/)).toBeVisible();
    const api = process.env.MAILPIT_API_URL;
    if (!api || process.env.EMAIL_PROVIDER !== "mailpit")
      throw new Error(
        "Recovery browser test requires the local Mailpit test transport",
      );
    // Fetch only this unique synthetic fixture's mail. Bearer links remain in
    // test memory and never enter repository logs or public provider delivery.
    const result = await page.request.get(
      `${api}/api/v1/search?query=${encodeURIComponent("to:" + owner.email)}`,
    );
    expect(result.status()).toBe(200);
    const messages = (await result.json()).messages;
    const mail = messages.find(
      (m: { Subject: string }) => m.Subject === "Reset your password",
    );
    expect(mail).toBeTruthy();
    const full = await (
      await page.request.get(`${api}/api/v1/message/${mail.ID}`)
    ).json();
    const link = full.Text.match(
      /http:\/\/localhost:3100\/auth\/reset-password#[^\s]+/,
    )[0];
    await page.goto(link);
    await expect(page).not.toHaveURL(/token=/);
    const password = `New-test-${randomUUID()}!`;
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm new password").fill(password);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByRole("heading", { name: /Password updated/ }),
    ).toBeVisible();
    expect((await page.request.get("/api/v1/dashboard")).status()).toBe(401);
    expect((await p.request.get("/api/v1/dashboard")).status()).toBe(401);
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page.getByLabel("Confirm new password").fill(password);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByRole("heading", { name: /Reset link unavailable/i }),
    ).toBeVisible();
    await signIn(page, { ...owner, password });
  } finally {
    await second.close();
  }
});
