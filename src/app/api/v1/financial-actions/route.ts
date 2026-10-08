import {
  recordRefund,
  recordRefundBodySchema,
} from "@/modules/finance/services/record-refund";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordBorrowingBodySchema } from "@/modules/finance/domain/borrowing";
import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import {
  FinancialAccountReferenceUnavailableError,
  FinancialCategoryReferenceUnavailableError,
} from "@/modules/finance/domain/financial-reference";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { recordBorrowing } from "@/modules/finance/services/record-borrowing";
import { recordExpense } from "@/modules/finance/services/record-expense";
import { recordIncome } from "@/modules/finance/services/record-income";
import { recordTransfer } from "@/modules/finance/services/record-transfer";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createMutationOriginProblemResponse,
  createSchemaValidationProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { isCalendarDate } from "@/shared/calendar-date";
import { MAX_FINANCIAL_COMPONENT_MINOR } from "@/shared/money";

const MAX_FINANCIAL_COMPONENT_MINOR_TEXT =
  MAX_FINANCIAL_COMPONENT_MINOR.toString();

const positiveFinancialMinorStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, {
    message: "Amount must be a positive minor-unit integer string.",
  })
  .refine(
    (value) => {
      if (!/^[1-9]\d*$/.test(value)) {
        return true;
      }

      if (value.length < MAX_FINANCIAL_COMPONENT_MINOR_TEXT.length) {
        return true;
      }

      if (value.length > MAX_FINANCIAL_COMPONENT_MINOR_TEXT.length) {
        return false;
      }

      return value <= MAX_FINANCIAL_COMPONENT_MINOR_TEXT;
    },
    {
      message: `Amount must not exceed ${MAX_FINANCIAL_COMPONENT_MINOR_TEXT} minor units.`,
    },
  );

const incomeFinancialActionBodySchema = z
  .object({
    acknowledgeNegativeBalance: z.boolean().default(false),
    actionKind: z.literal("income"),

    clientCommandId: z.uuid(),

    receivingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Income effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    amountMinor: positiveFinancialMinorStringSchema,

    incomeClass: z.enum(["earned", "gift", "reward", "other"]),

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
    amountMinor: positiveFinancialMinorStringSchema,

    categoryId: z.uuid().nullable().optional(),

    memo: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const expenseFinancialActionBodySchema = z
  .object({
    acknowledgeNegativeBalance: z.boolean().default(false),
    actionKind: z.literal("expense"),

    clientCommandId: z.uuid(),

    fundingAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Expense effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    purchaseMinor: positiveFinancialMinorStringSchema,

    splits: z.array(expenseSplitSchema).min(1),

    merchantName: z.string().trim().min(1).nullable().optional(),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

const transferFeeSchema = z
  .object({
    label: z.string().trim().min(1).max(200),

    amountMinor: positiveFinancialMinorStringSchema,

    effectiveDate: z
      .string()
      .refine(isCalendarDate, {
        message: "Transfer fee date must be a valid YYYY-MM-DD calendar date.",
      })
      .optional(),

    bearingAccountId: z.uuid().optional(),

    treatment: z.enum(["withheld", "source_additional", "separate"]),

    categoryId: z.uuid().nullable().optional(),
  })
  .strict();

const transferFinancialActionBodySchema = z
  .object({
    acknowledgeNegativeBalance: z.boolean().default(false),
    actionKind: z.literal("transfer"),

    clientCommandId: z.uuid(),

    sourceAccountId: z.uuid(),

    destinationAccountId: z.uuid(),

    effectiveDate: z.string().refine(isCalendarDate, {
      message:
        "Transfer effective date must be a valid YYYY-MM-DD calendar date.",
    }),

    destinationPrincipalMinor: positiveFinancialMinorStringSchema,

    fees: z.array(transferFeeSchema).max(20).default([]),

    description: z.string().trim().min(1).max(2000),

    reference: z.string().trim().min(1).nullable().optional(),

    notes: z.string().max(20_000).nullable().optional(),
  })
  .strict();

/**
 * The original S1 command surface remains a discriminated union.
 *
 * Borrowing has more cross-field validation than the S1 shapes and its
 * authoritative schema already lives in the finance domain. We identify the
 * discriminator first, then hand the remaining borrowing payload to that
 * domain schema instead of duplicating its validation here.
 */
const standardFinancialActionBodySchema = z.discriminatedUnion("actionKind", [
  incomeFinancialActionBodySchema,
  expenseFinancialActionBodySchema,
  transferFinancialActionBodySchema,
]);

const financialActionKindEnvelopeSchema = z
  .object({
    actionKind: z.enum([
      "income",
      "expense",
      "transfer",
      "borrowing",
      "refund",
    ]),
  })
  .passthrough();

const borrowingFinancialActionEnvelopeSchema = z
  .object({
    actionKind: z.literal("borrowing"),
  })
  .passthrough();

/**
 * Record an actual financial action in the authenticated workspace.
 *
 * Ownership and audit request attribution are derived exclusively from
 * ActorContext. The browser cannot supply userId, workspaceId or requestId.
 *
 * SYSTEM_ARCHITECTURE.md defines this route as the discriminated command
 * surface for income, expense, transfer and borrowing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const originProblem = createMutationOriginProblemResponse(
      request,
      requestId,
    );

    if (originProblem) {
      return originProblem;
    }

    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const rawBody = await readApiJsonBody(request);

    const actionKind =
      financialActionKindEnvelopeSchema.parse(rawBody).actionKind;

    if (actionKind === "refund") {
      const envelope = z
        .object({ actionKind: z.literal("refund") })
        .passthrough()
        .parse(rawBody);
      const { actionKind: _kind, ...candidate } = envelope;
      void _kind;
      const result = await recordRefund({
        ...recordRefundBodySchema.parse(candidate),
        userId: actorResolution.actor.userId,
        workspaceId: actorResolution.actor.workspaceId,
        requestId: actorResolution.actor.requestId,
      });
      return createApiJsonResponse(
        { actionKind: "refund", ...result },
        201,
        requestId,
      );
    }
    if (actionKind === "borrowing") {
      const borrowingEnvelope =
        borrowingFinancialActionEnvelopeSchema.parse(rawBody);

      /*
       * The API discriminator belongs to the shared financial-action route,
       * while recordBorrowingBodySchema deliberately models only borrowing
       * business intent.
       */
      const borrowingCandidate: Record<string, unknown> = {
        ...borrowingEnvelope,
      };

      delete borrowingCandidate.actionKind;

      const body = recordBorrowingBodySchema.parse(borrowingCandidate);

      const result = await recordBorrowing({
        ...body,

        userId: actorResolution.actor.userId,

        workspaceId: actorResolution.actor.workspaceId,

        requestId: actorResolution.actor.requestId,
      });

      return createApiJsonResponse(
        {
          actionKind: "borrowing",

          ...result,
        },
        201,
        requestId,
      );
    }

    const body = standardFinancialActionBodySchema.parse(rawBody);

    switch (body.actionKind) {
      case "income": {
        const result = await recordIncome({
          userId: actorResolution.actor.userId,

          workspaceId: actorResolution.actor.workspaceId,

          clientCommandId: body.clientCommandId,

          acknowledgeNegativeBalance: body.acknowledgeNegativeBalance,

          requestId: actorResolution.actor.requestId,

          receivingAccountId: body.receivingAccountId,

          effectiveDate: body.effectiveDate,

          amountMinor: body.amountMinor,

          incomeClass: body.incomeClass,

          categoryId: body.categoryId,

          senderName: body.senderName,

          sourceLabel: body.sourceLabel,

          description: body.description,

          reference: body.reference,

          notes: body.notes,
        });

        return createApiJsonResponse(
          {
            actionKind: "income",

            ...result,
          },
          201,
          requestId,
        );
      }

      case "expense": {
        const result = await recordExpense({
          userId: actorResolution.actor.userId,

          workspaceId: actorResolution.actor.workspaceId,

          clientCommandId: body.clientCommandId,

          acknowledgeNegativeBalance: body.acknowledgeNegativeBalance,

          requestId: actorResolution.actor.requestId,

          fundingAccountId: body.fundingAccountId,

          effectiveDate: body.effectiveDate,

          purchaseMinor: body.purchaseMinor,

          splits: body.splits,

          merchantName: body.merchantName,

          description: body.description,

          reference: body.reference,

          notes: body.notes,
        });

        return createApiJsonResponse(
          {
            actionKind: "expense",

            ...result,
          },
          201,
          requestId,
        );
      }

      case "transfer": {
        const result = await recordTransfer({
          userId: actorResolution.actor.userId,

          workspaceId: actorResolution.actor.workspaceId,

          clientCommandId: body.clientCommandId,

          acknowledgeNegativeBalance: body.acknowledgeNegativeBalance,

          requestId: actorResolution.actor.requestId,

          sourceAccountId: body.sourceAccountId,

          destinationAccountId: body.destinationAccountId,

          effectiveDate: body.effectiveDate,

          destinationPrincipalMinor: body.destinationPrincipalMinor,

          fees: body.fees,

          description: body.description,

          reference: body.reference,

          notes: body.notes,
        });

        return createApiJsonResponse(
          {
            actionKind: "transfer",

            ...result,
          },
          201,
          requestId,
        );
      }
    }
  } catch (error) {
    if (error instanceof ApiJsonBodyError) {
      return createJsonBodyProblemResponse(error, requestId);
    }

    if (error instanceof z.ZodError) {
      return createSchemaValidationProblemResponse(error, requestId);
    }

    if (error instanceof FinancialCommandConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "IDEMPOTENCY_CONFLICT",

        message:
          "The client command ID has already been used for a different command.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialWriteWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",

        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialAccountReferenceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "FINANCIAL_ACCOUNT_UNAVAILABLE",

        message: "The selected financial account is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialCategoryReferenceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "FINANCIAL_CATEGORY_UNAVAILABLE",

        message: "The selected financial category is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof FinancialCommandStateError) {
      return createApiProblemResponse({
        status: 503,

        code: "TEMPORARY_UNAVAILABLE",

        message:
          "The financial command could not be resolved safely. Retry the same command ID.",

        requestId,

        retryable: true,
      });
    }

    if (error instanceof RangeError) {
      return createApiProblemResponse({
        status: 422,

        code: "BUSINESS_RULE_VIOLATION",

        message: error.message,

        requestId,

        retryable: false,
      });
    }

    console.error(
      `POST /api/v1/financial-actions failed unexpectedly. requestId=${requestId}`,
    );

    return createApiProblemResponse({
      status: 500,

      code: "INTERNAL_ERROR",

      message:
        "The request could not be completed because of an unexpected server error.",

      requestId,

      retryable: false,
    });
  }
}
