import { NextResponse } from "next/server";
import { z } from "zod";

import {
  APPLICATION_EVENT_TEMPORAL_KINDS,
  CAREER_ACTIONABLE_EVENT_KINDS,
} from "@/modules/career/domain/application-event";
import {
  JobApplicationArchivedError,
  JobApplicationUnavailableError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import { createApplicationEvent } from "@/modules/career/services/create-application-event";
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

const applicationParamsSchema = z
  .object({
    applicationId: z.uuid(),
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

const nullableMeetingUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Meeting URL must be a valid HTTP or HTTPS URL.",
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

const createApplicationEventBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    eventKind: z.enum(CAREER_ACTIONABLE_EVENT_KINDS),

    title: z.string().trim().min(1).max(200),

    temporalKind: z.enum(APPLICATION_EVENT_TEMPORAL_KINDS),

    eventDate: calendarDateSchema.nullable().optional(),

    startsAt: instantSchema.nullable().optional(),

    endsAt: instantSchema.nullable().optional(),

    timezone: nullableTimezoneSchema,

    location: nullableTrimmedText(500),

    meetingUrl: nullableMeetingUrlSchema,

    preparationNotes: nullableTrimmedText(20_000),

    setAsNextAction: z.boolean().default(false),

    expectedApplicationVersion: z
      .number()
      .int()
      .min(1)
      .max(POSTGRES_INTEGER_MAX)
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
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
    }

    if (input.temporalKind === "timed") {
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
          message:
            "A timed application event end must be later than its start.",
        });
      }
    }

    if (
      input.setAsNextAction &&
      input.expectedApplicationVersion === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedApplicationVersion"],
        message:
          "The expected application version is required when setting the event as the next action.",
      });
    }
  });

type ApplicationEventRouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

export async function POST(
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

    const params = applicationParamsSchema.parse(await context.params);

    const body = createApplicationEventBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await createApplicationEvent({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      applicationId: params.applicationId,

      clientCommandId: body.clientCommandId,

      requestId: actorResolution.actor.requestId,

      eventKind: body.eventKind,

      title: body.title,

      temporalKind: body.temporalKind,

      eventDate: body.eventDate,

      startsAt: body.startsAt,

      endsAt: body.endsAt,

      timezone: body.timezone,

      location: body.location,

      meetingUrl: body.meetingUrl,

      preparationNotes: body.preparationNotes,

      setAsNextAction: body.setAsNextAction,

      expectedApplicationVersion: body.expectedApplicationVersion,
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
      error instanceof JobApplicationUnavailableError ||
      error instanceof PrivateDomainWriteUnavailableError
    ) {
      return createApiProblemResponse({
        status: 404,

        code:
          error instanceof JobApplicationUnavailableError
            ? "APPLICATION_UNAVAILABLE"
            : "WORKSPACE_UNAVAILABLE",

        message:
          error instanceof JobApplicationUnavailableError
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

        message: "An archived job application cannot receive new events.",

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
      `POST /api/v1/applications/:applicationId/events failed unexpectedly. requestId=${requestId}`,
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
