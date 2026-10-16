import { afterEach, describe, it, expect, vi } from "vitest";
import {
  allocateBill,
  minor,
  groupCommandSchema,
  sharingEnabled,
} from "@/modules/sharing/domain/sharing";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const bill = {
  description: "Dinner",
  expenseDate: "2026-10-15",
  totalMinor: "10000",
  splitMethod: "equal" as const,
  contributions: [{ participantId: a, amountMinor: "10000" }],
  shares: [{ participantId: c }, { participantId: a }, { participantId: b }],
};
afterEach(() => vi.unstubAllEnvs());
describe("shared bill arithmetic and release boundary", () => {
  it("persists deterministic extra-centavo recipients regardless of input order", () => {
    const x = allocateBill(bill),
      y = allocateBill({ ...bill, shares: [...bill.shares].reverse() });
    expect(x).toEqual(y);
    expect(x.shares.map((s) => [s.amountMinor, s.roundingExtraMinor])).toEqual([
      ["3334", 1],
      ["3333", 0],
      ["3333", 0],
    ]);
  });
  it("preserves the full PostgreSQL bigint range without Number conversion", () => {
    const x = allocateBill({
      ...bill,
      totalMinor: "9223372036854775807",
      contributions: [{ participantId: a, amountMinor: "9223372036854775807" }],
    });
    expect(x.shares.reduce((s, p) => s + BigInt(p.amountMinor), 0n)).toBe(
      9223372036854775807n,
    );
    expect(minor.safeParse("9223372036854775808").success).toBe(false);
  });
  it("supports independent payer/share subsets and explicit zero exact shares", () => {
    const x = allocateBill({
      ...bill,
      splitMethod: "exact",
      contributions: [
        { participantId: a, amountMinor: "4000" },
        { participantId: b, amountMinor: "6000" },
      ],
      shares: [
        { participantId: c, amountMinor: "10000" },
        { participantId: b, amountMinor: "0" },
      ],
    });
    expect(x.shares.map((s) => s.amountMinor)).toEqual(["0", "10000"]);
  });
  it.each(["1.01", "1e2", "-1", "01", "9007199254740993.0"])(
    "rejects noncanonical minor units %s",
    (v) => expect(minor.safeParse(v).success).toBe(false),
  );
  it("rejects incomplete totals, duplicate people and spoofed ownership", () => {
    expect(() =>
      allocateBill({
        ...bill,
        contributions: [{ participantId: a, amountMinor: "9999" }],
      }),
    ).toThrow();
    expect(() =>
      allocateBill({
        ...bill,
        shares: [{ participantId: a }, { participantId: a }],
      }),
    ).toThrow();
    expect(
      groupCommandSchema.safeParse({
        kind: "create",
        clientCommandId: a,
        groupId: b,
        name: "Test",
        displayName: "A",
        userId: c,
      }).success,
    ).toBe(false);
  });
  it("keeps the legacy preview local and requires explicit full-domain opt-in for deployed environments", () => {
    vi.stubEnv("SHARED_EXPENSES_ENABLED", "false");
    vi.stubEnv("SHARED_EXPENSES_PREVIEW_ENABLED", "false");
    expect(sharingEnabled()).toBe(false);
    vi.stubEnv("SHARED_EXPENSES_PREVIEW_ENABLED", "true");
    vi.stubEnv("PMP_DEPLOYMENT_ENV", "test");
    expect(sharingEnabled()).toBe(true);
    for (const env of ["staging", "production"]) {
      vi.stubEnv("PMP_DEPLOYMENT_ENV", env);
      expect(sharingEnabled()).toBe(false);
      vi.stubEnv("SHARED_EXPENSES_ENABLED", "true");
      expect(sharingEnabled()).toBe(true);
      vi.stubEnv("SHARED_EXPENSES_ENABLED", "false");
    }
  });
});
