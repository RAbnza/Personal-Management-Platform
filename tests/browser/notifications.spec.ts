import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
test("notification consent is explicit, private, replay-safe and independent of security mail", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  await page.goto("/settings");
  await page
    .getByRole("link", { name: "Manage optional reminder email" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /I opt in/ }),
  ).not.toBeChecked();
  await expect(
    page.getByText(
      /Required authentication and security mail remains independent/,
    ),
  ).toBeVisible();
  const bodies: string[] = [];
  let drop = true;
  await page.route("**/api/v1/settings/notifications", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    bodies.push(route.request().postData()!);
    if (drop) {
      drop = false;
      await route.fetch();
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole("checkbox", { name: /I opt in/ }).check();
  await page.getByText("Quiet hours and content", { exact: true }).click();
  await page.getByLabel("Quiet hours start").fill("22:00");
  await page.getByLabel("Quiet hours end").fill("07:00");
  await page
    .getByRole("button", { name: "Save notification preferences" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry identical save" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry identical save" }).click();
  await expect(page.getByRole("checkbox", { name: /I opt in/ })).toBeEnabled();
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  const read = await page.request.get("/api/v1/settings/notifications");
  expect(read.status()).toBe(200);
  expect(read.headers()["cache-control"]).toBe("no-store");
  expect((await read.json()).preferences).toMatchObject({
    enabled: true,
    version: 1,
  });
  const today = String(
    (await (await page.request.get("/api/v1/dashboard")).json()).today,
  );
  const event = await page.request.post("/api/v1/personal-events", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      title: "Browser private notification source",
      temporalKind: "date",
      eventDate: addCalendarDays(today, 1),
    },
  });
  expect(event.status()).toBe(201);
  const { eventId } = await event.json();
  await expect
    .poll(
      async () => {
        const data = await (
          await page.request.get("/api/v1/settings/notifications")
        ).json();
        return data.deliveries.some(
          (d: { source_id: string; status: string }) =>
            d.source_id === eventId && d.status === "scheduled",
        );
      },
      { timeout: 90000 },
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Calendar event reminder evidence" }),
  ).toHaveAttribute("href", `/calendar/reminders/personal_event/${eventId}`);
  await page.getByRole("checkbox", { name: /I opt in/ }).uncheck();
  await page
    .getByRole("button", { name: "Save notification preferences" })
    .click();
  await expect(page.getByRole("checkbox", { name: /I opt in/ })).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: /I opt in/ }),
  ).not.toBeChecked();
  const cancelled = await (
    await page.request.get("/api/v1/settings/notifications")
  ).json();
  expect(
    cancelled.deliveries.find(
      (d: { source_id: string }) => d.source_id === eventId,
    ).status,
  ).toBe("cancelled");
  const spoof = await page.request.patch("/api/v1/settings/notifications", {
    headers: { origin: "http://localhost:3100" },
    data: {
      clientCommandId: randomUUID(),
      expectedVersion: 2,
      workspaceId: randomUUID(),
      preferences: {
        enabled: true,
        timezone: null,
        quietStart: null,
        quietEnd: null,
        includeDueDate: false,
      },
    },
  });
  expect(spoof.status()).toBe(422);
  expect(
    (
      await page.request.patch("/api/v1/settings/notifications", {
        headers: { origin: "https://other.example.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const guest = await page.context().browser()!.newContext();
  try {
    expect(
      (
        await guest.request.get(
          "http://localhost:3100/api/v1/settings/notifications",
        )
      ).status(),
    ).toBe(401);
  } finally {
    await guest.close();
  }
});
test("notification settings support keyboard, narrow reflow and accessible themes", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/settings/notifications");
  await expect(
    page.getByRole("button", { name: "Save notification preferences" }),
  ).toBeEnabled();
  await page.getByText("Quiet hours and content", { exact: true }).focus();
  await expect(
    page.getByText("Quiet hours and content", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Quiet hours start")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  for (const theme of ["light", "dark"]) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
        .every((a) => a.playState === "finished"),
    );
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `out/g-notifications-${theme}.png`,
      fullPage: true,
    });
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await cpu.detach();
});
