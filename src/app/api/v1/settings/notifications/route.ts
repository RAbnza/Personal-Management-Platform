import { z } from "zod";
import {
  notificationCommandSchema,
  NotificationConflictError,
  NotificationIdentityError,
} from "@/modules/time/domain/notification";
import {
  getNotificationSettings,
  saveNotificationPreferences,
} from "@/modules/time/services/notification-preferences";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
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
  if (e instanceof z.ZodError)
    return createSchemaValidationProblemResponse(e, id);
  if (e instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(e, id);
  if (
    e instanceof NotificationConflictError ||
    e instanceof CommandReceiptConflictError ||
    e instanceof NotificationIdentityError
  )
    return createApiProblemResponse({
      status: e instanceof NotificationIdentityError ? 422 : 409,
      code: e.code,
      message: e.message,
      requestId: id,
      retryable: false,
    });
  return createApiProblemResponse({
    status: 503,
    code: "NOTIFICATIONS_UNAVAILABLE",
    message:
      "The operation could not be confirmed. Retry a save with its identical command.",
    requestId: id,
    retryable: true,
  });
}
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return createApiJsonResponse(
      await getNotificationSettings({
        userId: a.actor.userId,
        workspaceId: a.actor.workspaceId,
      }),
      200,
      id,
    );
  } catch (e) {
    return problem(e, id);
  }
}
export async function PATCH(request: Request) {
  const id = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, id);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const command = notificationCommandSchema.parse(
      await readApiJsonBody(request),
    );
    return createApiJsonResponse(
      await saveNotificationPreferences(
        { userId: a.actor.userId, workspaceId: a.actor.workspaceId },
        command,
      ),
      200,
      id,
    );
  } catch (e) {
    return problem(e, id);
  }
}
