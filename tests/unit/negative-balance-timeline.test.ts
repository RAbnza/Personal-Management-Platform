import { describe, expect, it, vi } from "vitest";
import type { ScopedTransaction } from "@/platform/db";
import { reviewCashChanges } from "@/modules/finance/repositories/negative-balance-repository";
function transaction(rows: { date: string; amount: string }[]) {
  return {
    db: { execute: vi.fn().mockResolvedValue({ rows }) },
  } as unknown as ScopedTransaction;
}
describe("historical negative-balance review", () => {
  it("preserves exact cumulative balances, combines same-day changes and checks later dates", async () => {
    const t = transaction([
      { date: "2026-01-01", amount: "9007199254740993000" },
      { date: "2026-01-02", amount: "-9007199254740992900" },
      { date: "2026-01-03", amount: "400" },
    ]);
    const warnings = await reviewCashChanges(t, {
      workspaceId: "workspace",
      acknowledgeNegativeBalance: true,
      changes: [
        {
          accountId: "account",
          effectiveDate: "2026-01-02",
          signedMinor: -200n,
        },
        {
          accountId: "account",
          effectiveDate: "2026-01-02",
          signedMinor: -50n,
        },
        {
          accountId: "account",
          effectiveDate: "2026-01-04",
          signedMinor: -600n,
        },
      ],
    });
    expect(warnings).toEqual([
      {
        accountId: "account",
        effectiveDate: "2026-01-02",
        beforeMinor: "100",
        afterMinor: "-150",
      },
      {
        accountId: "account",
        effectiveDate: "2026-01-04",
        beforeMinor: "500",
        afterMinor: "-350",
      },
    ]);
  });
  it("rejects an unacknowledged backdated negative interval even when the final balance recovers", async () => {
    const t = transaction([
      { date: "2026-01-01", amount: "100" },
      { date: "2026-01-03", amount: "1000" },
    ]);
    await expect(
      reviewCashChanges(t, {
        workspaceId: "workspace",
        acknowledgeNegativeBalance: false,
        changes: [
          {
            accountId: "account",
            effectiveDate: "2026-01-02",
            signedMinor: -200n,
          },
        ],
      }),
    ).rejects.toThrow("explicitly acknowledge");
  });
});
