import { describe, expect, it } from "vitest";

import {
  FINANCIAL_COMMAND_HASH_VERSION,
  canonicalizeFinancialCommandPayload,
  hashFinancialCommandPayload,
} from "@/modules/finance/domain/financial-command";

describe("financial command payload hashing", () => {
  it("uses the initial documented hash version", () => {
    expect(FINANCIAL_COMMAND_HASH_VERSION).toBe(1);
  });

  it("canonicalizes object keys independently of insertion order", () => {
    const first = {
      accountType: "checking",
      name: "BDO Savings",
      openingBalanceMinor: "200000",
      openingCutoffDate: "2026-10-06",
    } as const;

    const second = {
      openingCutoffDate: "2026-10-06",
      openingBalanceMinor: "200000",
      name: "BDO Savings",
      accountType: "checking",
    } as const;

    expect(canonicalizeFinancialCommandPayload(first)).toBe(
      canonicalizeFinancialCommandPayload(second),
    );

    expect(hashFinancialCommandPayload(first)).toEqual(
      hashFinancialCommandPayload(second),
    );
  });

  it("preserves array order because array position can be semantic", () => {
    const first = hashFinancialCommandPayload({
      allocations: ["100", "200"],
    });

    const second = hashFinancialCommandPayload({
      allocations: ["200", "100"],
    });

    expect(first.equals(second)).toBe(false);
  });

  it("produces a 32-byte SHA-256 digest and changes when payload changes", () => {
    const first = hashFinancialCommandPayload({
      amountMinor: "10000",
      currency: "PHP",
    });

    const second = hashFinancialCommandPayload({
      amountMinor: "10001",
      currency: "PHP",
    });

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first.equals(second)).toBe(false);
  });

  it("rejects ambiguous non-integer or non-JSON values", () => {
    expect(() =>
      canonicalizeFinancialCommandPayload({
        amount: 1.5,
      }),
    ).toThrow(/safe integers/i);

    expect(() =>
      canonicalizeFinancialCommandPayload({
        amount: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(/safe integers/i);

    expect(() =>
      canonicalizeFinancialCommandPayload({
        invalid: undefined,
      } as unknown as {
        invalid: string;
      }),
    ).toThrow(/undefined/i);

    expect(() =>
      canonicalizeFinancialCommandPayload(
        new Date() as unknown as {
          value: string;
        },
      ),
    ).toThrow(/plain JSON objects/i);
  });
});
