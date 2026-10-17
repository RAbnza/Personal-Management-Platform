import { describe, expect, it } from "vitest";
import {
  activeModule,
  availableDestinations,
  breadcrumbsFor,
  localDestinations,
  modules,
} from "@/components/shell/navigation-model";

const account = "11111111-1111-4111-8111-111111111111";
const card = "22222222-2222-4222-8222-222222222222";
describe("shared navigation hierarchy", () => {
  it("recognizes the module on deep routes without requiring its landing URL", () => {
    expect(activeModule(`/money/accounts/${account}/reconcile`)?.label).toBe(
      "Money",
    );
    expect(activeModule("/career/applications/new")?.label).toBe("Career");
    expect(activeModule("/moneyish")).toBeUndefined();
    expect(localDestinations("Plans").map((d) => d.href)).toContain(
      "/money/goals",
    );
  });
  it("uses authorized account labels and the real history parent for reconciliation", () => {
    const base = `/money/accounts/${account}`;
    expect(
      breadcrumbsFor(`${base}/reconcile`, { [base]: "Cash Wallet" }),
    ).toEqual([
      { label: "Home", href: "/" },
      { label: "Money", href: "/money/actions" },
      { label: "Accounts", href: "/money/accounts" },
      { label: "Cash Wallet", href: `${base}/history` },
      { label: "Check balance" },
    ]);
    expect(
      breadcrumbsFor(`${base}/history`, { [base]: "Cash Wallet" }).some(
        (i) => i.href === base,
      ),
    ).toBe(false);
  });
  it("retains nested card and statement parents without exposing identifiers", () => {
    const base = `/money/cards/${card}`,
      statement = `${base}/statements/${account}`;
    const trail = breadcrumbsFor(`${statement}/allocations`, {
      [base]: "Travel card",
      [statement]: "Statement 2026-10-10",
    });
    expect(trail.slice(-3)).toEqual([
      { label: "Statements", href: `${base}/statements` },
      { label: "Statement 2026-10-10", href: statement },
      { label: "Allocations" },
    ]);
    expect(trail.map((i) => i.label)).toContain("Travel card");
    expect(
      breadcrumbsFor(`/money/debts/${account}/pay`).map((i) => i.label),
    ).toEqual(["Home", "Money", "Debts", "Debt", "Record payment"]);
    expect(
      breadcrumbsFor("/money/debts/unavailable-private-slug").at(-1)?.label,
    ).toBe("Details");
  });
  it("supports settings, reports and tracker routes without inventing collection pages", () => {
    expect(breadcrumbsFor("/settings/files").map((i) => i.label)).toEqual([
      "Home",
      "Settings",
      "Files",
    ]);
    expect(breadcrumbsFor("/reports/financial/detail").at(-2)?.href).toBe(
      "/reports/financial",
    );
    expect(breadcrumbsFor(`/trackers/templates/${account}`).at(-2)?.href).toBe(
      "/trackers",
    );
  });
  it("filters desktop and mobile destinations with the same module and sharing capabilities", () => {
    const visible = availableDestinations(
      modules,
      [
        { moduleKey: "money", enabled: false },
        { moduleKey: "career", enabled: true },
      ],
      false,
    );
    expect(visible.map((d) => d.label)).toEqual(["Career", "Reports"]);
  });
});
