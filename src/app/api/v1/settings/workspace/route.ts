import { NextResponse } from "next/server";
import { z } from "zod";

import {
  WorkspaceCurrencyLockedError,
  WorkspaceSettingsVersionConflictError,
  updateWorkspaceSettings,
} from "@/modules/core/services/update-workspace-settings";
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

const POSTGRES_INTEGER_MAX = 2_147_483_647;

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

const updateWorkspaceSettingsBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    expectedVersion: z.number().int().positive().max(POSTGRES_INTEGER_MAX),

    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, {
        message:
          "Workspace currency must be a three-letter uppercase currency code.",
      }),

    timezone: z.string().trim().min(1).max(100).refine(isIanaTimezone, {
      message: "Timezone must be a valid IANA timezone.",
    }),

    weekStart: z.number().int().min(0).max(6),
  })
  .strict();

/**
 * Update workspace-level settings such as currency, timezone and week start.
 *
 * Ownership is always taken from ActorContext. userId/workspaceId are not
 * accepted in the command body.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
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

    const body = updateWorkspaceSettingsBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await updateWorkspaceSettings({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,

      expectedVersion: body.expectedVersion,

      currency: body.currency,
      timezone: body.timezone,
      weekStart: body.weekStart,
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

    if (error instanceof WorkspaceSettingsVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

        message: error.message,

        requestId,

        retryable: false,
      });
    }

    if (error instanceof WorkspaceCurrencyLockedError) {
      return createApiProblemResponse({
        status: 422,

        code: "WORKSPACE_CURRENCY_LOCKED",

        message: error.message,

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

    console.error(
      `PATCH /api/v1/settings/workspace failed unexpectedly. requestId=${requestId}`,
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
