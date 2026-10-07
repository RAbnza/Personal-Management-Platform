import { NextResponse } from "next/server";
import { z } from "zod";

import {
  APPLICATION_EVENT_TEMPORAL_KINDS,
  ApplicationEventStateError,
  ApplicationEventUnavailableError,
  ApplicationEventVersionConflictError,
} from "@/modules/career/domain/application-event";
import {
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import { mutateApplicationEvent } from "@/modules/career/services/mutate-application-event";
import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
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

const POSTGRES_INTEGER_MAX = 2_147_483_647;

const applicationEventParamsSchema = z
  .object({
    applicationId: z.uuid(),
    eventId: z.uuid(),
  })
  .strict();

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const instantSchema = z.iso.datetime({
  offset: true,
});

function nullableTrimmedText(maximumLength: number) {
  return z.string().trim().min(1).max(maximumLength).nullable().optional();
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

const rescheduleBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("reschedule"),

    temporalKind: z.enum(APPLICATION_EVENT_TEMPORAL_KINDS),

    eventDate: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),

    endsAt: instantSchema.nullable().optional(),

    timezone: nullableTimezoneSchema,
  })
  .strict();

const completeBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("complete"),

    outcomeNotes: nullableTrimmedText(20_000),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    replacementNextActionEventId: z.uuid().nullable().optional(),
  })
  .strict();

const cancelBodySchema = z
  .object({
    ...commonBodyShape,

    action: z.literal("cancel"),

    outcomeNotes: nullableTrimmedText(20_000),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),

    replacementNextActionEventId: z.uuid().nullable().optional(),
  })
  .strict();

const mutateApplicationEventBodySchema = z
  .discriminatedUnion("action", [
    rescheduleBodySchema,
    completeBodySchema,
    cancelBodySchema,
  ])
  .superRefine((input, context) => {
    if (input.action !== "reschedule") {
      return;
    }

    const eventDate = input.eventDate ?? null;
    const startsAt = input.startsAt ?? null;
    const endsAt = input.endsAt ?? null;
    const timezone = input.timezone ?? null;

    if (input.temporalKind === "date") {
      if (eventDate === null) {
        context.addIssue({
          code: "custom",
          path: ["eventDate"],
          message: "A date-only application event requires an event date.",
        });
      }

      if (startsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["startsAt"],
          message:
            "A date-only application event cannot include a start instant.",
        });
      }

      if (endsAt !== null) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message:
            "A date-only application event cannot include an end instant.",
        });
      }

      if (timezone !== null) {
        context.addIssue({
          code: "custom",
          path: ["timezone"],
          message: "A date-only application event does not store a timezone.",
        });
      }

      return;
    }

    if (eventDate !== null) {
      context.addIssue({
        code: "custom",
        path: ["eventDate"],
        message:
          "A timed application event cannot include a date-only event date.",
      });
    }

    if (startsAt === null) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A timed application event requires a start instant.",
      });
    }

    if (timezone === null) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "A timed application event requires an IANA timezone.",
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
        message: "A timed application event end must be later than its start.",
      });
    }
  });

type ApplicationEventRouteContext = {
  params: Promise<{
    applicationId: string;
    eventId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: ApplicationEventRouteContext,
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

    const params = applicationEventParamsSchema.parse(await context.params);

    const body = mutateApplicationEventBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await mutateApplicationEvent({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      applicationId: params.applicationId,
      eventId: params.eventId,

      clientCommandId: body.clientCommandId,
      requestId: actorResolution.actor.requestId,

      expectedEventVersion: body.expectedEventVersion,

      ...(body.action === "reschedule"
        ? {
            action: body.action,

            temporalKind: body.temporalKind,

            eventDate: body.eventDate,

            startsAt: body.startsAt,
            endsAt: body.endsAt,
            timezone: body.timezone,

            reason: body.reason,
          }
        : {
            action: body.action,

            outcomeNotes: body.outcomeNotes,

            expectedApplicationVersion: body.expectedApplicationVersion,

            replacementNextActionEventId: body.replacementNextActionEventId,

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

    if (error instanceof ApplicationEventVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

        message: "The Career event changed since it was loaded.",

        fieldErrors: {
          expectedEventVersion: [
            `The current event version is ${error.currentVersion}. Reload the application before changing this event.`,
          ],
        },

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

        message: "The job application changed since it was loaded.",

        fieldErrors: {
          expectedApplicationVersion: [
            `The current application version is ${error.currentVersion}. Reload the application before changing its next action.`,
          ],
        },

        requestId,

        retryable: false,
      });
    }

    if (
      error instanceof ApplicationEventUnavailableError ||
      error instanceof JobApplicationUnavailableError ||
      error instanceof PrivateDomainWriteUnavailableError
    ) {
      return createApiProblemResponse({
        status: 404,

        code:
          error instanceof ApplicationEventUnavailableError
            ? "APPLICATION_EVENT_UNAVAILABLE"
            : error instanceof JobApplicationUnavailableError
              ? "APPLICATION_UNAVAILABLE"
              : "WORKSPACE_UNAVAILABLE",

        message:
          error instanceof ApplicationEventUnavailableError
            ? "The requested Career event is unavailable."
            : error instanceof JobApplicationUnavailableError
              ? "The requested job application is unavailable."
              : "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationArchivedError) {
      return createApiProblemResponse({
        status: 422,

        code: "APPLICATION_ARCHIVED",

        message: "Events on an archived job application cannot be changed.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof ApplicationEventStateError) {
      return createApiProblemResponse({
        status: 422,

        code: "APPLICATION_EVENT_INVALID_STATE",

        message: `This Career event is already ${error.currentStatus} and can no longer be changed by this workflow.`,

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
      `PATCH /api/v1/applications/:applicationId/events/:eventId failed unexpectedly. requestId=${requestId}`,
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
