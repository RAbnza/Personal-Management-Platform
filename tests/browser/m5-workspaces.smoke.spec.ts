import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { test, type BrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
import { reserveAttachment } from "@/modules/files/services/attachments";

const headers = { origin: "http://localhost:3100" };
test("mapped CSV, exact analytics, forecast and source-file browser retain their contracts", async ({
  page,
  owner,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, owner);
  const { today } = await (await page.request.get("/api/v1/dashboard")).json();
  const accountResponse = await page.request.post("/api/v1/accounts", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name: "M5 synthetic wallet",
      accountType: "cash",
      openingCutoffDate: addCalendarDays(today, -1),
      openingBalanceMinor: "100000",
    },
  });
  expect(accountResponse.status()).toBe(201);
  const account = await accountResponse.json();
  await page.goto("/settings/portability");
  await page
    .getByLabel("UTF-8 cash CSV", { exact: true })
    .setInputFiles({
      name: "mapped-cash.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `When,Type,Centavos,Class,Memo,Ref\n${today},expense,1001,expense,M5 reviewed purchase,m5-import\n`,
      ),
    });
  await page
    .getByRole("button", { name: "Continue to column mapping" })
    .click();
  for (const [field, column] of Object.entries({
    date: "When",
    kind: "Type",
    amountMinor: "Centavos",
    classification: "Class",
    description: "Memo",
    reference: "Ref",
  }))
    await page
      .getByLabel(`CSV column for ${field}`, { exact: true })
      .selectOption(column);
  await page
    .getByLabel("Owned financial account")
    .selectOption(account.accountId);
  await page
    .getByRole("combobox", { name: "Date interpretation", exact: true })
    .selectOption("YYYY-MM-DD");
  await page.getByRole("button", { name: "Create reviewed preview" }).click();
  await expect(page.getByText(/Batch: previewed/)).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Import row evidence" }),
  ).toContainText("1001");
  await page.getByLabel(/I acknowledge any negative-balance effects/).check();
  await page.getByRole("button", { name: "Confirm exact preview" }).click();
  await page.getByRole("button", { name: "Process next safe chunk" }).click();
  await expect(page.getByText(/Batch: completed/)).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Import rows posted or skipped" }),
  ).toHaveAttribute("value", "1");
  await page
    .getByRole("button", { name: "Export and replace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prepare private workspace export" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import cash CSV", exact: true })
    .click();
  await expect(page.getByText(/Batch: completed/)).toBeVisible();
  await page.goto(
    `/reports/financial?period=custom&startDate=${today}&endDate=${today}`,
  );
  const series = page.getByRole("group", { name: "Visible daily metrics" });
  await series.getByRole("button", { name: "Income", exact: true }).click();
  await expect(
    series.getByRole("button", { name: "Income", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Exact metrics", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Net recognized spending: PHP 10.01; view contributions",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/money/forecasts");
  await expect(
    page.getByRole("region", { name: "Cash projection chart" }),
  ).toBeVisible();
  await page.getByText("Optional what-if adjustments", { exact: true }).click();
  await page
    .getByRole("button", { name: "Add adjustment", exact: true })
    .click();
  await page.getByLabel("Adjustment 1 label").fill("Synthetic projection only");
  await page.getByLabel("Adjustment 1 amount (PHP)").fill("10.00");
  await page
    .getByRole("button", { name: "Calculate forecast", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projected cash breakdown" }),
  ).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Cash projection chart" }),
  ).toContainText("-PHP 10.00");
  // Seed reserved metadata through the existing isolated-test seam. No object
  // storage or scanner is configured here; this verifies browsing and gating.
  await reserveAttachment(
    { userId: owner.userId, workspaceId: owner.workspaceId },
    {
      clientCommandId: randomUUID(),
      sourceKind: "financial_action",
      sourceId: account.openingActionId,
      originalFilename: "m5-synthetic-receipt.pdf",
      declaredMime: "application/pdf",
      declaredBytes: 128,
    },
    false,
  );
  const catalog = await (
    await page.request.get(
      "/api/v1/files?catalog=true&sourceKind=financial_action",
    )
  ).json();
  const source = catalog.sources.find(
    (r: { id: string }) => r.id === account.openingActionId,
  );
  await page.goto("/settings/files");
  await page.getByRole("button", { name: source.label, exact: true }).click();
  await expect(
    page.getByText("m5-synthetic-receipt.pdf", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/128 bytes declared/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download verified evidence" }),
  ).toHaveCount(0);
  await page.getByLabel("Find file on this page").fill("no match");
  await expect(
    page.getByText("m5-synthetic-receipt.pdf", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of [
    "/settings/files",
    "/settings/notifications",
    "/settings/portability",
    "/trackers/reports",
    "/reports/career",
    "/money/forecasts",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

// Scoped teardown for this test's group, following the existing sharing fixture contract.
async function removeGroup(owner: BrowserOwner, groupId: string) {
  if (
    !owner.email.startsWith("dashboard-browser-") ||
    !owner.email.endsWith("@example.test")
  )
    throw Error("Synthetic owner required");
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  url.pathname = "/personal_management_test";
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    expect((await c.query("SELECT current_database() n")).rows[0].n).toBe(
      "personal_management_test",
    );
    const root = await c.query(
      "SELECT id FROM sharing.expense_group WHERE id=$1 AND created_by_user_id=$2 AND name='M5 synthetic group'",
      [groupId, owner.userId],
    );
    if (!root.rowCount) return;
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role='replica'");
    const tables = await c.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema='sharing' AND column_name='group_id'",
    );
    for (const { table_name } of tables.rows) {
      if (!/^[a-z_]+$/.test(table_name)) throw Error("Unexpected table");
      await c.query(`DELETE FROM sharing."${table_name}" WHERE group_id=$1`, [
        groupId,
      ]);
    }
    await c.query("DELETE FROM audit.group_revision WHERE group_id=$1", [
      groupId,
    ]);
    await c.query("DELETE FROM sharing.expense_group WHERE id=$1", [groupId]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}
test("group views and participant split cards save exact rounded bill shares", async ({
  page,
  owner,
}) => {
  test.setTimeout(180_000);
  const groupId = randomUUID();
  try {
    await signIn(page, owner);
    expect(
      (
        await page.request.post("/api/auth/reauthenticate", {
          headers,
          data: { password: owner.password },
        })
      ).status(),
    ).toBe(200);
    const { today } = await (
      await page.request.get("/api/v1/dashboard")
    ).json();
    expect(
      (
        await page.request.post("/api/v1/sharing", {
          headers,
          data: {
            kind: "create",
            clientCommandId: randomUUID(),
            groupId,
            name: "M5 synthetic group",
            displayName: "You",
          },
        })
      ).status(),
    ).toBe(200);
    for (const displayName of ["First friend", "Second friend"]) {
      const current = await (
        await page.request.get(`/api/v1/sharing?groupId=${groupId}`)
      ).json();
      expect(
        (
          await page.request.post("/api/v1/sharing", {
            headers,
            data: {
              kind: "manual",
              groupId,
              expectedVersion: current.group.version,
              clientCommandId: randomUUID(),
              displayName,
            },
          })
        ).status(),
      ).toBe(200);
    }
    await page.goto(`/sharing/${groupId}/expenses/new`);
    await page
      .getByLabel("Description", { exact: true })
      .fill("M5 split dinner");
    await page.getByLabel("Expense date").fill(today);
    await page.getByLabel("Total bill (PHP)").fill("100.00");
    await expect(
      page.getByRole("button", { name: "You", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", { name: "Bill preview" }),
    ).toContainText("PHP 33.34");
    await page
      .getByRole("button", { name: "Save reviewed expense", exact: true })
      .click();
    await expect(page).toHaveURL(/\/expenses\/[a-f0-9-]{36}$/);
    await page.goto(`/sharing/${groupId}`);
    await page.getByRole("button", { name: "Bills", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "M5 split dinner", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Payments \(0 pending\)/ }).click();
    await expect(
      page.getByText("Pairwise balances and explanations", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "People and balances", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "First friend", exact: true }),
    ).toBeVisible();
  } finally {
    await removeGroup(owner, groupId);
  }
});
