import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
import { addCalendarDays } from "@/modules/reporting/domain/period";
const headers = { origin: "http://localhost:3100" };
test("private files scan before download, reject foreign access, and support mobile keyboard controls", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const owner = await createBrowserOwner(),
    foreign = await createBrowserOwner();
  try {
    await signIn(page, owner);
    const today = (await (await page.request.get("/api/v1/dashboard")).json())
      .today;
    const accountResponse = await page.request.post("/api/v1/accounts", {
      headers,
      data: {
        clientCommandId: randomUUID(),
        name: "H browser cash",
        accountType: "cash",
        openingCutoffDate: addCalendarDays(today, -1),
        openingBalanceMinor: "100000",
      },
    });
    expect(accountResponse.status()).toBe(201);
    const account = await accountResponse.json();
    await page.goto("/settings/files");
    await page
      .getByLabel("Owned source record")
      .selectOption(account.openingActionId);
    await page.getByText("Manage evidence files", { exact: true }).click();
    await page.getByLabel("Evidence file", { exact: true }).setInputFiles({
      name: "synthetic-receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
    });
    await page
      .getByRole("button", { name: "Upload privately", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Uploaded privately" }),
    ).toBeVisible();
    const list = async () =>
      (
        await (
          await page.request.get(
            `/api/v1/files?sourceKind=financial_action&sourceId=${account.openingActionId}`,
          )
        ).json()
      ).attachments;
    await expect
      .poll(async () => (await list())[0]?.status, {
        timeout: 80000,
        intervals: [1000, 2000, 5000],
      })
      .toBe("available");
    const file = (await list())[0];
    const download = await page.request.get(`/api/v1/files/${file.id}`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(download.headers()["cache-control"]).toContain("no-store");
    const other = await browser.newContext();
    const p = await other.newPage();
    await signIn(p, foreign);
    expect((await p.request.get(`/api/v1/files/${file.id}`)).status()).toBe(
      404,
    );
    await other.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Refresh scan status", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "BODY",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: "out/h-files-mobile.png", fullPage: true });
  } finally {
    await removeBrowserOwner(owner);
    await removeBrowserOwner(foreign);
  }
});
test("durable CSV and portable recovery APIs preserve exact cash and expose accessible review", async ({
  page,
}) => {
  const owner = await createBrowserOwner();
  try {
    await signIn(page, owner);
    const today = (await (await page.request.get("/api/v1/dashboard")).json())
      .today;
    const account = await (
      await page.request.post("/api/v1/accounts", {
        headers,
        data: {
          clientCommandId: randomUUID(),
          name: "H import cash",
          accountType: "cash",
          openingCutoffDate: addCalendarDays(today, -1),
          openingBalanceMinor: "100000",
        },
      })
    ).json();
    await page.goto("/settings/portability");
    await page.getByText("Prepare an import", { exact: true }).click();
    await page
      .getByLabel("Owned financial account")
      .selectOption(account.accountId);
    await page.getByLabel("Date interpretation").selectOption("YYYY-MM-DD");
    await page.getByLabel("UTF-8 cash CSV").setInputFiles({
      name: "cash.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `date,kind,amount_minor,classification,description,reference\n${today},expense,1000,expense,Imported lunch,h-ui-1\n`,
      ),
    });
    await page
      .getByRole("button", { name: "Create reviewed preview", exact: true })
      .click();
    await page.getByText("Resume an import batch", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Confirm exact preview" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm exact preview" }).click();
    await page.getByRole("button", { name: "Process next safe chunk" }).click();
    await expect(page.getByText(/^Batch: completed\./)).toBeVisible();
    await page
      .getByRole("button", { name: "Prepare private workspace export" })
      .click();
    const href = await page
      .getByRole("link", { name: /Download private bundle/ })
      .getAttribute("href");
    const bundle = await (await page.request.get(href!)).json();
    expect(bundle.manifest.attachmentBytesIncluded).toBe(false);
    const previewUrl = `/api/v1/portability?operation=preview&clientCommandId=${randomUUID()}`;
    const rawHeaders = {
      ...headers,
      "content-type": "application/vnd.pmp.private-workspace-graph+json",
    };
    expect(
      (
        await page.request.post(previewUrl, {
          headers: rawHeaders,
          data: '{"manifest":{},"manifest":{},"entities":[]}',
        })
      ).status(),
    ).toBe(400);
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
    await expect(page.getByText(/replacement cash 99000/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Replace after verified preview" }),
    ).toBeDisabled();
    await page
      .getByLabel(
        "Type replace-private-workspace to approve this exact preview",
      )
      .fill("replace-private-workspace");
    await page
      .getByRole("button", { name: "Replace after verified preview" })
      .click();
    await expect(page.getByRole("status")).toContainText("Workspace replaced.");
    const recoveryHref = await page
      .getByRole("link", { name: "Download recovery bundle (within 24 hours)" })
      .getAttribute("href");
    const recovery = await (await page.request.get(recoveryHref!)).json();
    expect(recovery.manifest.format).toBe("pmp-private-workspace-graph");
    expect(
      (
        await page.request.post("/api/v1/portability", {
          headers: { origin: "https://foreign.example" },
          data: { operation: "export", clientCommandId: randomUUID() },
        })
      ).status(),
    ).toBe(403);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: "out/h-portability-mobile-light.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Navigation" });
    await nav.getByLabel("Theme", { exact: true }).selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await nav
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: "out/h-portability-mobile-dark.png",
      fullPage: true,
    });
  } finally {
    await removeBrowserOwner(owner);
  }
});
