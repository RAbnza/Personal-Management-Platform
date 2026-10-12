import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  cardInstallmentCommandSchema,
  cardInstallmentApplicationSchema,
  cardInstallmentLineSchema,
  installmentProjection,
} from "@/modules/finance/domain/card-installment";
const base = {
  cardId: randomUUID(),
  clientCommandId: randomUUID(),
  purchaseActionId: randomUUID(),
  purchaseActionRevisionId: randomUUID(),
  principalMinor: "30000",
  installmentCount: 3,
  providerConfirmed: true,
  verificationSource: "Actual complete provider schedule",
  verifiedDate: "2026-10-12",
  installments: Array.from({ length: 3 }, (_, i) => ({
    dueDate: `2026-${11 + i}-10`,
    principalMinor: "10000",
    interestMinor: null,
    feeMinor: null,
    totalMinor: null,
  })),
};
// Keep each date explicit; no rate, amount or monthly date is inferred.
base.installments[2]!.dueDate = "2027-01-10";
describe("provider installment evidence", () => {
  it("retains unknown provider charges and dates without guessing totals", () => {
    const b = cardInstallmentCommandSchema.parse({
      ...base,
      installments: base.installments.map((x) => ({ ...x, dueDate: null })),
    });
    expect(b.installments[0]!.interestMinor).toBeNull();
    expect(installmentProjection(b.installments[0]!)).toEqual({
      remainingPrincipalMinor: "10000",
      remainingInterestMinor: null,
      remainingFeeMinor: null,
      remainingTotalMinor: null,
    });
  });
  it("derives exact large known totals and partial principal without Number conversion", () => {
    const l = cardInstallmentLineSchema.parse({
      principalMinor: "10000",
      interestMinor: "9007199254740993",
      feeMinor: "7",
      totalMinor: "9007199254751000",
    });
    expect(
      installmentProjection(l, {
        principalMinor: "100",
        interestMinor: "3",
        feeMinor: "2",
      }),
    ).toEqual({
      remainingPrincipalMinor: "9900",
      remainingInterestMinor: "9007199254740990",
      remainingFeeMinor: "5",
      remainingTotalMinor: "9007199254750895",
    });
  });
  it("accepts a supplied provider total with an explicitly unknown charge split", () => {
    const l = cardInstallmentLineSchema.parse({
      principalMinor: "100",
      totalMinor: "150",
    });
    expect(installmentProjection(l).remainingTotalMinor).toBe("150");
    expect(installmentProjection(l).remainingInterestMinor).toBeNull();
  });
  it.each(["1.01", "-1", "01", "invalid", "9223372036854775808"])(
    "rejects unsupported evidence amounts %s without conversion exceptions",
    (amount) => {
      expect(
        cardInstallmentCommandSchema.safeParse({
          ...base,
          installments: base.installments.map((x) => ({
            ...x,
            principalMinor: amount,
          })),
        }).success,
      ).toBe(false);
    },
  );
  it.each([
    { installmentCount: 2 },
    { principalMinor: "29999" },
    { providerConfirmed: false },
    { verificationSource: "" },
    { workspaceId: randomUUID() },
    {
      installments: [
        {
          principalMinor: "30000",
          interestMinor: "10",
          feeMinor: "1",
          totalMinor: "30010",
        },
      ],
    },
    { installments: [{ principalMinor: "30000", dueDate: "2026-02-30" }] },
    {
      installments: [
        base.installments[1],
        base.installments[0],
        base.installments[2],
      ],
    },
  ])("rejects inconsistent/unsupported schedules %#", (extra) => {
    expect(
      cardInstallmentCommandSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false);
  });
  it("normalizes case before duplicate/link/hash comparison and requires correction evidence", () => {
    expect(
      cardInstallmentCommandSchema.parse({
        ...base,
        cardId: base.cardId.toUpperCase(),
      }).cardId,
    ).toBe(base.cardId);
    expect(
      cardInstallmentCommandSchema.safeParse({
        ...base,
        lifecycle: "cancelled",
      }).success,
    ).toBe(false);
    expect(
      cardInstallmentCommandSchema.safeParse({ ...base, planId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      cardInstallmentCommandSchema.parse({
        ...base,
        planId: randomUUID(),
        expectedVersion: 1,
        reason: "Provider correction",
        lifecycle: "cancelled",
      }).lifecycle,
    ).toBe("cancelled");
  });
  it("requires exact confirmation and actual charge references for payment applications", () => {
    const a = {
      clientCommandId: randomUUID(),
      planRevisionId: randomUUID(),
      installmentNo: 1,
      allocationId: randomUUID(),
      principalMinor: "100",
      confirmationKind: "user",
      confirmationSource: "Actual provider application",
      confirmedDate: "2026-11-10",
    };
    expect(cardInstallmentApplicationSchema.safeParse(a).success).toBe(true);
    expect(
      cardInstallmentApplicationSchema.safeParse({ ...a, principalMinor: "0" })
        .success,
    ).toBe(false);
    expect(
      cardInstallmentApplicationSchema.safeParse({ ...a, interestMinor: "1" })
        .success,
    ).toBe(false);
    expect(
      cardInstallmentApplicationSchema.safeParse({
        ...a,
        feeActionRevisionId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      cardInstallmentApplicationSchema.safeParse({
        ...a,
        interestMinor: "1",
        interestActionRevisionId: randomUUID(),
      }).success,
    ).toBe(true);
    expect(
      cardInstallmentApplicationSchema.safeParse({
        ...a,
        confirmationSource: "",
      }).success,
    ).toBe(false);
  });
  it("rejects excess applications rather than clipping unsupported amounts", () => {
    const l = cardInstallmentLineSchema.parse({
      principalMinor: "100",
      interestMinor: "0",
      feeMinor: "0",
    });
    expect(() =>
      installmentProjection(l, {
        principalMinor: "101",
        interestMinor: "0",
        feeMinor: "0",
      }),
    ).toThrow();
    expect(() =>
      installmentProjection(l, {
        principalMinor: "-1",
        interestMinor: "0",
        feeMinor: "0",
      }),
    ).toThrow();
    expect(() =>
      installmentProjection(
        cardInstallmentLineSchema.parse({ principalMinor: "100" }),
        { principalMinor: "0", interestMinor: "1", feeMinor: "0" },
      ),
    ).toThrow();
  });
});
