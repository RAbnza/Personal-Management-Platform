import { z } from "zod";
import { CommandReceiptConflictError } from "@/modules/core/domain/command";
import {
  InvalidReminderActionError,
  ReminderConflictError,
  ReminderUnavailableError,
  reminderCommandSchema,
  reminderTargetSchema,
} from "@/modules/time/domain/reminder";
import { getReminder, mutateReminder } from "@/modules/time/services/reminders";
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

function problem(error: unknown, requestId: string) {
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  if (error instanceof ReminderUnavailableError)
    return createApiProblemResponse({
      status: 404,
      code: error.code,
      message: error.message,
      requestId,
      retryable: false,
    });
  if (
    error instanceof ReminderConflictError ||
    error instanceof CommandReceiptConflictError
  )
    return createApiProblemResponse({
      status: 409,
      code: error.code,
      message: error.message,
      requestId,
      retryable: false,
    });
  if (error instanceof InvalidReminderActionError)
    return createApiProblemResponse({
      status: 422,
      code: error.code,
      message: error.message,
      requestId,
      retryable: false,
    });
  console.error("Reminder operation could not complete safely.");
  return createApiProblemResponse({
    status: 503,
    code: "REMINDER_UNAVAILABLE",
    message:
      "We couldn't confirm the reminder operation. Retry a save with its same command, or reload the read.",
    requestId,
    retryable: true,
  });
}
export async function GET(request: Request) {
  const requestId = createApiRequestId();
  try {
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const target = reminderTargetSchema.parse(params);
    return createApiJsonResponse(
      await getReminder(
        {
          userId: actor.actor.userId,
          workspaceId: actor.actor.workspaceId,
          requestId: actor.actor.requestId,
        },
        target,
      ),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const actor = await resolveApiActorForRequest(request, requestId);
    if (actor.kind === "response") return actor.response;
    const command = reminderCommandSchema.parse(await readApiJsonBody(request));
    return createApiJsonResponse(
      await mutateReminder(
        {
          userId: actor.actor.userId,
          workspaceId: actor.actor.workspaceId,
          requestId: actor.actor.requestId,
        },
        command,
      ),
      200,
      requestId,
    );
  } catch (e) {
    return problem(e, requestId);
  }
}
