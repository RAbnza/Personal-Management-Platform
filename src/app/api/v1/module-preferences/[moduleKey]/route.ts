import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CommandReceiptConflictError,
  CommandReceiptStateError,
} from "@/modules/core/domain/command";
import { PrivateDomainWriteUnavailableError } from "@/modules/core/repositories/private-domain-write-repository";
import {
  ModulePreferenceVersionConflictError,
  updateModulePreference,
} from "@/modules/core/services/update-module-preference";
import { implementedModuleKeys } from "@/platform/db/schema/core";
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

const modulePreferenceParamsSchema = z
  .object({
    moduleKey: z.enum(implementedModuleKeys),
  })
  .strict();

const updateModulePreferenceBodySchema = z
  .object({
    clientCommandId: z.uuid(),

    /**
     * Version zero represents the documented virtual default before a module
     * preference row has been materialized.
     */
    expectedVersion: z.number().int().min(0).max(POSTGRES_INTEGER_MAX),

    enabled: z.boolean(),

    agendaVisible: z.boolean(),

    remindersEnabled: z.boolean(),
  })
  .strict();

type ModulePreferenceRouteContext = {
  params: Promise<{
    moduleKey: string;
  }>;
};

/**
 * Materialize or update one module's preference state.
 *
 * moduleKey is allowlisted from the implemented module set. Ownership scope
 * always comes from ActorContext.
 */
export async function PATCH(
  request: Request,
  context: ModulePreferenceRouteContext,
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

    const params = modulePreferenceParamsSchema.parse(await context.params);

    const body = updateModulePreferenceBodySchema.parse(
      await readApiJsonBody(request),
    );

    const result = await updateModulePreference({
      userId: actorResolution.actor.userId,
      workspaceId: actorResolution.actor.workspaceId,

      clientCommandId: body.clientCommandId,

      moduleKey: params.moduleKey,

      expectedVersion: body.expectedVersion,

      enabled: body.enabled,

      agendaVisible: body.agendaVisible,

      remindersEnabled: body.remindersEnabled,
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

    if (error instanceof ModulePreferenceVersionConflictError) {
      return createApiProblemResponse({
        status: 409,

        code: "STALE_VERSION",

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
      `PATCH /api/v1/module-preferences/:moduleKey failed unexpectedly. requestId=${requestId}`,
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
