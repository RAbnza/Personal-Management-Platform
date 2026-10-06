import { NextResponse } from "next/server";
import { z } from "zod";

import { AGENDA_DISPLAY_MODULES } from "@/modules/time/domain/agenda";
import {
  AgendaWorkspaceUnavailableError,
  InvalidAgendaCursorError,
  listAgendaItems,
} from "@/modules/time/services/list-agenda-items";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import { isCalendarDate } from "@/shared/calendar-date";

const calendarDateQuerySchema = z.string().refine(isCalendarDate, {
  message: "Date must be a valid YYYY-MM-DD calendar date.",
});

const agendaModulesQuerySchema = z
  .string()
  .min(1)
  .transform((value) => value.split(","))
  .pipe(
    z
      .array(z.enum(AGENDA_DISPLAY_MODULES))
      .min(1)
      .max(AGENDA_DISPLAY_MODULES.length)
      .refine((modules) => new Set(modules).size === modules.length, {
        message: "Agenda module filters cannot contain duplicates.",
      }),
  );

const agendaPageSizeQuerySchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(200));

const agendaQuerySchema = z
  .object({
    startDate: calendarDateQuerySchema,
    endDate: calendarDateQuerySchema,

    modules: agendaModulesQuerySchema.optional(),

    pageSize: agendaPageSizeQuerySchema.optional(),

    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      isCalendarDate(query.startDate) &&
      isCalendarDate(query.endDate) &&
      query.startDate > query.endDate
    ) {
      context.addIssue({
        code: "custom",

        path: ["endDate"],

        message:
          "Agenda end date cannot be earlier than the requested start date.",
      });
    }
  });

function parseAgendaQuery(request: Request) {
  return agendaQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
}

/**
 * Return the bounded source-driven Agenda projection for the authenticated
 * workspace.
 *
 * `modules` uses a comma-separated allowlisted value, for example:
 *
 *   ?modules=career,time
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = createApiRequestId();

  try {
    const actorResolution = await resolveApiActorForRequest(request, requestId);

    if (actorResolution.kind === "response") {
      return actorResolution.response;
    }

    const query = parseAgendaQuery(request);

    const result = await listAgendaItems({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      startDate: query.startDate,
      endDate: query.endDate,

      ...(query.modules
        ? {
            modules: query.modules,
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
    if (error instanceof z.ZodError || error instanceof RangeError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message: "The request query parameters are invalid.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof InvalidAgendaCursorError) {
      return createApiProblemResponse({
        status: 400,

        code: "VALIDATION_FAILED",
        message:
          "The pagination cursor is invalid for the requested Agenda filters.",

        requestId,

        retryable: false,
      });
    }

    if (error instanceof AgendaWorkspaceUnavailableError) {
      return createApiProblemResponse({
        status: 404,

        code: "WORKSPACE_UNAVAILABLE",
        message: "The requested private workspace is unavailable.",

        requestId,

        retryable: false,
      });
    }

    console.error(
      `GET /api/v1/agenda failed unexpectedly. requestId=${requestId}`,
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
