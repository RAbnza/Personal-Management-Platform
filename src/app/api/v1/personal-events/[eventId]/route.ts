import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  PERSONAL_EVENT_TEMPORAL_KINDS,
  PersonalEventStateError,
  PersonalEventUnavailableError,
  PersonalEventVersionConflictError,
} from "@/modules/time/domain/personal-event";
import { mutatePersonalEvent } from "@/modules/time/services/mutate-personal-event";
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
import {
  compareCalendarDates,
  isCalendarDate,
  parseCalendarDate,
} from "@/shared/calendar-date";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const personalEventParamsSchema = z
  .object({
    eventId: z.uuid(),
  })
  .strict();

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const instantSchema = z.iso.datetime({
  offset: true,
});

function nullableTrimmedText(maximumLength?: number) {
  let schema = z.string().trim().min(1);

  if (maximumLength !== undefined) {
    schema = schema.max(maximumLength);
  }

  return schema.nullable().optional();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date(0));

    return true;
  } catch {
    return false;
  }
}

const nullableReferenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Reference URL must be a valid HTTP or HTTPS URL.",
  })
  .nullable()
  .optional();

const nullableTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isIanaTimezone, {
    message: "Timezone must be a valid IANA timezone.",
  })
  .nullable()
  .optional();

const commonBodyShape = {
  clientCommandId: z.uuid(),

  expectedEventVersion: z.number().int().min(1).max(POSTGRES_INTEGER_MAX),

  reason: nullableTrimmedText(2000),
};

const editBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("edit"),

    title: z.string().trim().min(1).max(200),

    temporalKind: z.enum(PERSONAL_EVENT_TEMPORAL_KINDS),

    eventDate: calendarDateSchema.nullable().optional(),

    endDateExclusive: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),

    endsAt: instantSchema.nullable().optional(),

    timezone: nullableTimezoneSchema,

    description: nullableTrimmedText(2000),

    location: nullableTrimmedText(),

    referenceUrl: nullableReferenceUrlSchema,
  })
  .strict();

const completeBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("complete"),
  })
  .strict();

const cancelBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("cancel"),
  })
  .strict();

const mutatePersonalEventBodySchema = z
  .discriminatedUnion("action", [
    editBodySchema,
    completeBodySchema,
    cancelBodySchema,
  ])
  .superRefine((input, context) => {
    if (input.action !== "edit") {
      return;
    }

    const eventDate = input.eventDate ?? null;

    const endDateExclusive = input.endDateExclusive ?? null;

    const startsAt = input.startsAt ?? null;

    const endsAt = input.endsAt ?? null;

    const timezone = input.timezone ?? null;

    if (input.temporalKind === "date") {
      if (eventDate === null) {
        context.addIssue({
          code: "custom",

          path: ["eventDate"],

          message: "A date-only personal event requires an event date.",
        });
      }

      if (
        eventDate !== null &&
        endDateExclusive !== null &&
        isCalendarDate(eventDate) &&
        isCalendarDate(endDateExclusive) &&
        compareCalendarDates(
          parseCalendarDate(endDateExclusive),
          parseCalendarDate(eventDate),
        ) <= 0
      ) {
        context.addIssue({
          code: "custom",

          path: ["endDateExclusive"],

          message: "The exclusive end date must be later than the event date.",
        });
      }

      if (startsAt !== null) {
        context.addIssue({
          code: "custom",

          path: ["startsAt"],

          message: "A date-only personal event cannot include a start instant.",
        });
      }

      if (endsAt !== null) {
        context.addIssue({
          code: "custom",

          path: ["endsAt"],

          message: "A date-only personal event cannot include an end instant.",
        });
      }

      if (timezone !== null) {
        context.addIssue({
          code: "custom",

          path: ["timezone"],

          message: "A date-only personal event does not store a timezone.",
        });
      }

      return;
    }

    if (eventDate !== null) {
      context.addIssue({
        code: "custom",

        path: ["eventDate"],

        message:
          "A timed personal event cannot include a date-only event date.",
      });
    }

    if (endDateExclusive !== null) {
      context.addIssue({
        code: "custom",

        path: ["endDateExclusive"],

        message:
          "A timed personal event cannot include an exclusive calendar end date.",
      });
    }

    if (startsAt === null) {
      context.addIssue({
        code: "custom",

        path: ["startsAt"],

        message: "A timed personal event requires a start instant.",
      });
    }

    if (timezone === null) {
      context.addIssue({
        code: "custom",

        path: ["timezone"],

        message: "A timed personal event requires an IANA timezone.",
      });
    }

    if (
      startsAt !== null &&
      endsAt !== null &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      context.addIssue({
        code: "custom",

        path: ["endsAt"],

        message: "A timed personal event end must be later than its start.",
      });
    }
  });

type PersonalEventRouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: PersonalEventRouteContext,
): Promise<NextResponse> {
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

    const params = personalEventParamsSchema.parse(await context.params);

    const body = mutatePersonalEventBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await mutatePersonalEvent({
      userId: actorResolution.actor.userId,

      workspaceId: actorResolution.actor.workspaceId,

      eventId: params.eventId,

      clientCommandId: body.clientCommandId,

      requestId: actorResolution.actor.requestId,

      expectedEventVersion: body.expectedEventVersion,

      ...(body.action === "edit"
        ? {
            action: body.action,

            title: body.title,

            temporalKind: body.temporalKind,

            eventDate: body.eventDate,

            endDateExclusive: body.endDateExclusive,

            startsAt: body.startsAt,

            endsAt: body.endsAt,

            timezone: body.timezone,

            description: body.description,

            location: body.location,

            referenceUrl: body.referenceUrl,

            reason: body.reason,
          }
        : {
            action: body.action,

            reason: body.reason,
          }),
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof ApiJsonBodyError) {
      return createJsonBodyProblemResponse(error, requestId);
    }

    if (error instanceof z.ZodError) {
      return createSchemaValidationProblemResponse(error, requestId);
    }

    if (error instanceof CommandReceiptConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "IDEMPOTENCY_CONFLICT",

        message:
          "The client command ID has already been used for a different command.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof PersonalEventVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

        message: "The personal event changed since it was loaded.",

        fieldErrors: {
          expectedEventVersion: [
            `The current event version is ${error.currentVersion}. Reload the event before saving another change.`,
          ],
        },

        requestId,

        retryable: false,
      });
    }

    if (
      error instanceof PersonalEventUnavailableError ||
      error instanceof PrivateDomainWriteUnavailableError
    ) {
      return createApiProblemResponse({
        status: 404,

        code:
          error instanceof PersonalEventUnavailableError
            ? "PERSONAL_EVENT_UNAVAILABLE"
            : "WORKSPACE_UNAVAILABLE",

        message:
          error instanceof PersonalEventUnavailableError
            ? "The requested personal event is unavailable."
            : "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof PersonalEventStateError) {
      return createApiProblemResponse({
        status: 422,

        code: "PERSONAL_EVENT_INVALID_STATE",

        message: `This personal event is already ${error.currentStatus} and can no longer be changed by this workflow.`,

        requestId,

        retryable: false,
      });
    }

    if (error instanceof CommandReceiptStateError) {
      return createApiProblemResponse({
        status: 503,

        code: "TEMPORARY_UNAVAILABLE",

        message:
          "The command could not be resolved safely. Retry the same command ID.",

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
      `PATCH /api/v1/personal-events/:eventId failed unexpectedly. requestId=${requestId}`,
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
