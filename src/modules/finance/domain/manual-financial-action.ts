import { z } from "zod";
import { isCalendarDate } from "@/shared/calendar-date";

const incomeClassSchema = z.enum(["earned", "gift", "reward", "other"]);

export const recordIncomeInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),
    acknowledgeNegativeBalance: z.boolean().default(false),

    receivingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Income effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    amountMinor: z.string().regex(/^[1-9]\d*$/, {
      message: "Income amount must be a positive minor-unit integer string.",
    }),

    incomeClass: incomeClassSchema,

    categoryId: z.uuid().nullable().optional(),

    senderName: z.string().trim().min(1).nullable().optional(),

    sourceLabel: z.string().trim().min(1).nullable().optional(),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const expenseSplitSchema = z
  .object({
    amountMinor: z.string().regex(/^[1-9]\d*$/, {
      message:
        "Expense split amount must be a positive minor-unit integer string.",
    }),

    categoryId: z.uuid().nullable().optional(),

    memo: z.string().max(20_000).nullable().optional(),
  })
  .strict();

export const recordExpenseInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),
    acknowledgeNegativeBalance: z.boolean().default(false),

    fundingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Expense effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    purchaseMinor: z.string().regex(/^[1-9]\d*$/, {
      message: "Purchase amount must be a positive minor-unit integer string.",
    }),

    splits: z.array(expenseSplitSchema).min(1),

    merchantName: z.string().trim().min(1).nullable().optional(),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const transferFeeTreatmentSchema = z.enum([
  "withheld",
  "source_additional",
  "separate",
]);

const transferFeeSchema = z
  .object({
    label: z.string().trim().min(1).max(200),

    amountMinor: z.string().regex(/^[1-9]\d*$/, {
      message:
        "Transfer fee amount must be a positive minor-unit integer string.",
    }),

    effectiveDate: z
      .string()
      .refine(isCalendarDate, {
        message: "Transfer fee date must be a valid YYYY-MM-DD calendar date.",
      })
      .optional(),

    bearingAccountId: z.uuid().optional(),

    treatment: transferFeeTreatmentSchema,

    categoryId: z.uuid().nullable().optional(),
  })
  .strict();

export const recordTransferInputSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),
    clientCommandId: z.uuid(),
    requestId: z.uuid().optional(),
    acknowledgeNegativeBalance: z.boolean().default(false),

    sourceAccountId: z.uuid(),
    destinationAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Transfer effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    destinationPrincipalMinor: z.string().regex(/^[1-9]\d*$/, {
      message:
        "Transfer principal must be a positive minor-unit integer string.",
    }),

    fees: z.array(transferFeeSchema).max(20).default([]),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();
