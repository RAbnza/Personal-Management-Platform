import { z } from "zod";
import { recordCareerObservation } from "@/modules/career/services/record-career-observation";
import { careerObservationSchema } from "@/modules/career/domain/career-observation";
import {
  JobApplicationUnavailableError,
  JobApplicationArchivedError,
  JobApplicationVersionConflictError,
} from "@/modules/career/domain/application";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "@/platform/http/api-v1";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
} from "@/platform/http/api-v1-mutation";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const applicationId = z.uuid().parse((await params).applicationId),
      body = careerObservationSchema.parse(await readApiJsonBody(request));
    return createApiJsonResponse(
      await recordCareerObservation({ ...actor.actor, applicationId, body }),
      201,
      requestId,
    );
  } catch (e) {
    if (e instanceof ApiJsonBodyError)
      return createJsonBodyProblemResponse(e, requestId);
    const unavailable = e instanceof JobApplicationUnavailableError,
      conflict =
        e instanceof JobApplicationVersionConflictError ||
        e instanceof JobApplicationArchivedError ||
        e instanceof CommandReceiptConflictError,
      invalid =
        e instanceof z.ZodError ||
        e instanceof RangeError ||
        e instanceof SyntaxError;
    return createApiProblemResponse({
      status: unavailable ? 404 : conflict ? 409 : invalid ? 400 : 503,
      code: unavailable
        ? "UNAVAILABLE"
        : conflict
          ? "CONFLICT"
          : invalid
            ? "VALIDATION_FAILED"
            : "TEMPORARY_UNAVAILABLE",
      message: unavailable
        ? "Application unavailable."
        : conflict
          ? "Application or command changed. Reload before submitting a new observation."
          : invalid
            ? "Choose a valid actual observation date and complete the required fields."
            : "Observation save is unconfirmed. Retry the same command.",
      requestId,
      retryable: !unavailable && !conflict && !invalid,
    });
  }
}
