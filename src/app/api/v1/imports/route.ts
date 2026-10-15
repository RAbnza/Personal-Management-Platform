import { z } from "zod";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiRequestId,
  createApiJsonResponse,
} from "@/platform/http/api-v1";
import { createMutationOriginProblemResponse } from "@/platform/http/api-v1-mutation";
import { hProblem } from "@/platform/http/portability-problem";
import { readBoundedBody } from "@/modules/files/domain/supporting-file";
import {
  stageImport,
  importStatus,
  importSetup,
  controlImport,
  stageImportSchema,
  importControlSchema,
} from "@/modules/portability/services/imports";
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const q = z
      .object({
        batchId: z.uuid().optional(),
        setup: z.literal("true").optional(),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return createApiJsonResponse(
      q.setup
        ? { accounts: await importSetup(a.actor) }
        : await importStatus(a.actor, q.batchId),
      200,
      id,
    );
  } catch (e) {
    return hProblem(e, id);
  }
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSON required");
  const bytes = await readBoundedBody(
    request.body,
    2 * 1024 * 1024,
    AbortSignal.timeout(30_000),
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function POST(request: Request) {
  const id = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, id);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    return createApiJsonResponse(
      await stageImport(a.actor, stageImportSchema.parse(await body(request))),
      201,
      id,
    );
  } catch (e) {
    return hProblem(e, id);
  }
}
export async function PATCH(request: Request) {
  const id = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, id);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    return createApiJsonResponse(
      await controlImport(
        a.actor,
        importControlSchema.parse(await body(request)),
      ),
      200,
      id,
    );
  } catch (e) {
    return hProblem(e, id);
  }
}
