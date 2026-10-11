import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";
import { statementIdentifierSchema as id } from "./card-statement";

const date = z.string().refine(isCalendarDate, "Enter a real calendar date.");
const isCardAmount = (value: string) =>
  value.length <= 12 &&
  /^[1-9]\d*$/.test(value) &&
  BigInt(value) <= MAX_FINANCIAL_COMPONENT_MINOR;
export const cardAmount = z
  .string()
  .max(12)
  .regex(/^[1-9]\d*$/)
  .refine(
    (v) =>
      !/^[1-9]\d*$/.test(v) ||
      (v.length <= 12 && BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR),
    "Amount exceeds the financial limit.",
  );
export const cardCommandIntentSchema = z
  .object({
    actionKind: z.enum([
      "card_payment",
      "card_fee",
      "card_interest",
      "card_refund",
    ]),
    cardId: id,
    effectiveDate: date,
    postingDate: date,
    amountMinor: cardAmount,
    description: z.string().trim().min(1).max(2000),
    providerReference: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullable()
      .default(null),
    reference: z.string().trim().min(1).max(2000).nullable().default(null),
    notes: z.string().max(20000).nullable().default(null),
    providerConfirmed: z.literal(true),
    confirmationSource: z.string().trim().min(1).max(2000),
    payingAccountId: id.nullable().default(null),
    categoryId: id.nullable().default(null),
    purchaseActionId: id.nullable().default(null),
    refundParts: z
      .array(
        z
          .object({ originalPurchasePostingId: id, amountMinor: cardAmount })
          .strict(),
      )
      .max(100)
      .default([]),
    acknowledgeNegativeBalance: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    if (v.actionKind === "card_payment") {
      if (
        !v.payingAccountId ||
        v.categoryId ||
        v.purchaseActionId ||
        v.refundParts.length
      )
        fail(
          "A payment requires one cash account and no spending classification.",
        );
    } else if (v.payingAccountId) fail("Only a payment moves cash.");
    if (
      v.actionKind !== "card_refund" &&
      (v.purchaseActionId || v.refundParts.length)
    )
      fail("Only refunds link purchase portions.");
    if (v.actionKind === "card_refund") {
      if (v.purchaseActionId) {
        if (
          !v.refundParts.length ||
          v.categoryId ||
          (isCardAmount(v.amountMinor) &&
            v.refundParts.every((p) => isCardAmount(p.amountMinor)) &&
            v.refundParts.reduce((s, p) => s + BigInt(p.amountMinor), 0n) !==
              BigInt(v.amountMinor))
        )
          fail(
            "Linked refund portions must total the refund and preserve original categories.",
          );
        if (
          new Set(v.refundParts.map((p) => p.originalPurchasePostingId))
            .size !== v.refundParts.length
        )
          fail("Use each original purchase portion once.");
      } else if (v.refundParts.length)
        fail("Refund portions require an originating purchase.");
    }
  });
export const recordCardCommandBodySchema = cardCommandIntentSchema.safeExtend({
  clientCommandId: id,
});
export const cardAllocationBodySchema = z
  .object({
    clientCommandId: id,
    statementRevisionId: id,
    sourceActionRevisionId: id,
    amountMinor: cardAmount,
    confirmationKind: z.enum(["provider", "user"]),
    confirmationSource: z.string().trim().min(1).max(2000),
    confirmedDate: date,
  })
  .strict();
export const reverseCardAllocationBodySchema = z
  .object({
    clientCommandId: id,
    allocationId: id,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export class CardEvidenceConflictError extends Error {
  constructor(
    message = "Card evidence changed. Reload and confirm the supported amounts again.",
  ) {
    super(message);
    this.name = "CardEvidenceConflictError";
  }
}
export class CardEvidenceUnavailableError extends Error {
  constructor() {
    super("The requested private card evidence is unavailable.");
    this.name = "CardEvidenceUnavailableError";
  }
}
export type CardCommandIntent = z.output<typeof cardCommandIntentSchema>;
