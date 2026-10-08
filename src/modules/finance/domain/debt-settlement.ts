import { z } from "zod";
import { liabilityComponents, type DebtDetailResult } from "./debt";
import { paymentPoolSchema } from "./debt-schedule-revision";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const amount = z
  .string()
  .max(12)
  .regex(/^(?:0|[1-9]\d*)$/)
  .refine(
    (v) =>
      /^(?:0|[1-9]\d*)$/.test(v) && BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR,
  );
const positive = amount.refine(
  (v) => /^[1-9]\d*$/.test(v),
  "Enter a positive amount.",
);
const explanation = z.string().trim().min(1).max(2000);
export const settleDebtBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    debtId: z.uuid(),
    expectedDebtVersion: z.number().int().positive(),
    expectedScheduleVersionId: z.uuid(),
    expectedFinancialRevision: z
      .string()
      .max(20)
      .regex(/^(?:0|[1-9]\d*)$/),
    settlementDate: z
      .string()
      .refine(isCalendarDate, "Enter a valid settlement date."),
    settlementKind: z.enum(["normal", "early"]),
    payingAccountId: z.uuid().nullable(),
    actualCashPaidMinor: amount,
    confirmedPayoffMinor: amount,
    externalFeeMinor: amount,
    externalFeeLabel: explanation,
    externalFeeCategoryId: z.uuid().nullable(),
    liabilityPayments: z
      .array(
        z
          .object({ kind: z.enum(liabilityComponents), amountMinor: positive })
          .strict(),
      )
      .max(5),
    adjustments: z
      .array(
        z
          .object({
            kind: z.enum([
              "recognized_charge",
              "recognized_waiver",
              "avoided_future_charge",
              "rounding_correction",
            ]),
            liabilityComponent: z.enum(liabilityComponents).nullable(),
            amountMinor: positive,
            roundingTreatment: z
              .enum(["recognized_charge", "recognized_waiver"])
              .nullable()
              .default(null),
            recognizedSourcePostingId: z.uuid().nullable(),
            unknownOpening: z.boolean(),
            categoryId: z.uuid().nullable(),
            explanation,
            providerConfirmed: z.literal(true),
          })
          .strict(),
      )
      .max(30),
    dueAllocations: z
      .array(
        z.object({ installmentId: z.uuid(), amountMinor: positive }).strict(),
      )
      .max(360),
    unappliedContractualMinor: amount,
    poolMappings: z
      .array(
        z
          .object({
            paymentRevisionId: z.uuid(),
            sourceAllocationId: z.uuid().nullable(),
            targetObligationId: z.uuid().nullable(),
            amountMinor: positive,
          })
          .strict(),
      )
      .max(10000),
    unappliedResolutionNote: z.string().trim().max(2000).nullable(),
    allocationConfirmed: z.literal(true),
    confirmationSource: z.enum(["user", "provider"]),
    confirmationNote: explanation,
    acknowledgeNegativeBalance: z.boolean(),
    providerReference: z.string().trim().max(2000).nullable(),
    reason: explanation,
  })
  .strict()
  .superRefine((b, c) => {
    const issue = (path: string, message: string) =>
      c.addIssue({ code: "custom", path: [path], message });
    if (
      ![
        b.actualCashPaidMinor,
        b.confirmedPayoffMinor,
        b.externalFeeMinor,
        b.unappliedContractualMinor,
        ...b.liabilityPayments.map((p) => p.amountMinor),
        ...b.adjustments.map((p) => p.amountMinor),
        ...b.dueAllocations.map((p) => p.amountMinor),
      ].every((v) => /^(?:0|[1-9]\d*)$/.test(v))
    )
      return;
    if (
      BigInt(b.actualCashPaidMinor) !==
      BigInt(b.confirmedPayoffMinor) + BigInt(b.externalFeeMinor)
    )
      issue(
        "actualCashPaidMinor",
        "Actual cash must equal confirmed payoff plus the external fee.",
      );
    if (
      BigInt(b.actualCashPaidMinor) > 0n !== (b.payingAccountId !== null) ||
      (BigInt(b.actualCashPaidMinor) > 0n &&
        BigInt(b.confirmedPayoffMinor) === 0n)
    )
      issue(
        "payingAccountId",
        "Cash payoff requires a paying account and positive confirmed payoff; zero-cash closure uses no account.",
      );
    if (
      b.liabilityPayments.reduce((s, p) => s + BigInt(p.amountMinor), 0n) !==
      BigInt(b.confirmedPayoffMinor)
    )
      issue(
        "liabilityPayments",
        "Recognized liability payment components must equal the confirmed payoff.",
      );
    if (
      b.dueAllocations.reduce((s, p) => s + BigInt(p.amountMinor), 0n) +
        BigInt(b.unappliedContractualMinor) !==
      BigInt(b.confirmedPayoffMinor)
    )
      issue(
        "dueAllocations",
        "Contractual allocations and explicit unapplied must equal payoff, excluding external fees.",
      );
    if (
      new Set(b.liabilityPayments.map((p) => p.kind)).size !==
      b.liabilityPayments.length
    )
      issue("liabilityPayments", "Use each liability component once.");
    if (
      new Set(b.dueAllocations.map((p) => p.installmentId)).size !==
      b.dueAllocations.length
    )
      issue("dueAllocations", "Use each installment once.");
    if (
      new Set(
        b.poolMappings.map(
          (p) =>
            `${p.paymentRevisionId}/${p.sourceAllocationId}/${p.targetObligationId}`,
        ),
      ).size !== b.poolMappings.length
    )
      issue("poolMappings", "Duplicate pool mapping.");
    for (const a of b.adjustments) {
      const treatment =
        a.kind === "rounding_correction" ? a.roundingTreatment : a.kind;
      if ((a.kind === "rounding_correction") !== (a.roundingTreatment !== null))
        issue(
          "adjustments",
          "Rounding needs an explicit supported charge or waiver treatment and explanation.",
        );
      if (
        treatment === "recognized_charge" &&
        (!a.liabilityComponent ||
          !["interest", "fee", "penalty"].includes(a.liabilityComponent) ||
          a.recognizedSourcePostingId ||
          a.unknownOpening)
      )
        issue(
          "adjustments",
          "New charges require a known interest, fee or penalty classification.",
        );
      if (
        treatment === "recognized_waiver" &&
        (!a.liabilityComponent ||
          (a.unknownOpening
            ? !!a.recognizedSourcePostingId
            : !a.recognizedSourcePostingId) ||
          a.categoryId)
      )
        issue(
          "adjustments",
          "A waiver requires either a recognized charge source or disclosed imported opening treatment.",
        );
      if (
        treatment === "avoided_future_charge" &&
        (a.liabilityComponent ||
          a.recognizedSourcePostingId ||
          a.unknownOpening ||
          a.categoryId)
      )
        issue("adjustments", "Avoided future charges are metadata only.");
    }
  });
export type SettlementBody = z.output<typeof settleDebtBodySchema>;
export type SettlementInputBody = z.input<typeof settleDebtBodySchema>;
export const settlementResultSchema = z
  .object({
    debtId: z.uuid(),
    settlementId: z.uuid(),
    actionId: z.uuid(),
    actionRevisionId: z.uuid(),
    paymentId: z.uuid().nullable(),
    closingScheduleVersionId: z.uuid(),
    debtVersion: z.number().int().positive(),
    financialRevision: z.string().regex(/^\d+$/),
    lifecycle: z.enum(["settled", "settled_early"]),
  })
  .strict();
export type SettlementResult = z.infer<typeof settlementResultSchema>;
export class SettlementPreviewStaleError extends Error {
  constructor() {
    super(
      "Financial information changed. Refresh the debt and review settlement again.",
    );
    this.name = "SettlementPreviewStaleError";
  }
}
export type SettlementSetup = {
  detail: DebtDetailResult;
  frequency: "manual" | "weekly" | "monthly" | "other";
  versionNo: number;
  pools: z.infer<typeof paymentPoolSchema>[];
};
const aggregate = z.string().regex(/^(?:0|[1-9]\d*)$/);
export const settlementPreviewSchema = z.object({
  recognizedBeforeMinor: aggregate,
  newChargesMinor: aggregate,
  recognizedWaiverMinor: aggregate,
  avoidedFutureMinor: aggregate,
  actualCashPaidMinor: amount,
  confirmedPayoffMinor: amount,
  externalFeeMinor: amount,
  payingBalanceBeforeMinor: z
    .string()
    .regex(/^-?\d+$/)
    .nullable()
    .default(null),
  payingBalanceAfterMinor: z
    .string()
    .regex(/^-?\d+$/)
    .nullable()
    .default(null),
  residualMinor: z.literal("0"),
  resolvedUnappliedMinor: z.string().regex(/^\d+$/),
  cancelledRemainingMinor: z.string().regex(/^\d+$/),
  entries: z.array(
    z.object({
      obligationId: z.uuid(),
      dueDate: z.string(),
      contractualMinor: z.string(),
      openingSatisfiedMinor: z.string(),
      paymentSatisfiedMinor: z.string(),
      cancelledMinor: z.string(),
      disposition: z.enum(["scheduled", "cancelled"]),
    }),
  ),
  poolMappings: settleDebtBodySchema.shape.poolMappings,
});
export type SettlementPreview = z.infer<typeof settlementPreviewSchema>;

/** Separate accounting and contractual axes. Source pools are original evidence. */
export function settlementAdjustmentTreatment(
  a: SettlementBody["adjustments"][number],
) {
  return a.kind === "rounding_correction" ? a.roundingTreatment! : a.kind;
}
export function buildSettlementPreview(
  b: SettlementBody,
  s: SettlementSetup,
  balances: Record<string, string>,
): SettlementPreview {
  const d = s.detail.debt;
  if (
    d.version !== b.expectedDebtVersion ||
    d.scheduleVersionId !== b.expectedScheduleVersionId ||
    s.detail.financialRevision !== b.expectedFinancialRevision
  )
    throw new SettlementPreviewStaleError();
  if (d.lifecycle !== "active")
    throw new RangeError("Settlement requires an active debt.");
  if (BigInt(d.paymentClearingMinor) !== 0n)
    throw new RangeError(
      "Resolve payment clearing and advances before settlement.",
    );
  let charges = 0n,
    waivers = 0n,
    avoided = 0n;
  const residual = new Map(
    liabilityComponents.map((k) => [k, BigInt(balances[k] ?? "0")]),
  );
  for (const a of b.adjustments) {
    const v = BigInt(a.amountMinor);
    if (a.kind === "avoided_future_charge") {
      avoided += v;
      continue;
    }
    const k = a.liabilityComponent!;
    const treatment = settlementAdjustmentTreatment(a);
    residual.set(
      k,
      residual.get(k)! + (treatment === "recognized_charge" ? v : -v),
    );
    if (treatment === "recognized_charge") charges += v;
    else waivers += v;
  }
  for (const p of b.liabilityPayments)
    residual.set(p.kind, residual.get(p.kind)! - BigInt(p.amountMinor));
  if ([...residual.values()].some((v) => v !== 0n))
    throw new RangeError(
      "Settlement requires zero residual in every recognized liability component. Confirm supported charges, payment and waivers.",
    );
  const byObligation = new Map(
    s.detail.installments.map((i) => [i.obligationId, i]),
  );
  const satisfied = new Map(
    s.detail.installments.map((i) => [i.obligationId, 0n]),
  );
  const pools = new Map(
    s.pools.map((p) => [`${p.paymentRevisionId}/${p.sourceAllocationId}`, p]),
  );
  const mapped = new Map<string, bigint>();
  let unapplied = BigInt(b.unappliedContractualMinor);
  for (const m of b.poolMappings) {
    const key = `${m.paymentRevisionId}/${m.sourceAllocationId}`;
    if (!pools.has(key))
      throw new RangeError(
        "A payment source pool is unavailable for this debt.",
      );
    mapped.set(key, (mapped.get(key) ?? 0n) + BigInt(m.amountMinor));
    if (m.targetObligationId) {
      if (!byObligation.has(m.targetObligationId))
        throw new RangeError("A mapped obligation is unavailable.");
      satisfied.set(
        m.targetObligationId,
        satisfied.get(m.targetObligationId)! + BigInt(m.amountMinor),
      );
    } else unapplied += BigInt(m.amountMinor);
  }
  for (const [key, p] of pools)
    if (mapped.get(key) !== BigInt(p.amountMinor))
      throw new RangeError("Map every original payment pool exactly once.");
  for (const a of b.dueAllocations) {
    const i = s.detail.installments.find(
      (i) =>
        i.installmentId === a.installmentId && i.disposition === "scheduled",
    );
    if (!i || BigInt(a.amountMinor) > BigInt(i.remainingMinor))
      throw new RangeError(
        "Payoff allocation exceeds an available current installment.",
      );
    satisfied.set(
      i.obligationId,
      satisfied.get(i.obligationId)! + BigInt(a.amountMinor),
    );
  }
  if (unapplied > 0n && !b.unappliedResolutionNote)
    throw new RangeError(
      "Explicitly confirm that unapplied contractual pools are accepted in the final payoff, rather than unresolved advances.",
    );
  let cancelled = 0n;
  const entries = s.detail.installments.map((i) => {
    const paid = satisfied.get(i.obligationId)!;
    if (paid < BigInt(i.paymentSatisfiedMinor))
      throw new RangeError(
        "Closing mappings must preserve historical payment satisfaction.",
      );
    const remaining =
      BigInt(i.contractualMinor) - BigInt(i.openingSatisfiedMinor) - paid;
    if (remaining < 0n)
      throw new RangeError(
        "Closing allocations cannot over-satisfy an obligation.",
      );
    if (i.disposition === "scheduled") cancelled += remaining;
    return {
      obligationId: i.obligationId,
      dueDate: i.dueDate,
      contractualMinor: i.contractualMinor,
      openingSatisfiedMinor: i.openingSatisfiedMinor,
      paymentSatisfiedMinor: paid.toString(),
      cancelledMinor: remaining.toString(),
      disposition:
        remaining > 0n || i.disposition === "cancelled"
          ? ("cancelled" as const)
          : ("scheduled" as const),
    };
  });
  return settlementPreviewSchema.parse({
    recognizedBeforeMinor: d.recognizedLiabilityMinor,
    newChargesMinor: charges.toString(),
    recognizedWaiverMinor: waivers.toString(),
    avoidedFutureMinor: avoided.toString(),
    actualCashPaidMinor: b.actualCashPaidMinor,
    confirmedPayoffMinor: b.confirmedPayoffMinor,
    externalFeeMinor: b.externalFeeMinor,
    residualMinor: "0",
    resolvedUnappliedMinor: unapplied.toString(),
    cancelledRemainingMinor: cancelled.toString(),
    entries,
    poolMappings: b.poolMappings,
  });
}

export const debtSettlementReadSchema = z.object({
  settlementId: z.uuid(),
  actionId: z.uuid(),
  actionRevisionId: z.uuid(),
  paymentId: z.uuid().nullable(),
  priorScheduleVersionId: z.uuid(),
  closingScheduleVersionId: z.uuid(),
  settlementDate: z.string(),
  settlementKind: z.enum(["normal", "early"]),
  confirmedPayoffMinor: z.string(),
  actualCashPaidMinor: z.string(),
  resolvedUnappliedMinor: z.string(),
  unappliedResolutionNote: z.string().nullable(),
  providerReference: z.string().nullable(),
  reason: z.string(),
  confirmationSource: z.enum(["user", "provider"]),
  confirmationNote: z.string(),
  components: z.array(
    z.object({
      kind: z.enum([
        "recognized_charge",
        "recognized_waiver",
        "avoided_future_charge",
        "rounding_correction",
      ]),
      amountMinor: z.string(),
      liabilityComponent: z.enum(liabilityComponents).nullable(),
      recognizedSourcePostingId: z.uuid().nullable(),
      effectPostingId: z.uuid().nullable(),
      unknownOpening: z.boolean(),
      roundingTreatment: z
        .enum(["recognized_charge", "recognized_waiver"])
        .nullable(),
      explanation: z.string(),
    }),
  ),
});
export type DebtSettlementRead = z.infer<typeof debtSettlementReadSchema>;
