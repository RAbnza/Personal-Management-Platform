import { z } from "zod";

import { isCalendarDate } from "@/shared/calendar-date";
import { parseMinorUnits } from "@/shared/money";

export const cardActivityKindSchema = z.enum([
  "purchase",
  "payment",
  "fee",
  "interest",
  "refund",
  "opening",
  "adjustment",
]);

export const RESERVED_CARD_ACTION_KINDS = [
  "opening_card",
  "card_purchase",
  "card_payment",
  "card_fee",
  "card_interest",
  "card_refund",
  "card_adjustment",
] as const;

/** A provider limit is metadata, not a bounded journal component. Keep the
 * full nonnegative PostgreSQL bigint range without passing through Number. */
const creditLimitSchema = z
  .string()
  .max(19)
  .regex(/^(?:0|[1-9]\d*)$/)
  .refine(
    (value) =>
      /^(?:0|[1-9]\d*)$/.test(value) &&
      value.length <= 19 &&
      BigInt(value) <= 9_223_372_036_854_775_807n,
    { message: "Credit limit exceeds the database integer range." },
  );

export const creditCardMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    issuerName: z.string().trim().min(1).max(200),
    creditLimitMinor: creditLimitSchema.nullable().default(null),
    limitVerifiedDate: z
      .string()
      .refine(isCalendarDate)
      .nullable()
      .default(null),
    notes: z.string().max(20_000).nullable().default(null),
  })
  .strict();

const commandContext = {
  userId: z.uuid(),
  workspaceId: z.uuid(),
  clientCommandId: z.uuid(),
  requestId: z.uuid().optional(),
};

export const createCreditCardInputSchema =
  creditCardMetadataSchema.extend(commandContext);
export const updateCreditCardInputSchema = creditCardMetadataSchema.extend({
  ...commandContext,
  cardId: z.uuid(),
  expectedVersion: z.number().int().min(1).max(2_147_483_646),
  archived: z.boolean(),
});

export type CreditCardMetadata = z.output<typeof creditCardMetadataSchema>;
export type CreateCreditCardInput = z.input<typeof createCreditCardInputSchema>;
export type UpdateCreditCardInput = z.input<typeof updateCreditCardInputSchema>;

export class CreditCardUnavailableError extends Error {
  readonly code = "CREDIT_CARD_UNAVAILABLE";
  constructor() {
    super("The credit card is unavailable.");
    this.name = "CreditCardUnavailableError";
  }
}

export class CreditCardVersionConflictError extends Error {
  readonly code = "CREDIT_CARD_VERSION_CONFLICT";
  constructor() {
    super("The credit card changed. Refresh before saving.");
    this.name = "CreditCardVersionConflictError";
  }
}

/** Credit-normal ledger position, including every original/reversal/replacement.
 * A credit is disclosed separately and never becomes liquid cash. */
export function deriveCardPosition(signedLedgerMinor: string) {
  const signed = parseMinorUnits(signedLedgerMinor);
  return {
    postedOutstandingMinor: (signed < 0n ? -signed : 0n).toString(),
    cardCreditMinor: (signed > 0n ? signed : 0n).toString(),
  };
}
