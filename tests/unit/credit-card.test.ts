import { describe, expect, it } from "vitest";

import {
  creditCardMetadataSchema,
  createCreditCardInputSchema,
  deriveCardPosition,
} from "@/modules/finance/domain/credit-card";

const metadata = { name: " BPI Visa ", issuerName: " BPI " };

describe("credit card foundation validation", () => {
  it("normalizes metadata and keeps unknown provider values absent", () => {
    expect(creditCardMetadataSchema.parse(metadata)).toEqual({
      name: "BPI Visa",
      issuerName: "BPI",
      creditLimitMinor: null,
      limitVerifiedDate: null,
      notes: null,
    });
  });
  it.each([
    "-1",
    "1.00",
    "1e3",
    "01",
    " 1",
    "NaN",
    "9223372036854775808",
    "9".repeat(100),
  ])("rejects invalid or overflowing exact limit %s", (creditLimitMinor) => {
    expect(
      creditCardMetadataSchema.safeParse({ ...metadata, creditLimitMinor })
        .success,
    ).toBe(false);
  });
  it.each(["0", "9007199254740993", "9223372036854775807"])(
    "preserves limit %s exactly",
    (creditLimitMinor) => {
      expect(
        creditCardMetadataSchema.parse({ ...metadata, creditLimitMinor })
          .creditLimitMinor,
      ).toBe(creditLimitMinor);
    },
  );
  it.each(["2026-02-29", "2026-13-01", "2026-01-01T00:00:00Z"])(
    "rejects invalid date %s",
    (limitVerifiedDate) => {
      expect(
        creditCardMetadataSchema.safeParse({ ...metadata, limitVerifiedDate })
          .success,
      ).toBe(false);
    },
  );
  it("accepts a date-only verification and rejects blank/oversized metadata", () => {
    expect(
      creditCardMetadataSchema.parse({
        ...metadata,
        limitVerifiedDate: "2024-02-29",
      }).limitVerifiedDate,
    ).toBe("2024-02-29");
    for (const change of [
      { name: " " },
      { issuerName: "" },
      { name: "a".repeat(201) },
      { notes: "a".repeat(20001) },
    ])
      expect(
        creditCardMetadataSchema.safeParse({ ...metadata, ...change }).success,
      ).toBe(false);
  });
  it("rejects balance, currency, ledger binding and payment-card secrets as input fields", () => {
    for (const field of [
      "currentBalanceMinor",
      "openingBalanceMinor",
      "currency",
      "liabilityLedgerAccountId",
      "pan",
      "cvv",
    ])
      expect(
        creditCardMetadataSchema.safeParse({
          ...metadata,
          [field]: "untrusted",
        }).success,
      ).toBe(false);
    expect(
      createCreditCardInputSchema.safeParse({ ...metadata, userId: "spoofed" })
        .success,
    ).toBe(false);
  });
});

describe("ledger-derived card position", () => {
  it.each([
    ["-300000", { postedOutstandingMinor: "300000", cardCreditMinor: "0" }],
    ["0", { postedOutstandingMinor: "0", cardCreditMinor: "0" }],
    ["12501", { postedOutstandingMinor: "0", cardCreditMinor: "12501" }],
    [
      "-9007199254740993",
      { postedOutstandingMinor: "9007199254740993", cardCreditMinor: "0" },
    ],
  ])(
    "separates outstanding liability and credit for %s",
    (signed, expected) => {
      expect(deriveCardPosition(signed as string)).toEqual(expected);
    },
  );
});
