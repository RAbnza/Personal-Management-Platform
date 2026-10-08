import { describe, expect, it } from "vitest";
import {
  buildDebtPaymentPreview,
  recordDebtPaymentBodySchema,
} from "@/modules/finance/domain/debt-payment";
import { paymentBody, paymentIds } from "./helpers/debt-payment";

describe("debt-payment contracts and exact review", () => {
  it("keeps actual cash, new spending and confirmed due satisfaction independent", () => {
    expect(
      buildDebtPaymentPreview(recordDebtPaymentBodySchema.parse(paymentBody())),
    ).toEqual({
      actualPaidMinor: 111000n,
      contractualMinor: 110000n,
      externalFeeMinor: 1000n,
      liabilityReductionMinor: 100000n,
      newExpenseMinor: 11000n,
      clearingMinor: 0n,
      dueSatisfiedMinor: 110000n,
      unappliedMinor: 0n,
    });
  });
  it("does not expense previously recognized interest", () => {
    const body = recordDebtPaymentBodySchema.parse({
      ...paymentBody(),
      components: [
        {
          disposition: "liability_reduction",
          liabilityComponent: "principal",
          amountMinor: "100000",
          label: "Principal",
        },
        {
          disposition: "liability_reduction",
          liabilityComponent: "interest",
          amountMinor: "10000",
          label: "Previously recognized interest",
        },
      ],
    });
    expect(buildDebtPaymentPreview(body).newExpenseMinor).toBe(1000n);
  });
  it("accepts a confirmed unclassified reduction without guessing composition", () => {
    expect(
      recordDebtPaymentBodySchema.safeParse({
        ...paymentBody(),
        allocationCertainty: "confirmed_total",
        components: [
          {
            disposition: "liability_reduction",
            liabilityComponent: "unclassified",
            amountMinor: "110000",
            label: "Confirmed total",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      recordDebtPaymentBodySchema.safeParse({
        ...paymentBody(),
        allocationCertainty: "confirmed_total",
      }).success,
    ).toBe(false);
  });
  it("keeps a no-date payment explicitly unapplied", () => {
    const body = recordDebtPaymentBodySchema.parse({
      ...paymentBody(),
      dueAllocations: [],
      unappliedContractualMinor: "110000",
    });
    expect(buildDebtPaymentPreview(body).dueSatisfiedMinor).toBe(0n);
    expect(buildDebtPaymentPreview(body).unappliedMinor).toBe(110000n);
  });
  it("retains known components and a disclosed clearing remainder", () => {
    const body = recordDebtPaymentBodySchema.parse({
      ...paymentBody(),
      allocationCertainty: "unresolved",
      components: [
        {
          disposition: "liability_reduction",
          liabilityComponent: "principal",
          amountMinor: "50000",
          label: "Known principal",
        },
        {
          disposition: "clearing",
          amountMinor: "60000",
          label: "Unknown accounting",
        },
      ],
    });
    expect(buildDebtPaymentPreview(body).clearingMinor).toBe(60000n);
  });
  it.each([
    { actualPaidMinor: "110000" },
    {
      components: [
        { disposition: "clearing", amountMinor: "100000", label: "Pending" },
      ],
    },
    {
      dueAllocations: [
        { installmentId: paymentIds.installment, amountMinor: "111000" },
      ],
    },
    {
      dueAllocations: [
        { installmentId: paymentIds.installment, amountMinor: "55000" },
        { installmentId: paymentIds.installment, amountMinor: "55000" },
      ],
    },
    { dueAllocationConfirmed: false },
    { confirmationSource: "provider", confirmationNote: null },
    { allocationCertainty: "unresolved" },
  ])("rejects inconsistent or unconfirmed intent %#", (change) => {
    expect(
      recordDebtPaymentBodySchema.safeParse({ ...paymentBody(), ...change })
        .success,
    ).toBe(false);
  });
  it.each(["NaN", "1.1", "-1", "0001", "100000000001"])(
    "rejects malformed/bounded amounts %s without throwing",
    (amount) => {
      expect(() =>
        recordDebtPaymentBodySchema.safeParse({
          ...paymentBody(),
          actualPaidMinor: amount,
        }),
      ).not.toThrow();
      expect(
        recordDebtPaymentBodySchema.safeParse({
          ...paymentBody(),
          actualPaidMinor: amount,
        }).success,
      ).toBe(false);
    },
  );
  it("rejects client-owned authorization fields", () => {
    expect(
      recordDebtPaymentBodySchema.safeParse({
        ...paymentBody(),
        workspaceId: paymentIds.workspace,
      }).success,
    ).toBe(false);
  });
});
