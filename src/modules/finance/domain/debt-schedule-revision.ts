import { z } from "zod";
import { importedInstallmentSchema, type DebtDetailResult } from "./debt";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const date = z.string().refine(isCalendarDate, "Enter a valid calendar date.");
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
export const revisionEntrySchema = z
  .object({
    entryKey: z.uuid(),
    obligationId: z.uuid().nullable(),
    replacesObligationId: z.uuid().nullable().default(null),
    dueDate: date,
    contractualMinor: positive,
    knownPrincipalMinor: amount.nullable().default(null),
    knownInterestMinor: amount.nullable().default(null),
    knownFeeMinor: amount.nullable().default(null),
    breakdownComplete: z.boolean().default(false),
    disposition: z.enum(["scheduled", "cancelled"]).default("scheduled"),
    cancellationReason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullable()
      .default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((row, ctx) => {
    const parsed = importedInstallmentSchema.safeParse({
      dueDate: row.dueDate,
      contractualMinor: row.contractualMinor,
      knownPrincipalMinor: row.knownPrincipalMinor,
      knownInterestMinor: row.knownInterestMinor,
      knownFeeMinor: row.knownFeeMinor,
      breakdownComplete: row.breakdownComplete,
      notes: row.notes,
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
    if ((row.disposition === "cancelled") !== (row.cancellationReason !== null))
      ctx.addIssue({
        code: "custom",
        path: ["cancellationReason"],
        message:
          "Cancelled obligations require a reason; scheduled obligations cannot have one.",
      });
    if (row.obligationId && row.replacesObligationId)
      ctx.addIssue({
        code: "custom",
        message:
          "A surviving obligation cannot also replace another obligation.",
      });
  });
export const revisionMapSchema = z
  .object({
    paymentRevisionId: z.uuid(),
    sourceAllocationId: z.uuid().nullable(),
    targetEntryKey: z.uuid().nullable(),
    amountMinor: positive,
  })
  .strict();
export const reviseDebtScheduleBodySchema = z
  .object({
    clientCommandId: z.uuid(),
    debtId: z.uuid(),
    expectedDebtVersion: z.number().int().positive(),
    expectedScheduleVersionId: z.uuid(),
    expectedFinancialRevision: z.string().regex(/^\d+$/),
    effectiveDate: date,
    revisionKind: z.enum([
      "date_correction",
      "renegotiation",
      "allocation_correction",
    ]),
    reason: z.string().trim().min(1).max(2000),
    frequency: z.enum(["manual", "weekly", "monthly", "other"]),
    entries: z.array(revisionEntrySchema).max(360),
    mappings: z.array(revisionMapSchema).max(10000),
    allocationMappingConfirmed: z.literal(true),
    recognizedCharge: z
      .object({
        kind: z.enum(["interest", "fee", "penalty"]),
        amountMinor: positive,
        categoryId: z.uuid().nullable().default(null),
        explanation: z.string().trim().min(1).max(2000),
        providerConfirmed: z.literal(true),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      new Set(body.entries.map((e) => e.entryKey)).size !==
        body.entries.length ||
      new Set(
        body.entries.flatMap((e) => (e.obligationId ? [e.obligationId] : [])),
      ).size !== body.entries.filter((e) => e.obligationId).length
    )
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message:
          "Entry keys and surviving obligation identities must be unique.",
      });
    const paths = body.mappings.map(
      (m) =>
        `${m.paymentRevisionId}:${m.sourceAllocationId}:${m.targetEntryKey}`,
    );
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({
        code: "custom",
        path: ["mappings"],
        message: "Combine duplicate mapping paths.",
      });
    if (body.recognizedCharge && body.revisionKind !== "renegotiation")
      ctx.addIssue({
        code: "custom",
        path: ["recognizedCharge"],
        message:
          "Corrections cannot recognize a new charge. Use an explicitly reviewed renegotiation.",
      });
  });
export type RevisionBody = z.output<typeof reviseDebtScheduleBodySchema>;
export type RevisionEntry = RevisionBody["entries"][number];
export type RevisionMap = RevisionBody["mappings"][number];
export const revisionResultSchema = z.object({
  debtId: z.uuid(),
  scheduleVersionId: z.uuid(),
  scheduleVersionNo: z.number().int().positive(),
  debtVersion: z.number().int().positive(),
  financialRevision: z.string().regex(/^\d+$/),
  chargeActionId: z.uuid().nullable(),
});
export type RevisionResult = z.infer<typeof revisionResultSchema>;
export class SchedulePreviewStaleError extends Error {
  constructor() {
    super(
      "The debt or its payment allocations changed. Reload the current schedule and review a new revision.",
    );
    this.name = "SchedulePreviewStaleError";
  }
}
export const paymentPoolSchema = z.object({
  paymentRevisionId: z.uuid(),
  sourceAllocationId: z.uuid().nullable(),
  amountMinor: z.string(),
  paymentDate: z.string(),
  sourceDueDate: z.string().nullable(),
  currentTargets: z.array(
    z.object({ obligationId: z.uuid().nullable(), amountMinor: z.string() }),
  ),
});
export type PaymentPool = z.infer<typeof paymentPoolSchema>;
export type ScheduleRevisionSetup = {
  detail: DebtDetailResult;
  frequency: RevisionBody["frequency"];
  pools: PaymentPool[];
};
export function poolKey(
  pool: Pick<PaymentPool, "paymentRevisionId" | "sourceAllocationId">,
) {
  return `${pool.paymentRevisionId}:${pool.sourceAllocationId ?? "unapplied"}`;
}

/** All arithmetic is exact. Opening evidence is owned by the predecessor,
 * while each current payment's ORIGINAL sources are projected exactly once. */
export function buildScheduleRevisionPreview(
  body: RevisionBody,
  setup: ScheduleRevisionSetup,
) {
  const old = setup.detail.installments;
  const existing = new Map(old.map((i) => [i.obligationId, i]));
  for (const e of body.entries) {
    if (
      (e.obligationId && !existing.has(e.obligationId)) ||
      (e.replacesObligationId && !existing.has(e.replacesObligationId))
    )
      throw new RangeError(
        "An obligation is unavailable in this debt's current schedule.",
      );
    if (e.dueDate < setup.detail.debt.startDate)
      throw new RangeError("A due date cannot precede the debt start date.");
    if (
      e.replacesObligationId &&
      body.entries.some(
        (other) => other.obligationId === e.replacesObligationId,
      )
    )
      throw new RangeError(
        "A replaced obligation cannot also survive in the new schedule.",
      );
  }
  for (const i of old) {
    const survivor = body.entries.find(
      (e) => e.obligationId === i.obligationId,
    );
    if (
      !survivor &&
      (BigInt(i.openingSatisfiedMinor) > 0n ||
        !body.entries.some((e) => e.replacesObligationId === i.obligationId))
    )
      throw new RangeError(
        "Retain historical opening satisfaction. Other removed obligations require an explicit replacement or cancellation.",
      );
    if (body.revisionKind !== "renegotiation" && !survivor)
      throw new RangeError("Corrections must retain the same obligations.");
    if (survivor && body.revisionKind !== "renegotiation") {
      const fields = [
        "contractualMinor",
        "knownPrincipalMinor",
        "knownInterestMinor",
        "knownFeeMinor",
        "breakdownComplete",
        "disposition",
        "cancellationReason",
      ] as const;
      if (
        fields.some((k) => survivor[k] !== i[k]) ||
        (body.revisionKind === "allocation_correction" &&
          survivor.dueDate !== i.dueDate)
      )
        throw new RangeError(
          "This correction must preserve existing contractual terms.",
        );
    }
  }
  if (
    body.revisionKind !== "renegotiation" &&
    (body.entries.length !== old.length || body.frequency !== setup.frequency)
  )
    throw new RangeError(
      "Corrections must preserve obligations and schedule frequency.",
    );
  const pools = new Map(setup.pools.map((p) => [poolKey(p), p]));
  const totals = new Map<string, bigint>();
  const paid = new Map<string, bigint>();
  const targets = new Map(body.entries.map((e) => [e.entryKey, e]));
  const projected = new Map<string, Map<string | null, bigint>>();
  let unapplied = 0n;
  for (const m of body.mappings) {
    const source = poolKey(m);
    if (!pools.has(source))
      throw new RangeError(
        "A payment source is unavailable in this debt's current allocation snapshot.",
      );
    totals.set(source, (totals.get(source) ?? 0n) + BigInt(m.amountMinor));
    if (m.targetEntryKey) {
      const e = targets.get(m.targetEntryKey);
      if (!e || e.disposition !== "scheduled")
        throw new RangeError(
          "Mappings must target a scheduled entry in this revision or explicit unapplied funds.",
        );
      paid.set(
        e.entryKey,
        (paid.get(e.entryKey) ?? 0n) + BigInt(m.amountMinor),
      );
    } else unapplied += BigInt(m.amountMinor);
    if (body.revisionKind === "date_correction") {
      const id = m.targetEntryKey
        ? targets.get(m.targetEntryKey)!.obligationId
        : null;
      const projection =
        projected.get(source) ?? new Map<string | null, bigint>();
      projection.set(id, (projection.get(id) ?? 0n) + BigInt(m.amountMinor));
      projected.set(source, projection);
    }
  }
  for (const [key, p] of pools)
    if (totals.get(key) !== BigInt(p.amountMinor))
      throw new RangeError(
        "Map every original allocation and unapplied pool exactly once and in full.",
      );
  if (body.revisionKind === "date_correction")
    for (const p of setup.pools) {
      const before = new Map(
        p.currentTargets.map((t) => [t.obligationId, BigInt(t.amountMinor)]),
      );
      const after =
        projected.get(poolKey(p)) ?? new Map<string | null, bigint>();
      if (
        before.size !== after.size ||
        [...before].some(([key, value]) => after.get(key) !== value)
      )
        throw new RangeError(
          "Date corrections must preserve each payment's allocation by obligation.",
        );
    }
  const entries = body.entries.map((e) => {
    const predecessor = e.obligationId
      ? existing.get(e.obligationId)
      : undefined;
    const opening = BigInt(predecessor?.openingSatisfiedMinor ?? "0");
    const payment = paid.get(e.entryKey) ?? 0n;
    const remaining =
      e.disposition === "cancelled"
        ? 0n
        : BigInt(e.contractualMinor) - opening - payment;
    if (BigInt(e.contractualMinor) < opening || remaining < 0n)
      throw new RangeError(
        "Carried satisfaction exceeds an installment. Map excess explicitly to another entry or unapplied funds.",
      );
    if (
      body.revisionKind === "renegotiation" &&
      predecessor?.disposition === "scheduled" &&
      predecessor.remainingMinor === "0" &&
      (e.contractualMinor !== predecessor.contractualMinor || remaining !== 0n)
    )
      throw new RangeError(
        "A fully satisfied surviving obligation must remain satisfied. New terms require a new obligation identity.",
      );
    return {
      ...e,
      openingSatisfiedMinor: opening.toString(),
      paymentSatisfiedMinor: payment.toString(),
      remainingMinor: remaining.toString(),
    };
  });
  return {
    entries,
    unappliedMinor: unapplied.toString(),
    remainingMinor: entries
      .reduce((sum, e) => sum + BigInt(e.remainingMinor), 0n)
      .toString(),
    recognizedChargeMinor: body.recognizedCharge?.amountMinor ?? "0",
  };
}
