import { describe, it, expect } from "vitest";
import {
  calculateBalances,
  previewSettlement,
  type SourcePosition,
  type Settlement,
} from "@/modules/sharing/domain/balances";
const source = (
  expenseId: string,
  participantId: string,
  paidMinor: string,
  shareMinor: string,
  refundReceivedMinor = "0",
  refundShareMinor = "0",
): SourcePosition => ({
  expenseId,
  revisionId: expenseId + "rev",
  participantId,
  paidMinor,
  shareMinor,
  refundReceivedMinor,
  refundShareMinor,
});
const sources = [
  source("dinner", "a", "2000", "1000"),
  source("dinner", "b", "0", "1000"),
  source("groceries", "b", "1600", "800"),
  source("groceries", "a", "0", "800"),
];
describe("group balance attribution and settlement projections", () => {
  it("nets reciprocal obligations while preserving each bill", () => {
    const b = calculateBalances(sources, []);
    expect(b.positions).toEqual([
      { participantId: "a", netMinor: "200" },
      { participantId: "b", netMinor: "-200" },
    ]);
    expect(b.edges).toHaveLength(2);
    expect(b.suggestions).toEqual([
      { senderId: "b", recipientId: "a", amountMinor: "200" },
    ]);
  });
  it("allocates a full reciprocal balance without rewriting sources", () => {
    const p = previewSettlement(sources, [], "b", "a", "200");
    expect(p.allocations).toEqual([
      {
        expenseId: "dinner",
        sourceRevisionId: "dinnerrev",
        amountMinor: "200",
      },
    ]);
    expect(p.advanceMinor).toBe("0");
    expect(sources[0]!.paidMinor).toBe("2000");
  });
  it("preserves pending reports and applies only confirmed payments", () => {
    const p = previewSettlement(sources, [], "b", "a", "100"),
      s: Settlement = {
        id: "payment",
        senderId: "b",
        recipientId: "a",
        amountMinor: "100",
        advanceMinor: p.advanceMinor,
        state: "pending",
        allocations: p.allocations,
      };
    expect(calculateBalances(sources, [s]).positions).toEqual(
      calculateBalances(sources, []).positions,
    );
    expect(
      calculateBalances(sources, [{ ...s, state: "confirmed" }]).positions[0]!
        .netMinor,
    ).toBe("100");
    expect(
      calculateBalances(sources, [{ ...s, state: "reversed" }]).positions[0]!
        .netMinor,
    ).toBe("200");
  });
  it("makes overpayments explicit and rejects foreign recipient allocations", () => {
    const p = previewSettlement(sources, [], "b", "a", "1200");
    expect(p.advanceMinor).toBe("1000");
    expect(p.projectedRelationshipMinor).toBe("-1000");
    expect(() =>
      previewSettlement(sources, [], "b", "c", "100", [
        {
          expenseId: "dinner",
          sourceRevisionId: "dinnerrev",
          amountMinor: "100",
        },
      ]),
    ).toThrow(/recipient/);
  });
  it("supports exact multi-bill partials and stale/duplicate detection", () => {
    const rows = [
        ...sources.slice(0, 2),
        source("gas", "a", "600", "0"),
        source("gas", "b", "0", "600"),
      ],
      allocations = [
        {
          expenseId: "dinner",
          sourceRevisionId: "dinnerrev",
          amountMinor: "400",
        },
        { expenseId: "gas", sourceRevisionId: "gasrev", amountMinor: "100" },
      ];
    expect(
      previewSettlement(rows, [], "b", "a", "500", allocations).advanceMinor,
    ).toBe("0");
    expect(() =>
      previewSettlement(rows, [], "b", "a", "500", [
        allocations[0]!,
        allocations[0]!,
      ]),
    ).toThrow(/once/);
    expect(() =>
      previewSettlement(rows, [], "b", "a", "500", [
        { ...allocations[0]!, sourceRevisionId: "old" },
      ]),
    ).toThrow(/changed/);
  });
  it("retains exact bigint sums, refunds and deterministic multiple-payer attribution", () => {
    const n = "9223372036854775807",
      rows = [
        source("x", "a", n, "0"),
        source("x", "b", n, "0"),
        source("x", "c", "0", n),
        source("x", "d", "0", n),
      ];
    const b = calculateBalances(rows, []);
    expect(b.positions.reduce((n, p) => n + BigInt(p.netMinor), 0n)).toBe(0n);
    expect(
      b.edges.map((e) => [e.senderId, e.recipientId, e.amountMinor]),
    ).toEqual([
      ["c", "a", n],
      ["d", "b", n],
    ]);
    const refunded = calculateBalances(
      [
        source("dinner", "a", "2000", "1000", "600", "300"),
        source("dinner", "b", "0", "1000", "0", "300"),
      ],
      [],
    );
    expect(refunded.positions[0]!.netMinor).toBe("700");
  });
});
