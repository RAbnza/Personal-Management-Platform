import { z } from "zod";
import { recordExpenseInputSchema } from "./manual-financial-action";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const positiveMinor = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(12)
  .refine(
    (v) => !/^[1-9]\d*$/.test(v) || BigInt(v) <= MAX_FINANCIAL_COMPONENT_MINOR,
    "Amount exceeds the financial limit.",
  );

/** Posted purchases only. Pending authorizations have no financial command. */
export const recordCardPurchaseInputSchema = recordExpenseInputSchema
  .omit({ fundingAccountId: true })
  .extend({
    cardId: z.uuid(),
    postingDate: z
      .string()
      .refine(isCalendarDate, "Enter the provider-confirmed posting date."),
    providerReference: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullable()
      .default(null),
    purchaseMinor: positiveMinor,
    splits: z
      .array(
        z
          .object({
            amountMinor: positiveMinor,
            categoryId: z.uuid().nullable().optional(),
            memo: z.string().max(20000).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const recordCardPurchaseBodySchema = recordCardPurchaseInputSchema.omit({
  userId: true,
  workspaceId: true,
  requestId: true,
});
export type RecordCardPurchaseInput = z.input<
  typeof recordCardPurchaseInputSchema
>;
