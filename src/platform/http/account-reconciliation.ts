import { z } from "zod";
import {
  adjustAccountBodySchema,
  reconcileAccountBodySchema,
  ReconciliationPreviewStaleError,
  ReconciliationUnavailableError,
} from "@/modules/finance/domain/reconciliation";
import {
  FinancialCommandConflictError,
  FinancialCommandStateError,
} from "@/modules/finance/domain/financial-command";
import { FinancialWriteWorkspaceUnavailableError } from "@/modules/finance/repositories/financial-write-repository";
import { FinancialAccountNotFoundError } from "@/modules/finance/services/get-account-history";
import {
  adjustAccountBalance,
  getAccountReconciliationSetup,
  previewAccountAdjustment,
  previewAccountReconciliation,
  reconcileAccount,
} from "@/modules/finance/services/reconcile-account";
import {
  createApiJsonResponse,
  createApiProblemResponse,
  createApiRequestId,
} from "./api-v1";
import { resolveApiActorForRequest } from "./api-v1-auth";
import {
  ApiJsonBodyError,
  createJsonBodyProblemResponse,
  createMutationOriginProblemResponse,
  createSchemaValidationProblemResponse,
  readApiJsonBody,
} from "./api-v1-mutation";
type Context = { params: Promise<{ accountId: string }> };
export function accountReconciliationProblem(
  error: unknown,
  requestId: string,
) {
  if (error instanceof ApiJsonBodyError)
    return createJsonBodyProblemResponse(error, requestId);
  if (error instanceof z.ZodError)
    return createSchemaValidationProblemResponse(error, requestId);
  const problem =
    error instanceof ReconciliationPreviewStaleError
      ? {
          status: 409,
          code: "RECONCILIATION_PREVIEW_STALE",
          message: error.message,
          retryable: false,
        }
      : error instanceof FinancialCommandConflictError
        ? {
            status: 409,
            code: "IDEMPOTENCY_CONFLICT",
            message: "This command ID already belongs to a different command.",
            retryable: false,
          }
        : error instanceof FinancialCommandStateError
          ? {
              status: 503,
              code: "TEMPORARY_UNAVAILABLE",
              message: "Retry the same command to resolve its outcome safely.",
              retryable: true,
            }
          : error instanceof FinancialAccountNotFoundError ||
              error instanceof ReconciliationUnavailableError ||
              error instanceof FinancialWriteWorkspaceUnavailableError
            ? {
                status: 404,
                code: "ACCOUNT_COMPARISON_UNAVAILABLE",
                message:
                  "The requested private account or comparison is unavailable.",
                retryable: false,
              }
            : error instanceof RangeError
              ? {
                  status: 422,
                  code: "BUSINESS_RULE_VIOLATION",
                  message: error.message,
                  retryable: false,
                }
              : null;
  if (problem) return createApiProblemResponse({ ...problem, requestId });
  console.error(`Account comparison request failed. requestId=${requestId}`);
  return createApiProblemResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message:
      "The request could not be completed. Retain the same command when retrying a save.",
    retryable: false,
    requestId,
  });
}
export async function getAccountReconciliations(
  request: Request,
  context: Context,
) {
  const requestId = createApiRequestId();
  try {
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const { accountId } = z
      .object({ accountId: z.uuid() })
      .parse(await context.params);
    const result = await getAccountReconciliationSetup({
      userId: resolution.actor.userId,
      workspaceId: resolution.actor.workspaceId,
      financialAccountId: accountId,
    });
    return createApiJsonResponse(result, 200, requestId);
  } catch (e) {
    return accountReconciliationProblem(e, requestId);
  }
}
export async function postAccountComparison(
  request: Request,
  context: Context,
  kind: "comparison" | "adjustment",
  preview: boolean,
) {
  const requestId = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, requestId);
    if (origin) return origin;
    const resolution = await resolveApiActorForRequest(request, requestId);
    if (resolution.kind === "response") return resolution.response;
    const { accountId } = z
      .object({ accountId: z.uuid() })
      .parse(await context.params);
    const raw = await readApiJsonBody(request),
      actor = {
        userId: resolution.actor.userId,
        workspaceId: resolution.actor.workspaceId,
        requestId: resolution.actor.requestId,
      };
    const result =
      kind === "comparison"
        ? await (preview ? previewAccountReconciliation : reconcileAccount)({
            ...actor,
            ...reconcileAccountBodySchema.parse({
              ...reconcileAccountBodySchema
                .omit({ financialAccountId: true })
                .parse(raw),
              financialAccountId: accountId,
            }),
          })
        : await (preview ? previewAccountAdjustment : adjustAccountBalance)({
            ...actor,
            ...adjustAccountBodySchema.parse({
              ...adjustAccountBodySchema
                .omit({ financialAccountId: true })
                .parse(raw),
              financialAccountId: accountId,
            }),
          });
    return createApiJsonResponse(result, preview ? 200 : 201, requestId);
  } catch (e) {
    return accountReconciliationProblem(e, requestId);
  }
}
