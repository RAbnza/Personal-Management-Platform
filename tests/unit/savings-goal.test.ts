import { describe, it, expect } from "vitest";
import {
  savingsGoalCommandSchema,
  goalFieldsSchema,
  savingsMinor,
  supportedReservation,
  savingsProgress,
} from "@/modules/planning/domain/savings-goal";
const id = "00000000-0000-4000-8000-000000000001";
describe("savings management and exact supported funding", () => {
  it("accepts full PostgreSQL targets and zero reservations, rejecting inexact/negative/overflow input", () => {
    expect(
      goalFieldsSchema.parse({
        name: " Goal ",
        targetMinor: "9223372036854775807",
      }),
    ).toMatchObject({ name: "Goal", targetDate: null, notes: null });
    expect(savingsMinor.parse("0")).toBe("0");
    for (const amount of ["0", "-1", "1.1", "01", "9223372036854775808"]) {
      expect(
        goalFieldsSchema.safeParse({ name: "Goal", targetMinor: amount })
          .success,
      ).toBe(false);
    }
    for (const amount of ["-1", "1.1", "01", "9223372036854775808"]) {
      expect(savingsMinor.safeParse(amount).success).toBe(false);
    }
  });
  it("validates dates, names, reasons, scope and expected versions", () => {
    for (const targetDate of ["2026-02-30", "1899-12-31", "2200-01-01"]) {
      expect(
        goalFieldsSchema.safeParse({
          name: "Goal",
          targetMinor: "1",
          targetDate,
        }).success,
      ).toBe(false);
    }
    const body = {
      operation: "save",
      clientCommandId: id,
      goalId: null,
      expectedVersion: null,
      reason: null,
      fields: { name: "Goal", targetMinor: "1", targetDate: "2028-02-29" },
    };
    expect(savingsGoalCommandSchema.safeParse(body).success).toBe(true);
    expect(
      savingsGoalCommandSchema.safeParse({ ...body, workspaceId: id }).success,
    ).toBe(false);
    expect(
      savingsGoalCommandSchema.safeParse({ ...body, goalId: id }).success,
    ).toBe(false);
    expect(
      savingsGoalCommandSchema.safeParse({
        ...body,
        fields: { name: " ", targetMinor: "1" },
      }).success,
    ).toBe(false);
  });
  it("requires explicit distinct reallocation and consistent same-goal versions", () => {
    const body = {
      operation: "reallocate",
      clientCommandId: id,
      goalId: id,
      expectedVersion: 1,
      reason: "Move reservation",
      expectedFinancialRevision: "1",
      sourceAccountId: id,
      targetAccountId: id,
      targetGoalId: id,
      expectedTargetVersion: 1,
      amountMinor: "1",
    };
    expect(savingsGoalCommandSchema.safeParse(body).success).toBe(false);
    const changed = {
      ...body,
      targetAccountId: "00000000-0000-4000-8000-000000000002",
    };
    expect(savingsGoalCommandSchema.safeParse(changed).success).toBe(true);
    expect(
      savingsGoalCommandSchema.safeParse({
        ...changed,
        expectedTargetVersion: 2,
      }).success,
    ).toBe(false);
  });
  it("reports shared funding bounds without inventing priority or cash", () => {
    expect(supportedReservation("60", "100", "80")).toEqual({
      minimumMinor: "40",
      maximumMinor: "60",
      atRisk: true,
    });
    expect(supportedReservation("60", "100", "0")).toEqual({
      minimumMinor: "0",
      maximumMinor: "0",
      atRisk: true,
    });
    expect(supportedReservation("60", "100", "200")).toEqual({
      minimumMinor: "60",
      maximumMinor: "60",
      atRisk: false,
    });
    expect(savingsProgress("50", "60", "40", "60")).toMatchObject({
      fundingHealth: "shared_shortfall",
      excessReservedMinor: "10",
      remainingTargetMinor: "0",
      progressBasisPoints: "12000",
    });
    expect(savingsProgress("70", "60", "40", "60").fundingHealth).toBe(
      "partial",
    );
    expect(savingsProgress("50", "60", "60", "60").fundingHealth).toBe(
      "funded",
    );
    expect(savingsProgress("1", "60", "0", "0").fundingHealth).toBe("unfunded");
  });
  it("keeps amounts above Number precision exact", () => {
    expect(
      savingsProgress(
        "9007199254740993",
        "9007199254740992",
        "9007199254740992",
        "9007199254740992",
      ),
    ).toMatchObject({ remainingTargetMinor: "1", progressBasisPoints: "9999" });
  });
});
