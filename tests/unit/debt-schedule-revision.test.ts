import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { parseCalendarDate } from "@/shared/calendar-date";
import {
  buildScheduleRevisionPreview,
  reviseDebtScheduleBodySchema,
} from "@/modules/finance/domain/debt-schedule-revision";
import { scheduleBody, scheduleSetup } from "./helpers/debt-schedule";
describe("schedule revision contracts and preview", () => {
  it("processes the complete supported 10,000 original pools exactly once", () => {
    const s = scheduleSetup();
    const b = scheduleBody();
    s.detail.installments[0]!.paymentSatisfiedMinor = "10000";
    s.detail.installments[0]!.remainingMinor = "100000";
    s.pools = Array.from({ length: 10000 }, () => ({
      ...s.pools[0]!,
      paymentRevisionId: randomUUID(),
      amountMinor: "1",
      currentTargets: [
        {
          obligationId: s.detail.installments[0]!.obligationId,
          amountMinor: "1",
        },
      ],
    }));
    b.mappings = s.pools.map((p) => ({
      paymentRevisionId: p.paymentRevisionId,
      sourceAllocationId: p.sourceAllocationId,
      targetEntryKey: b.entries[0]!.entryKey,
      amountMinor: "1",
    }));
    const result = buildScheduleRevisionPreview(
      reviseDebtScheduleBodySchema.parse(b),
      s,
    );
    expect(result.entries[0]!.paymentSatisfiedMinor).toBe("10000");
    expect(result.remainingMinor).toBe("100000");
  });
  it("shows exact carried satisfaction and preserves unknown accounting", () => {
    const result = buildScheduleRevisionPreview(
      scheduleBody(),
      scheduleSetup(),
    );
    expect(result.entries[0]).toMatchObject({
      openingSatisfiedMinor: "0",
      paymentSatisfiedMinor: "40000",
      remainingMinor: "70000",
    });
    expect(result.recognizedChargeMinor).toBe("0");
  });
  it.each(["settlement", "initial", "refinance"])(
    "does not release %s revisions",
    (revisionKind) =>
      expect(
        reviseDebtScheduleBodySchema.safeParse({
          ...scheduleBody(),
          revisionKind,
        }).success,
      ).toBe(false),
  );
  it("rejects client-owned opening satisfaction and ownership fields", () => {
    const b = scheduleBody();
    expect(
      reviseDebtScheduleBodySchema.safeParse({ ...b, userId: b.debtId })
        .success,
    ).toBe(false);
    expect(
      reviseDebtScheduleBodySchema.safeParse({
        ...b,
        entries: [{ ...b.entries[0], openingSatisfiedMinor: "40000" }],
      }).success,
    ).toBe(false);
  });
  it("requires explicit mapping confirmation and provider charge confirmation", () => {
    expect(
      reviseDebtScheduleBodySchema.safeParse({
        ...scheduleBody(),
        allocationMappingConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      reviseDebtScheduleBodySchema.safeParse({
        ...scheduleBody(),
        revisionKind: "renegotiation",
        recognizedCharge: {
          kind: "fee",
          amountMinor: "100",
          explanation: "Charge",
          providerConfirmed: false,
        },
      }).success,
    ).toBe(false);
  });
  it("date changes cannot recognize expense or silently change mappings", () => {
    const b = scheduleBody();
    expect(
      reviseDebtScheduleBodySchema.safeParse({
        ...b,
        recognizedCharge: {
          kind: "interest",
          amountMinor: "100",
          explanation: "Provider",
          providerConfirmed: true,
        },
      }).success,
    ).toBe(false);
    b.mappings[0]!.targetEntryKey = null;
    expect(() => buildScheduleRevisionPreview(b, scheduleSetup())).toThrow(
      "preserve each payment",
    );
  });
  it("allocation correction cannot change due dates", () => {
    const b = scheduleBody();
    b.revisionKind = "allocation_correction";
    expect(() => buildScheduleRevisionPreview(b, scheduleSetup())).toThrow(
      "preserve existing contractual terms",
    );
  });
  it("rejects missing, excessive and unavailable original payment pools", () => {
    for (const mode of ["missing", "excess", "unavailable"]) {
      const b = scheduleBody();
      b.revisionKind = "renegotiation";
      if (mode === "missing") b.mappings = [];
      if (mode === "excess") b.mappings[0]!.amountMinor = "40001";
      if (mode === "unavailable") b.mappings[0]!.sourceAllocationId = b.debtId;
      expect(() => buildScheduleRevisionPreview(b, scheduleSetup())).toThrow();
    }
  });
  it("never loses opening evidence when replacing an obligation", () => {
    const s = scheduleSetup();
    s.detail.installments[0]!.openingSatisfiedMinor = "100";
    const b = scheduleBody();
    b.revisionKind = "renegotiation";
    b.entries[0]!.obligationId = null;
    b.entries[0]!.replacesObligationId = s.detail.installments[0]!.obligationId;
    expect(() => buildScheduleRevisionPreview(b, s)).toThrow(
      "historical opening satisfaction",
    );
  });
  it("fully paid surviving obligations cannot become due again in renegotiation", () => {
    const s = scheduleSetup();
    s.detail.installments[0]!.remainingMinor = "0";
    s.pools[0]!.amountMinor = "110000";
    const b = scheduleBody();
    b.revisionKind = "renegotiation";
    b.mappings[0]!.amountMinor = "110000";
    b.entries[0]!.contractualMinor = "120000";
    expect(() => buildScheduleRevisionPreview(b, s)).toThrow("fully satisfied");
  });
  it("exact split maps leave explicit unapplied money without overstating payment", () => {
    const b = scheduleBody();
    b.revisionKind = "allocation_correction";
    b.entries[0]!.dueDate = parseCalendarDate("2026-10-20");
    b.mappings = [
      { ...b.mappings[0]!, amountMinor: "10000" },
      { ...b.mappings[0]!, targetEntryKey: null, amountMinor: "30000" },
    ];
    const p = buildScheduleRevisionPreview(b, scheduleSetup());
    expect(p.unappliedMinor).toBe("30000");
    expect(p.remainingMinor).toBe("100000");
  });
});
