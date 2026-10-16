import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "pg";
import {
  test,
  createBrowserOwner,
  removeBrowserOwner,
  type BrowserOwner,
} from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { closeRuntimeDatabasePools } from "@/platform/db/pools";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" };
async function reauthenticate(page: Page, owner: BrowserOwner) {
  expect(
    (
      await page.request.post("/api/auth/reauthenticate", {
        headers,
        data: { password: owner.password },
      })
    ).status(),
  ).toBe(200);
}
async function group(page: Page, id: string) {
  const r = await page.request.get(`/api/v1/sharing?groupId=${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function command(page: Page, id: string, body: Record<string, unknown>) {
  const current = await group(page, id),
    r = await page.request.post("/api/v1/sharing", {
      headers,
      data: {
        groupId: id,
        expectedVersion: current.group.version,
        clientCommandId: randomUUID(),
        ...body,
      },
    });
  expect(r.status()).toBe(200);
  return r.json();
}
async function wallet(page: Page, today: string, name: string) {
  const r = await page.request.post("/api/v1/accounts", {
    headers,
    data: {
      clientCommandId: randomUUID(),
      name,
      accountType: "cash",
      openingCutoffDate: addCalendarDays(today, -1),
      openingBalanceMinor: "100000",
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
/** Named synthetic teardown only. Production deletion is verified independently
 * through lifecycle_operator; no acceptance assertion disables financial guards. */
async function removeGroups(owner: BrowserOwner) {
  const u = new URL(process.env.TEST_DATABASE_ADMIN_URL!);
  u.pathname = "/personal_management_test";
  if (
    !owner.email.startsWith("dashboard-browser-") ||
    !owner.email.endsWith("@example.test")
  )
    throw Error("Synthetic owner required");
  const c = new Client({ connectionString: u.toString() });
  await c.connect();
  try {
    expect((await c.query("SELECT current_database() n")).rows[0].n).toBe(
      "personal_management_test",
    );
    expect(
      (
        await c.query(
          'SELECT 1 FROM auth."user" u JOIN core.workspace w ON w.owner_user_id=u.id WHERE u.id=$1 AND u.email=$2 AND w.id=$3',
          [owner.userId, owner.email, owner.workspaceId],
        )
      ).rowCount,
    ).toBe(1);
    const groups = (
      await c.query(
        "SELECT id FROM sharing.expense_group WHERE created_by_user_id=$1 AND name LIKE 'I browser shared%'",
        [owner.userId],
      )
    ).rows;
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role='replica'");
    for (const g of groups) {
      await c.query(
        "DELETE FROM finance.private_group_review WHERE link_id IN(SELECT id FROM finance.private_group_link WHERE group_id=$1)",
        [g.id],
      );
      for (const table of [
        "private_group_link_revision",
        "private_group_link",
        "group_ledger_binding",
      ])
        await c.query(`DELETE FROM finance.${table} WHERE group_id=$1`, [g.id]);
      const tables = (
        await c.query(
          "SELECT table_name FROM information_schema.columns WHERE table_schema='sharing' AND column_name='group_id'",
        )
      ).rows;
      for (const { table_name } of tables) {
        if (!/^[a-z_]+$/.test(table_name))
          throw Error("Unexpected shared table");
        await c.query(`DELETE FROM sharing."${table_name}" WHERE group_id=$1`, [
          g.id,
        ]);
      }
      await c.query("DELETE FROM audit.group_revision WHERE group_id=$1", [
        g.id,
      ]);
      await c.query("DELETE FROM sharing.expense_group WHERE id=$1", [g.id]);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}
test.afterAll(closeRuntimeDatabasePools);
test("shared entry, verified invitation, recipient confirmation, private clearing, Calendar follow-up and cross-user privacy", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const a = await createBrowserOwner(),
    b = await createBrowserOwner(),
    foreign = await createBrowserOwner(),
    context = await browser.newContext(),
    other = await context.newPage(),
    foreignContext = await browser.newContext(),
    foreignPage = await foreignContext.newPage();
  try {
    await signIn(page, a);
    await reauthenticate(page, a);
    const today = (await (await page.request.get("/api/v1/dashboard")).json())
        .today,
      aa = await wallet(page, today, "Private payer wallet");
    await page.goto("/sharing");
    await page.getByText("Create a group", { exact: true }).click();
    await page
      .getByLabel("Group name", { exact: true })
      .fill("I browser shared registered");
    await page.getByLabel("Your name in this group").fill("Group payer");
    await page
      .getByRole("button", { name: "Create group", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sharing\/[a-f0-9-]{36}$/);
    const groupId = page.url().split("/").at(-1)!;
    const token = randomBytes(32).toString("hex");
    await command(page, groupId, { kind: "invite", email: b.email, token });
    await signIn(other, b);
    const bb = await wallet(other, today, "Private debtor wallet");
    await other.goto(`/sharing/invitations#token=${token}`);
    await other
      .getByRole("button", { name: "Review invitation and balance" })
      .click();
    await expect(
      other.getByRole("heading", { name: "I browser shared registered" }),
    ).toBeVisible();
    await other.getByLabel("Your group display name").fill("Group debtor");
    await other.getByLabel(/I consent to this history policy/).check();
    await other
      .getByRole("button", { name: "Accept invitation and history" })
      .click();
    await expect(other).toHaveURL(new RegExp(`/sharing/${groupId}$`));
    await page.goto(`/sharing/${groupId}/expenses/new`);
    await page
      .getByLabel("Description", { exact: true })
      .fill("Shared browser dinner");
    await page.getByLabel("Expense date").fill(today);
    await page.getByLabel("Total bill (PHP)").fill("100.00");
    await page.getByLabel("Also record my allocation privately").check();
    await page
      .getByLabel("Private funding or existing purchase")
      .selectOption(`cash:${aa.accountId}`);
    await page
      .getByLabel(/I approve this private accounting and the actual funding/)
      .check();
    await page.getByRole("button", { name: "Save reviewed expense" }).click();
    await expect(page).toHaveURL(/\/expenses\/[a-f0-9-]{36}$/);
    const expenseId = page.url().split("/").at(-1)!;
    await expect(
      page.getByText(
        "This allocation is already adopted into your private ledger.",
      ),
    ).toBeVisible();
    await other.goto(`/sharing/${groupId}/expenses/${expenseId}`);
    await other
      .getByLabel(/I approve the exact private accounting shown/)
      .check();
    await other
      .getByRole("button", { name: "Approve private adoption", exact: true })
      .click();
    await expect(
      other.getByText(
        "This allocation is already adopted into your private ledger.",
      ),
    ).toBeVisible();
    const shared = await group(other, groupId);
    expect(JSON.stringify(shared)).not.toContain(aa.accountId);
    expect(JSON.stringify(shared)).not.toContain("Private payer wallet");
    await other.goto(`/sharing/${groupId}`);
    await other
      .getByText("Report sending a settlement", { exact: true })
      .click();
    await other.getByLabel("Settlement scope").selectOption("custom");
    await other.getByLabel("Payment amount (PHP)").fill("25.00");
    await other.getByLabel("Payment date", { exact: true }).fill(today);
    await other.getByRole("button", { name: "Report payment sent" }).click();
    await expect(other.getByText(/Your confirmed net:/)).toContainText(
      "-PHP 50.00",
    );
    await expect(other.getByText(/Your confirmed net:/)).toContainText(
      "-PHP 25.00",
    );
    const pending = (await group(other, groupId)).ledger.settlements[0];
    expect(pending.state).toBe("pending");
    await other
      .getByText("Create your private Calendar follow-up", { exact: true })
      .click();
    await other
      .getByLabel("Your private review date")
      .fill(addCalendarDays(today, 2));
    await other
      .getByRole("button", { name: "Create private follow-up" })
      .click();
    await expect(other).toHaveURL(/\/calendar\/events\/[a-f0-9-]{36}$/);
    await expect(
      other.getByRole("heading", {
        name: "Review shared payment",
        exact: true,
      }),
    ).toBeVisible();
    await other.goto(`/sharing/${groupId}/effects/settlement/${pending.id}`);
    await other
      .getByLabel("Actual private funding or existing movement")
      .selectOption(`cash:${bb.accountId}`);
    await other.getByLabel(/I approve these exact amounts/).check();
    await other
      .getByRole("button", { name: "Approve private movement" })
      .click();
    await expect(other.getByText(/Current accepted source/)).toBeVisible();
    await page.goto(`/sharing/${groupId}`);
    await page.getByLabel("Settlement status").selectOption("incoming");
    await page.getByLabel("Transition reason").fill("Received actual transfer");
    await page
      .getByRole("button", { name: "Record settlement transition" })
      .click();
    await expect
      .poll(
        async () => (await group(page, groupId)).ledger.settlements[0].state,
      )
      .toBe("confirmed");
    const privateReport = async (p: Page) =>
      await (
        await p.request.get(
          `/api/v1/reports/financial?period=custom&startDate=${today}&endDate=${today}`,
        )
      ).json();
    expect((await privateReport(page)).metrics.closing_cash).toBe("90000");
    await page.goto(`/sharing/${groupId}/effects/settlement/${pending.id}`);
    await page
      .getByLabel("Actual private funding or existing movement")
      .selectOption(`cash:${aa.accountId}`);
    await page.getByLabel(/I approve these exact amounts/).check();
    await page
      .getByRole("button", { name: "Approve private movement" })
      .click();
    await expect(page.getByText(/Current accepted source/)).toBeVisible();
    await other.goto(`/sharing/${groupId}/effects/settlement/${pending.id}`);
    await expect(
      other.getByRole("button", { name: "Approve clearing review" }),
    ).toBeVisible();
    await other.getByLabel(/I approve these exact amounts/).check();
    await other
      .getByRole("button", { name: "Approve clearing review" })
      .click();
    await expect(other.getByText(/Current accepted source/)).toBeVisible();
    const ar = await privateReport(page),
      br = await privateReport(other);
    expect(ar.metrics.closing_cash).toBe("92500");
    expect(br.metrics.closing_cash).toBe("97500");
    expect(ar.metrics.gross).toBe("5000");
    expect(br.metrics.gross).toBe("5000");
    expect(br.sharing[0].clearingMinor).toBe("0");
    expect(br.sharing[0].payableMinor).toBe("-2500");
    const beforeCorrection = await group(page, groupId);
    const correction = await command(page, groupId, {
      kind: "bill",
      expenseId,
      expectedRevisionId: beforeCorrection.bills.find(
        (bill: { id: string }) => bill.id === expenseId,
      ).revisionId,
      reason: "Review an independently retained private share",
      bill: {
        description: "Shared browser dinner",
        expenseDate: today,
        totalMinor: "10000",
        splitMethod: "exact",
        contributions: [
          {
            participantId: beforeCorrection.group.participantId,
            amountMinor: "10000",
          },
        ],
        shares: [
          {
            participantId: beforeCorrection.group.participantId,
            amountMinor: "7000",
          },
          { participantId: shared.group.participantId, amountMinor: "3000" },
        ],
      },
    });
    await page.goto(`/sharing/${groupId}/expenses/${expenseId}`);
    await expect(
      page.getByText(/Needs private correction: group evidence changed/),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: "Your private adoption", exact: true })
        .locator("..")
        .locator('select[name="categoryId"]'),
    ).toHaveCount(1);
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page
        .getByRole("complementary")
        .getByLabel("Theme", { exact: true })
        .selectOption(theme);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.setViewportSize({ width: 320, height: 800 });
      await page
        .locator("details")
        .evaluateAll((nodes) =>
          nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)),
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `out/i-private-review-${theme}.png`,
        fullPage: true,
      });
    }
    const sourceBefore = await (
      await page.request.get(
        `/api/v1/sharing/adoption?groupId=${groupId}&expenseId=${expenseId}`,
      )
    ).json();
    await page
      .getByLabel("Reason for retaining private evidence")
      .fill("I retain my independently verified original private share");
    await page
      .getByLabel(/I reviewed this exact current source and choose/)
      .check();
    await page
      .getByRole("button", { name: "Record reviewed private difference" })
      .click();
    await expect(
      page.getByText(
        /Reviewed difference: you retained your prior private evidence/,
      ),
    ).toBeVisible();
    const sourceAfter = await (
      await page.request.get(
        `/api/v1/sharing/adoption?groupId=${groupId}&expenseId=${expenseId}`,
      )
    ).json();
    expect(sourceAfter.financialRevision).toBe(sourceBefore.financialRevision);
    expect(sourceAfter.needsPrivateCorrection).toBe(true);
    expect(sourceAfter.retainedAmounts.spendingMinor).toBe("5000");
    expect((await group(page, groupId)).group.version).toBe(correction.version);
    expect((await privateReport(page)).metrics).toEqual(ar.metrics);
    expect((await privateReport(other)).metrics).toEqual(br.metrics);
    const exported = await other.request.get(
      `/api/v1/sharing/export?groupId=${groupId}`,
    );
    expect(exported.status()).toBe(200);
    expect(exported.headers()["cache-control"]).toBe("no-store");
    expect(JSON.stringify(await exported.json())).not.toContain(aa.accountId);
    await signIn(foreignPage, foreign);
    expect(
      (
        await foreignPage.request.get(`/api/v1/sharing?groupId=${groupId}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreignPage.request.get(
          `/api/v1/sharing/effects?groupId=${groupId}&sourceKind=settlement&sourceId=${pending.id}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await foreignPage.request.get(
          `/api/v1/sharing/export?groupId=${groupId}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
    await foreignContext.close();
    await removeGroups(a);
    await removeBrowserOwner(a);
    await removeBrowserOwner(b);
    await removeBrowserOwner(foreign);
  }
});

test("multiple payers, exact partial allocations, manual confirmation and refund controls support keyboard, 320px and both themes", async ({
  page,
}) => {
  test.setTimeout(180000);
  const owner = await createBrowserOwner();
  try {
    await signIn(page, owner);
    await reauthenticate(page, owner);
    const today = (await (await page.request.get("/api/v1/dashboard")).json())
        .today,
      id = randomUUID();
    expect(
      (
        await page.request.post("/api/v1/sharing", {
          headers,
          data: {
            kind: "create",
            clientCommandId: randomUUID(),
            groupId: id,
            name: "I browser shared mobile",
            displayName: "You",
          },
        })
      ).status(),
    ).toBe(200);
    const first = await command(page, id, {
      kind: "manual",
      displayName: "Manual friend",
    });
    await command(page, id, {
      kind: "manual",
      displayName: "A long participant name " + "long ".repeat(22),
    });
    await page.goto(`/sharing/${id}/expenses/new`);
    await page
      .getByLabel("Description", { exact: true })
      .fill("Mobile multiple payer bill");
    await page.getByLabel("Expense date").fill(today);
    await page.getByLabel("Total bill (PHP)").fill("100.00");
    await page.getByLabel("Multiple payers").check();
    await page.getByLabel("You paid (PHP)").fill("20.00");
    await page.getByLabel("Manual friend paid (PHP)").fill("80.00");
    await expect(
      page.getByRole("region", { name: "Bill preview" }),
    ).toContainText("extra centavo");
    await page.getByRole("button", { name: "Save reviewed expense" }).click();
    await expect(page).toHaveURL(/\/expenses\/[a-f0-9-]{36}$/);
    const expenseId = page.url().split("/").at(-1)!;
    await page.goto(`/sharing/${id}`);
    const summary = page.getByText("Report sending a settlement", {
      exact: true,
    });
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press("Enter");
    await expect(summary.locator("..")).toHaveAttribute("open", "");
    await page
      .getByRole("combobox", { name: /^Recipient\b/ })
      .selectOption(first.subjectId);
    await page.getByLabel("Settlement scope").selectOption("selected");
    await page.getByLabel("Payment amount (PHP)").fill("5.00");
    await page
      .getByLabel(/Mobile multiple payer bill.*pay \(PHP\)/)
      .fill("5.00");
    await page.getByLabel("Payment date", { exact: true }).fill(today);
    await page.getByRole("button", { name: "Report payment sent" }).click();
    await expect(
      page.getByRole("combobox", { name: /^Transition\b/ }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: /^Transition\b/ })
      .selectOption("manual_confirm");
    await page
      .getByLabel("Transition reason")
      .fill("Owner recorded manual receipt");
    await page
      .getByLabel(/I acknowledge the recipient has no authenticated/)
      .check();
    await page
      .getByRole("button", { name: "Record settlement transition" })
      .click();
    await expect
      .poll(async () => (await group(page, id)).ledger.settlements[0].state)
      .toBe("confirmed");
    await page.goto(`/sharing/${id}/expenses/${expenseId}`);
    await page
      .getByText("Record shared refund allocations", { exact: true })
      .click();
    await page.getByLabel("Refund total (PHP)").fill("10.00");
    await page.getByLabel("Refund date", { exact: true }).fill(today);
    await page.getByLabel("Refund reason").fill("Shared merchant refund");
    const data = await group(page, id),
      own = data.group.participantId;
    await page
      .locator(`input[name="received:${first.subjectId}"]`)
      .fill("10.00");
    await page.locator(`input[name="share_credit:${own}"]`).fill("5.00");
    await page
      .locator(`input[name="share_credit:${first.subjectId}"]`)
      .fill("5.00");
    await page
      .getByRole("button", { name: "Record shared refund", exact: true })
      .click();
    await expect
      .poll(async () => (await group(page, id)).ledger.refunds.length)
      .toBe(1);
    const cpu = await page.context().newCDPSession(page);
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      const nav = page.getByRole("complementary").first();
      await nav.getByLabel("Theme", { exact: true }).selectOption(theme);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`/sharing/${id}`);
      await expect(
        page.getByRole("heading", {
          name: "I browser shared mobile",
          level: 1,
        }),
      ).toBeVisible();
      await page
        .locator("details")
        .evaluateAll((nodes) =>
          nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)),
        );
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.tagName),
      ).not.toBe("BODY");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((a) =>
              Number.isFinite(Number(a.effect?.getComputedTiming().endTime)),
            )
            .map((a) => a.finished.catch(() => undefined)),
        );
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `out/i-sharing-${theme}.png`,
        fullPage: true,
      });
      await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await cpu.detach();
  } finally {
    await removeGroups(owner);
    await removeBrowserOwner(owner);
  }
});
