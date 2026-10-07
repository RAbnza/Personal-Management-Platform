import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildBorrowingPlan,
  recordBorrowingBodySchema,
} from "@/modules/finance/domain/borrowing";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

function validBorrowing() {
  return {
    clientCommandId: randomUUID(),

    name: "Personal loan",
    lenderName: "Example lender",
    productName: "Example loan",

    debtType: "personal_loan" as const,

    borrowingDate: "2026-10-08",

    receivingAccountId: randomUUID(),

    principalMinor: "1000000",
    actualReceivedMinor: "1000000",

    fees: [],

    installments: [],

    scheduleReason: "Provider did not supply installment dates at origination.",

    description: "New personal loan",

    reference: null,

    notes: null,
  };
}

describe("borrowing domain", () => {
  it.each(["principalMinor", "actualReceivedMinor"])(
    "returns validation errors for malformed %s without throwing",
    (field) => {
      const result = recordBorrowingBodySchema.safeParse({
        ...validBorrowing(),
        [field]: "1p0r",
      });
      expect(result.success).toBe(false);
    },
  );

  it("returns validation errors for malformed borrowing fees without throwing", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),
      fees: [{ label: "Fee", amountMinor: "1p0r", treatment: "withheld" }],
    });
    expect(result.success).toBe(false);
  });

  it.each([
    "contractualMinor",
    "knownPrincipalMinor",
    "knownInterestMinor",
    "knownFeeMinor",
  ])(
    "returns validation errors for malformed installment %s without throwing",
    (field) => {
      const result = recordBorrowingBodySchema.safeParse({
        ...validBorrowing(),
        installments: [
          {
            dueDate: "2026-11-08",
            contractualMinor: "100000",
            knownPrincipalMinor: null,
            knownInterestMinor: null,
            knownFeeMinor: null,
            [field]: "1p0r",
          },
        ],
      });
      expect(result.success).toBe(false);
    },
  );
  it("builds an exact borrowing plan when the full principal is received", () => {
    const plan = buildBorrowingPlan(validBorrowing());

    expect(plan).toEqual({
      principalMinor: 1_000_000n,

      actualReceivedMinor: 1_000_000n,

      withheldFeeMinor: 0n,
      capitalizedFeeMinor: 0n,

      totalFeeExpenseMinor: 0n,

      recognizedLiabilityMinor: 1_000_000n,

      fees: [],

      liabilityComponents: [
        {
          kind: "principal",
          amountMinor: 1_000_000n,
          label: null,
        },
      ],
    });
  });

  it("treats a withheld fee as reduced proceeds and expense without increasing liability", () => {
    const plan = buildBorrowingPlan({
      ...validBorrowing(),

      actualReceivedMinor: "980000",

      fees: [
        {
          label: "Processing fee",
          amountMinor: "20000",
          treatment: "withheld",
          categoryId: null,
        },
      ],
    });

    expect(plan.principalMinor).toBe(1_000_000n);

    expect(plan.actualReceivedMinor).toBe(980_000n);

    expect(plan.withheldFeeMinor).toBe(20_000n);

    expect(plan.capitalizedFeeMinor).toBe(0n);

    expect(plan.totalFeeExpenseMinor).toBe(20_000n);

    expect(plan.recognizedLiabilityMinor).toBe(1_000_000n);

    expect(plan.liabilityComponents).toEqual([
      {
        kind: "principal",
        amountMinor: 1_000_000n,
        label: null,
      },
    ]);
  });

  it("treats a capitalized fee as expense plus additional recognized liability without reducing proceeds", () => {
    const plan = buildBorrowingPlan({
      ...validBorrowing(),

      fees: [
        {
          label: "Capitalized processing fee",
          amountMinor: "20000",
          treatment: "capitalized",
          categoryId: null,
        },
      ],
    });

    expect(plan.principalMinor).toBe(1_000_000n);

    expect(plan.actualReceivedMinor).toBe(1_000_000n);

    expect(plan.withheldFeeMinor).toBe(0n);

    expect(plan.capitalizedFeeMinor).toBe(20_000n);

    expect(plan.totalFeeExpenseMinor).toBe(20_000n);

    expect(plan.recognizedLiabilityMinor).toBe(1_020_000n);

    expect(plan.liabilityComponents).toEqual([
      {
        kind: "principal",
        amountMinor: 1_000_000n,
        label: null,
      },
      {
        kind: "fee",
        amountMinor: 20_000n,
        label: "Capitalized processing fee",
      },
    ]);
  });

  it("allows distinct withheld and capitalized charges without counting either twice", () => {
    const plan = buildBorrowingPlan({
      ...validBorrowing(),

      actualReceivedMinor: "980000",

      fees: [
        {
          label: "Disbursement fee",
          amountMinor: "20000",
          treatment: "withheld",
          categoryId: null,
        },
        {
          label: "Capitalized service fee",
          amountMinor: "10000",
          treatment: "capitalized",
          categoryId: null,
        },
      ],
    });

    expect(plan.withheldFeeMinor).toBe(20_000n);

    expect(plan.capitalizedFeeMinor).toBe(10_000n);

    expect(plan.totalFeeExpenseMinor).toBe(30_000n);

    expect(plan.actualReceivedMinor).toBe(980_000n);

    expect(plan.recognizedLiabilityMinor).toBe(1_010_000n);

    /*
     * Accounting identity:
     *
     * cash +980,000
     * expense +30,000
     * liability -1,010,000
     *
     * = 0
     */
    expect(
      plan.actualReceivedMinor +
        plan.totalFeeExpenseMinor -
        plan.recognizedLiabilityMinor,
    ).toBe(0n);
  });

  it("rejects cash proceeds that do not equal principal minus withheld fees", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      actualReceivedMinor: "990000",

      fees: [
        {
          label: "Processing fee",
          amountMinor: "20000",
          treatment: "withheld",
          categoryId: null,
        },
      ],
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected borrowing validation to fail.");
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["actualReceivedMinor"],
          message: expect.stringMatching(
            /must equal principal minus withheld fees/i,
          ),
        }),
      ]),
    );
  });

  it("rejects withheld fees that consume the entire principal", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      actualReceivedMinor: "1",

      fees: [
        {
          label: "Invalid fee",
          amountMinor: "1000000",
          treatment: "withheld",
          categoryId: null,
        },
      ],
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected borrowing validation to fail.");
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["fees"],
          message: expect.stringMatching(
            /must be less than the contractual principal/i,
          ),
        }),
      ]),
    );
  });

  it("does not allow financed purchases through the cash-borrowing command", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      debtType: "financed_purchase",
    });

    expect(result.success).toBe(false);
  });

  it("allows a new borrowing to begin without provider due dates", () => {
    const result = recordBorrowingBodySchema.parse(validBorrowing());

    expect(result.installments).toEqual([]);
  });

  it("rejects an installment due before the borrowing date", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      installments: [
        {
          dueDate: "2026-10-07",
          contractualMinor: "100000",
          knownPrincipalMinor: null,
          knownInterestMinor: null,
          knownFeeMinor: null,
          breakdownComplete: false,
          notes: null,
        },
      ],
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected borrowing validation to fail.");
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["installments", 0, "dueDate"],
          message: expect.stringMatching(
            /cannot be due before the borrowing date/i,
          ),
        }),
      ]),
    );
  });

  it("requires a complete installment breakdown to equal its contractual amount", () => {
    const invalid = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      installments: [
        {
          dueDate: "2026-11-08",
          contractualMinor: "120000",
          knownPrincipalMinor: "100000",
          knownInterestMinor: "10000",
          knownFeeMinor: "0",
          breakdownComplete: true,
          notes: null,
        },
      ],
    });

    expect(invalid.success).toBe(false);

    const valid = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      installments: [
        {
          dueDate: "2026-11-08",
          contractualMinor: "120000",
          knownPrincipalMinor: "100000",
          knownInterestMinor: "10000",
          knownFeeMinor: "10000",
          breakdownComplete: true,
          notes: null,
        },
      ],
    });

    expect(valid.success).toBe(true);
  });

  it("rejects individual borrowing components above the persisted component limit", () => {
    const result = recordBorrowingBodySchema.safeParse({
      ...validBorrowing(),

      principalMinor: (MAX_FINANCIAL_COMPONENT_MINOR + 1n).toString(),

      actualReceivedMinor: (MAX_FINANCIAL_COMPONENT_MINOR + 1n).toString(),
    });

    expect(result.success).toBe(false);
  });

  it("keeps all arithmetic exact above JavaScript safe-integer ranges", () => {
    const plan = buildBorrowingPlan({
      ...validBorrowing(),

      principalMinor: "100000000000",

      actualReceivedMinor: "99999999999",

      fees: [
        {
          label: "One-centavo withheld fee",
          amountMinor: "1",
          treatment: "withheld",
          categoryId: null,
        },
        {
          label: "One-centavo capitalized fee",
          amountMinor: "1",
          treatment: "capitalized",
          categoryId: null,
        },
      ],
    });

    expect(plan.principalMinor).toBe(100_000_000_000n);

    expect(plan.actualReceivedMinor).toBe(99_999_999_999n);

    expect(plan.recognizedLiabilityMinor).toBe(100_000_000_001n);

    expect(
      plan.actualReceivedMinor +
        plan.totalFeeExpenseMinor -
        plan.recognizedLiabilityMinor,
    ).toBe(0n);
  });
});
