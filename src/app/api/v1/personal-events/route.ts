import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import { PERSONAL_EVENT_TEMPORAL_KINDS } from "@/modules/time/domain/personal-event";
import { createPersonalEvent } from "@/modules/time/services/create-personal-event";
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

const createPersonalEventBodySchema = z
  .object({
    clientCommandId: z.uuid(),

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
  .strict()
  .superRefine((input, context) => {
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

    const body = createPersonalEventBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await createPersonalEvent({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,
      requestId: actorResolution.actor.requestId,

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
    });

    return createApiJsonResponse(result, 201, requestId);
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

    if (error instanceof PrivateDomainWriteUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",

        message: "The requested private workspace is unavailable.",

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
      `POST /api/v1/personal-events failed unexpectedly. requestId=${requestId}`,
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
