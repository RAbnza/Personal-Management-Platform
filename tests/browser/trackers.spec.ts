import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { settleAppearance } from "./helpers/settle-appearance";
import { presets } from "@/modules/trackers/domain/presets";
const headers = { origin: "http://localhost:3100" };
test("tracker deadlines, recorded reports, CSV and private replacement work on mobile in both themes", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  await page
    .getByRole("link", { name: "Trackers", exact: true })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Preset", exact: true })
    .selectOption("learning");
  await page
    .getByLabel("Tracker name", { exact: true })
    .fill("Browser learning");
  await page.getByRole("button", { name: "Create private tracker" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser learning", exact: true }),
  ).toBeVisible();
  const trackerId = page.url().split("/").pop()!;
  const today = (await (await page.request.get("/api/v1/dashboard")).json())
    .today;
  await page
    .getByRole("textbox", { name: "Topic (required)", exact: true })
    .fill("=Private study");
  await page.getByLabel("Deadline", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page).toHaveURL(/trackers\/entries\//);
  const entryUrl = page.url();
  await page.goto(
    `/calendar?startDate=${today}&endDate=${today}&source=trackers`,
  );
  await expect(
    page.getByRole("link", { name: /=Private study/ }).first(),
  ).toBeVisible();
  await page
    .locator(`a[href="${new URL(entryUrl).pathname}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(entryUrl);
  await page
    .getByRole("combobox", { name: "Status (required)", exact: true })
    .selectOption("completed");
  await page
    .getByLabel("Reason for this revision")
    .fill("Completed in browser");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(
    page.getByText("Completed in browser", { exact: true }),
  ).toBeVisible();
  await page.goto(`/trackers/reports?trackerId=${trackerId}&period=year`);
  await expect(
    page.getByRole("heading", { name: "Tracker reports and statistics" }),
  ).toBeVisible();
  const csv = await page.request.get(
    `/api/v1/trackers/reports?trackerId=${trackerId}&period=year&format=csv`,
  );
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("activity_completed");
  expect(await csv.text()).toContain("'=Private study");
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expect(nav.getByLabel("Theme", { exact: true })).toBeEnabled();
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await settleAppearance(page, theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `out/v3-reports-mobile-${theme}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("combobox", { name: "Period", exact: true }).focus();
  await page.keyboard.press("m");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Custom start", { exact: true })).toBeFocused();
  await page.goto("/settings/portability");
  await page
    .getByRole("button", { name: "Prepare private workspace export" })
    .click();
  const href = await page
    .getByRole("link", { name: /Download private bundle/ })
    .getAttribute("href");
  const bundle = await (await page.request.get(href!)).json();
  expect(
    bundle.entities.filter((e: { kind: string }) =>
      e.kind.startsWith("tracker."),
    ),
  ).toHaveLength(9);
  await page
    .getByText("Preview replacement from a bundle", { exact: true })
    .click();
  await page.getByLabel("Workspace JSON bundle").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page
    .getByRole("button", { name: "Validate restoration preview" })
    .click();
  await page
    .getByLabel("Type replace-private-workspace to approve this exact preview")
    .fill("replace-private-workspace");
  await page
    .getByRole("button", { name: "Replace after verified preview" })
    .click();
  await expect(page.getByRole("status")).toContainText("Workspace replaced.");
  await page.goto(entryUrl);
  await expect(
    page.getByRole("textbox", { name: "Topic (required)", exact: true }),
  ).toHaveValue("=Private study");
});
test("custom version review, migration confirmation and source-linked history remain usable", async ({
  page,
  owner,
}) => {
  test.setTimeout(120000);
  await signIn(page, owner);
  await page.goto("/trackers/templates/new");
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Browser custom");
  await page
    .getByLabel("Reason for publishing", { exact: true })
    .fill("Custom template acceptance");
  await page
    .getByRole("button", { name: "Review version", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish reviewed version", exact: true })
    .click();
  await expect(page).toHaveURL(/trackers\/templates\/[a-f0-9-]+$/);
  await page
    .getByLabel("New tracker name", { exact: true })
    .fill("Custom records");
  await page
    .getByRole("button", { name: "Create tracker from this version" })
    .click();
  await page.getByLabel("Title (required)").fill("Custom entry");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page).toHaveURL(/trackers\/entries\//);
  // Publish an additional compatible preset version through its authenticated contract;
  // the migration review and confirmation remain browser interactions.
  const command = async (body: Record<string, unknown>) => {
    const r = await page.request.post("/api/v1/trackers", {
      headers,
      data: { clientCommandId: randomUUID(), ...body },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const p = await command({
    operation: "preset",
    preset: "tasks",
    name: "Migration browser",
  });
  await command({
    operation: "save_entry",
    trackerId: p.trackerId,
    entryId: null,
    expectedRevisionId: null,
    values: { title: "Migrate once" },
    reason: "Synthetic",
  });
  const definition = structuredClone(presets.tasks);
  definition.fields[0]!.label = "Task name";
  await command({
    operation: "publish",
    templateId: p.templateId,
    expectedVersionId: p.versionId,
    definition,
    reason: "Rename stable title",
  });
  await page.goto(`/trackers/${p.trackerId}`);
  await page.getByRole("button", { name: "Prepare migration preview" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm reviewed migration" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /I reviewed the source/ }).check();
  await page
    .getByRole("button", { name: "Confirm reviewed migration" })
    .click();
  await page
    .getByRole("button", {
      name: "Process next batch (up to 50 entries)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "State: completed" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("tracker navigation hiding retains records and separate deadline preferences", async ({
  page,
  owner,
}) => {
  await signIn(page, owner);
  const p = await (
    await page.request.post("/api/v1/trackers", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        operation: "preset",
        preset: "books",
        name: "Retained hidden records",
      },
    })
  ).json();
  const entry = await (
    await page.request.post("/api/v1/trackers", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        operation: "save_entry",
        trackerId: p.trackerId,
        entryId: null,
        expectedRevisionId: null,
        values: { title: "Retain after hiding" },
        reason: "Synthetic",
      },
    })
  ).json();
  await page.goto("/settings");
  const settings = page.getByRole("group", { name: "Trackers", exact: true });
  await settings
    .getByRole("checkbox", { name: "Show module in normal access" })
    .uncheck();
  await settings
    .getByRole("button", { name: "Save Trackers preferences" })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Trackers", exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByRole("checkbox", { name: "Show source deadlines in Agenda" }),
  ).toBeChecked();
  await page.goto(`/trackers/entries/${entry.entryId}`);
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Retain after hiding",
  );
  await page.goto("/settings");
  await settings
    .getByRole("checkbox", { name: "Show module in normal access" })
    .check();
  await settings
    .getByRole("button", { name: "Save Trackers preferences" })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Trackers", exact: true }),
  ).toBeVisible();
});
