import { z } from "zod";
import {
  TrackerError,
  trackerCommandSchema,
} from "@/modules/trackers/domain/tracker";
import { recordTrackerCommand } from "@/modules/trackers/services/commands";
import { readTrackers, querySchema } from "@/modules/trackers/services/reads";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
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
function problem(e: unknown, id: string) {
  if (e instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(e, id);
  if (e instanceof z.ZodError)
    return createSchemaValidationProblemResponse(e, id);
  if (
    e instanceof TrackerError ||
    e instanceof CommandReceiptConflictError ||
    e instanceof PrivateDomainWriteUnavailableError
  )
    return createApiProblemResponse({
      status:
        e instanceof TrackerError
          ? e.status
          : e instanceof CommandReceiptConflictError
            ? 409
            : 404,
      code: "TRACKER_REQUEST_REJECTED",
      message: e.message,
      requestId: id,
      retryable: false,
    });
  console.error(`Tracker request failed. requestId=${id}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The outcome is unconfirmed. Retry the same command.",
    requestId: id,
    retryable: true,
  });
}
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const p = new URL(request.url).searchParams;
    if ([...p.keys()].length !== new Set(p.keys()).size)
      throw new TrackerError(422, "Query fields cannot repeat.");
    return createApiJsonResponse(
      await readTrackers(a.actor, querySchema.parse(Object.fromEntries(p))),
      200,
      id,
    );
  } catch (e) {
    return problem(e, id);
  }
}
export async function POST(request: Request) {
  const id = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, id);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    return createApiJsonResponse(
      await recordTrackerCommand(
        {
          userId: a.actor.userId,
          workspaceId: a.actor.workspaceId,
          requestId: a.actor.requestId,
        },
        trackerCommandSchema.parse(await readApiJsonBody(request)),
      ),
      200,
      id,
    );
  } catch (e) {
    return problem(e, id);
  }
}
