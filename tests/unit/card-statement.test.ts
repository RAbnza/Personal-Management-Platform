import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  statementCommandSchema,
  deriveStatementReconciliation,
} from "@/modules/finance/domain/card-statement";
const command = () => ({
  clientCommandId: randomUUID(),
  cardId: randomUUID(),
  cycleStart: "2026-10-01",
  cycleEnd: "2026-10-31",
  statementDate: "2026-11-01",
  dueDate: "2026-11-20",
  balanceMinor: "9007199254740993",
  minimumDueMinor: "100",
  verificationSource: "Provider statement PDF",
  verifiedDate: "2026-11-02",
  entries: [],
});
describe("statement provider evidence", () => {
  it("derives exact recorded due without inventing an allocation or unknown opening balance", () => {
    expect(
      deriveStatementReconciliation(statementCommandSchema.parse(command())),
    ).toMatchObject({
      recordedRemainingDueMinor: "9007199254740993",
      effectiveAllocatedMinor: "0",
      unexplainedDifferenceMinor: null,
    });
  });
  it("compares provider totals only with supplied opening and known line amounts", () => {
    const evidence = statementCommandSchema.parse({
      ...command(),
      balanceMinor: "150",
      minimumDueMinor: "0",
      openingBalanceMinor: "100",
      entries: [
        {
          description: "Purchase",
          amountMinor: "60",
          postingDate: "2026-10-05",
        },
        {
          description: "Provider credit",
          amountMinor: "-5",
          postingDate: null,
        },
      ],
    });
    expect(deriveStatementReconciliation(evidence)).toMatchObject({
      knownProviderLinesMinor: "55",
      unexplainedDifferenceMinor: "-5",
      unlinkedProviderCount: 2,
      incompleteProviderCount: 1,
    });
  });
  it("keeps unknown provider amounts unresolved and credit statements at zero due", () => {
    const evidence = statementCommandSchema.parse({
      ...command(),
      balanceMinor: "-123",
      minimumDueMinor: "0",
      openingBalanceMinor: "0",
      entries: [{ description: "Unknown line" }],
    });
    expect(deriveStatementReconciliation(evidence)).toMatchObject({
      recordedRemainingDueMinor: "0",
      unexplainedDifferenceMinor: null,
      incompleteProviderCount: 1,
    });
  });
  it.each([
    { balanceMinor: "9223372036854775808" },
    { balanceMinor: "-9223372036854775809" },
    { balanceMinor: "1e3" },
    { balanceMinor: "01" },
    { minimumDueMinor: "-1" },
    { minimumDueMinor: "9223372036854775807" },
    { cycleEnd: "2026-02-30" },
    { dueDate: "2026-10-30" },
    { verificationSource: " " },
    { workspaceId: randomUUID() },
    { remainingDueMinor: "5" },
    { statementId: randomUUID() },
    { reason: "Provider correction" },
  ])("rejects unsupported or invalid evidence %j", (change) =>
    expect(
      statementCommandSchema.safeParse({ ...command(), ...change }).success,
    ).toBe(false),
  );
  it("requires correction reason and version; preserves explicit out-of-cycle membership", () => {
    const id = randomUUID();
    expect(
      statementCommandSchema.parse({
        ...command(),
        statementId: randomUUID(),
        expectedVersion: 1,
        reason: "Correct provider dates",
        entries: [
          {
            description: "Provider cycle exception",
            postingDate: "2026-09-28",
            amountMinor: "10",
            actionRevisionId: id,
          },
        ],
      }).entries[0]?.postingDate,
    ).toBe("2026-09-28");
    expect(
      statementCommandSchema.safeParse({
        ...command(),
        entries: [
          {
            description: "Missing date",
            amountMinor: "10",
            actionRevisionId: id,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      statementCommandSchema.safeParse({
        ...command(),
        entries: [
          {
            description: "One",
            postingDate: "2026-10-01",
            amountMinor: "10",
            actionRevisionId: id,
          },
          {
            description: "Duplicate",
            postingDate: "2026-10-01",
            amountMinor: "10",
            actionRevisionId: id,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
