import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  CAREER_SALARY_PERIODS,
  CAREER_WORK_ARRANGEMENTS,
  PossibleDuplicateJobApplicationError,
} from "@/modules/career/domain/application";
import { createJobApplication } from "@/modules/career/services/create-job-application";
import {
  InvalidJobApplicationListCursorError,
  JobApplicationListWorkspaceUnavailableError,
  listJobApplications,
} from "@/modules/career/services/list-job-applications";
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

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

const pageSizeQuerySchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

const applicationsQuerySchema = z
  .object({
    archive: z.enum(["active", "archived", "all"]).optional(),

    stage: z.enum(CAREER_APPLICATION_STAGES).optional(),

    search: z.string().max(200).optional(),

    pageSize: pageSizeQuerySchema.optional(),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

const nonNegativeMinorUnitsSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/, {
    message: "Salary must be a non-negative exact minor-unit integer string.",
  })
  .refine(
    (value) => {
      if (!/^(?:0|[1-9]\d*)$/.test(value)) {
        return true;
      }

      return BigInt(value) <= POSTGRES_BIGINT_MAX;
    },
    {
      message: "Salary value exceeds the supported database range.",
    },
  );

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

const nullablePostingUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, {
    message: "Posting URL must be a valid HTTP or HTTPS URL.",
  })
  .nullable()
  .optional();

const nullableContactEmailSchema = z
  .string()
  .trim()
  .max(320)
  .refine((value) => z.email().safeParse(value).success, {
    message: "Contact email must be a valid email address.",
  })
  .nullable()
  .optional();

const calendarDateSchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const createJobApplicationBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    companyName: z.string().trim().min(1).max(200),

    roleTitle: z.string().trim().min(1).max(200),

    postingUrl: nullablePostingUrlSchema,

    sourceName: nullableTrimmedText(200),

    roleDescriptionSnapshot: nullableTrimmedText(20_000),

    location: nullableTrimmedText(500),

    workArrangement: z.enum(CAREER_WORK_ARRANGEMENTS).nullable().optional(),

    salaryMinMinor: nonNegativeMinorUnitsSchema.nullable().optional(),

    salaryMaxMinor: nonNegativeMinorUnitsSchema.nullable().optional(),

    salaryCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, {
        message:
          "Salary currency must be a three-letter uppercase currency code.",
      })
      .nullable()
      .optional(),

    salaryPeriod: z.enum(CAREER_SALARY_PERIODS).nullable().optional(),

    technologyTags: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .default([]),

    contactName: nullableTrimmedText(200),

    contactEmail: nullableContactEmailSchema,

    contactPhone: nullableTrimmedText(50),

    resumeVersionId: z.uuid().nullable().optional(),

    appliedDate: calendarDateSchema.nullable().optional(),

    initialStage: z.enum(CAREER_APPLICATION_STAGES).default("saved"),

    initialOutcome: z.enum(CAREER_APPLICATION_OUTCOMES).nullable().optional(),

    initialStageEffectiveDate: calendarDateSchema,

    initialStageReason: nullableTrimmedText(2000),

    notes: nullableTrimmedText(20_000),

    allowPossibleDuplicate: z.boolean().default(false),
  })
  .strict();

function parseApplicationsQuery(request: Request) {
  return applicationsQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
}

/**
 * List Career applications and saved opportunities for the authenticated
 * workspace.
 *
 * Filters and pagination are client-controlled; ownership scope is not.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const query = parseApplicationsQuery(request);

    const result = await listJobApplications({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      ...(query.archive
        ? {
            archive: query.archive,
          }
        : {}),

      ...(query.stage
        ? {
            stage: query.stage,
          }
        : {}),

      ...(query.search !== undefined
        ? {
            search: query.search,
          }
        : {}),

      ...(query.pageSize !== undefined
        ? {
            pageSize: query.pageSize,
          }
        : {}),

      ...(query.cursor
        ? {
            cursor: query.cursor,
          }
        : {}),
    });

    return createApiJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The request query parameters are invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof InvalidJobApplicationListCursorError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message:
          "The pagination cursor is invalid for the requested application filters.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof JobApplicationListWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/applications failed unexpectedly. requestId=${requestId}`,
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

/**
 * Create one Career application or saved opportunity.
 *
 * User/workspace ownership and audit request attribution are derived from
 * ActorContext. The domain service remains authoritative for cross-field
 * salary, submission-date, stage/outcome and duplicate-attempt rules.
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

    const body = createJobApplicationBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await createJobApplication({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,

      requestId: actorResolution.actor.requestId,

      companyName: body.companyName,

      roleTitle: body.roleTitle,

      postingUrl: body.postingUrl,

      sourceName: body.sourceName,

      roleDescriptionSnapshot: body.roleDescriptionSnapshot,

      location: body.location,

      workArrangement: body.workArrangement,

      salaryMinMinor: body.salaryMinMinor,

      salaryMaxMinor: body.salaryMaxMinor,

      salaryCurrency: body.salaryCurrency,

      salaryPeriod: body.salaryPeriod,

      technologyTags: body.technologyTags,

      contactName: body.contactName,

      contactEmail: body.contactEmail,

      contactPhone: body.contactPhone,

      resumeVersionId: body.resumeVersionId,

      appliedDate: body.appliedDate,

      initialStage: body.initialStage,

      initialOutcome: body.initialOutcome,

      initialStageEffectiveDate: body.initialStageEffectiveDate,

      initialStageReason: body.initialStageReason,

      notes: body.notes,

      allowPossibleDuplicate: body.allowPossibleDuplicate,
    });

    return createApiJsonResponse(result, 201, requestId);
  } catch (error) {
    if (error instanceof ApiJsonBodyError) {
      return createJsonBodyProblemResponse(error, requestId);
    }

    if (error instanceof z.ZodError) {
      return createSchemaValidationProblemResponse(error, requestId);
    }

    if (error instanceof PossibleDuplicateJobApplicationError) {
      return createApiProblemResponse({
        status: 409,

        code: "POSSIBLE_DUPLICATE_APPLICATION",

        message:
          "A matching company and role already exists. Confirm a separate application attempt to continue.",

        fieldErrors: {
          companyName: [
            "A possible duplicate application already uses this company and role.",
          ],

          roleTitle: [
            "Set allowPossibleDuplicate to true only after confirming this is a separate attempt.",
          ],
        },

        requestId,

        retryable: false,
      });
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
      `POST /api/v1/applications failed unexpectedly. requestId=${requestId}`,
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
