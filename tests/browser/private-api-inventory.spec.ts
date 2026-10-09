import { expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, createBrowserOwner, removeBrowserOwner } from "./helpers/owner";
import { signIn } from "./helpers/sign-in";
async function routes(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? routes(`${directory}/${e.name}`)
          : e.name === "route.ts"
            ? [`${directory}/${e.name}`]
            : [],
      ),
    )
  ).flat();
}
test("every private V1 API method rejects an unauthenticated caller and spoofed owner/workspace headers", async ({
  page,
}) => {
  const inventory = [
    ...(await routes("src/app/api/v1")),
    "src/app/api/workspace/setup/route.ts",
  ];
  expect(inventory.length).toBeGreaterThan(30);
  for (const file of inventory) {
    const code = await readFile(file, "utf8");
    const methods = [
      ...code.matchAll(
        /export\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PATCH|DELETE|PUT)\b/g,
      ),
    ].map((m) => m[1]!);
    for (const match of code.matchAll(
      /export\s*\{[^}]*\bas\s+(GET|POST|PATCH|DELETE|PUT)\b[^}]*\}/g,
    ))
      methods.push(match[1]!);
    expect(methods.length, file).toBeGreaterThan(0);
    const path = file
      .replace(/^src\/app/, "")
      .replace(/\/route.ts$/, "")
      .replace(/\[([^\]]+)\]/g, (_all, key: string) =>
        key === "view"
          ? "financial"
          : key === "moduleKey"
            ? "money"
            : key === "stepKey"
              ? "workspace_preferences"
              : randomUUID(),
      );
    for (const method of methods) {
      const response = await page.request.fetch(
        `${path}?period=monthly&startDate=2026-10-01&endDate=2026-10-31`,
        {
          method,
          headers: {
            origin: "http://localhost:3100",
            "x-user-id": randomUUID(),
            "x-workspace-id": randomUUID(),
          },
          ...(method !== "GET"
            ? {
                data:
                  path === "/api/v1/sessions"
                    ? { kind: "all" }
                    : { clientCommandId: randomUUID() },
              }
            : {}),
        },
      );
      expect([401, 403], `${method} ${path}`).toContain(response.status());
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(await response.text()).not.toMatch(
        /password|postgresql:|stack|bearer|SELECT /i,
      );
    }
  }
});

test("authenticated foreign IDs and spoofed workspace context cannot expose another owner's records", async ({
  page,
  owner,
  browser,
}) => {
  const other = await createBrowserOwner(),
    context = await browser.newContext(),
    otherPage = await context.newPage();
  const headers = { origin: "http://localhost:3100" };
  try {
    await signIn(otherPage, other);
    async function post(path: string, data: object) {
      const r = await otherPage.request.post(path, { headers, data });
      expect(r.status()).toBe(201);
      return r.json();
    }
    const account = await post("/api/v1/accounts", {
      clientCommandId: randomUUID(),
      name: "Foreign private bank",
      accountType: "checking",
      openingCutoffDate: "2026-09-30",
      openingBalanceMinor: "200000",
    });
    const income = await post("/api/v1/financial-actions", {
      actionKind: "income",
      clientCommandId: randomUUID(),
      receivingAccountId: account.accountId,
      effectiveDate: "2026-10-01",
      amountMinor: "100",
      incomeClass: "gift",
      description: "Foreign private gift",
    });
    const debt = await post("/api/v1/debts", {
      clientCommandId: randomUUID(),
      name: "Foreign private loan",
      lenderName: "Provider",
      debtType: "personal_loan",
      startDate: "2026-01-01",
      openingCutoffDate: "2026-10-01",
      openingLiabilityMinor: "10000",
      openingComponents: [{ kind: "principal", amountMinor: "10000" }],
      installments: [],
      scheduleReason: "No supplied dues",
    });
    const application = await post("/api/v1/applications", {
      clientCommandId: randomUUID(),
      companyName: "Foreign private company",
      roleTitle: "Role",
      initialStage: "applied",
      initialStageEffectiveDate: "2026-10-01",
      appliedDate: "2026-10-01",
    });
    const event = await post(
      `/api/v1/applications/${application.applicationId}/events`,
      {
        clientCommandId: randomUUID(),
        eventKind: "interview",
        title: "Foreign private interview",
        temporalKind: "date",
        eventDate: "2026-10-10",
      },
    );
    const personal = await post("/api/v1/personal-events", {
      clientCommandId: randomUUID(),
      title: "Foreign private calendar",
      temporalKind: "date",
      eventDate: "2026-10-10",
    });
    const ids: Record<string, string> = {
      accountId: account.accountId,
      actionId: income.actionId,
      debtId: debt.debtId,
      applicationId: application.applicationId,
      eventId: event.eventId,
    };
    await signIn(page, owner);
    const setup = await page.request.post("/api/workspace/setup", {
      headers: {
        ...headers,
        "x-user-id": other.userId,
        "x-workspace-id": other.workspaceId,
      },
      data: { userId: other.userId, workspaceId: other.workspaceId },
    });
    expect(setup.status()).toBe(200);
    expect(await setup.json()).toEqual({
      workspaceId: owner.workspaceId,
      created: false,
    });
    for (const file of await routes("src/app/api/v1")) {
      if (!/\[(accountId|actionId|debtId|applicationId|eventId)\]/.test(file))
        continue;
      const code = await readFile(file, "utf8");
      if (!/export\s+(?:async\s+)?function\s+GET\b/.test(code)) continue;
      const path = file
        .replace(/^src\/app/, "")
        .replace(/\/route.ts$/, "")
        .replace(/\[([^\]]+)\]/g, (_all, key: string) =>
          key === "eventId" && !file.includes("applications")
            ? personal.eventId
            : ids[key]!,
        );
      const r = await page.request.get(path, {
        headers: {
          "x-user-id": other.userId,
          "x-workspace-id": other.workspaceId,
        },
      });
      expect([403, 404], path).toContain(r.status());
      expect(await r.text()).not.toContain("Foreign private");
    }
    const denied = await page.request.post("/api/v1/financial-actions", {
      headers,
      data: {
        actionKind: "income",
        clientCommandId: randomUUID(),
        receivingAccountId: account.accountId,
        effectiveDate: "2026-10-02",
        amountMinor: "100",
        incomeClass: "gift",
        description: "Foreign reference attack",
      },
    });
    expect(denied.status()).toBe(404);
    for (const path of [
      "/api/v1/accounts",
      "/api/v1/debts",
      "/api/v1/applications",
      "/api/v1/agenda?startDate=2026-10-01&endDate=2026-10-31",
      "/api/v1/dashboard",
      "/api/v1/reports/financial?period=month&anchorDate=2026-10-01",
    ]) {
      const r = await page.request.get(path, {
        headers: {
          "x-user-id": other.userId,
          "x-workspace-id": other.workspaceId,
        },
      });
      expect(r.status(), path).toBe(200);
      expect(await r.text()).not.toContain("Foreign private");
    }
  } finally {
    await context.close();
    await removeBrowserOwner(other);
  }
});
