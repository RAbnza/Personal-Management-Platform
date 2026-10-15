import { z } from "zod";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiRequestId,
  createApiJsonResponse,
} from "@/platform/http/api-v1";
import { createMutationOriginProblemResponse } from "@/platform/http/api-v1-mutation";
import { hProblem } from "@/platform/http/portability-problem";
import { withDomainTransaction } from "@/platform/db";
import {
  ownedAttachment,
  uploadAttachment,
  downloadAttachment,
} from "@/modules/files/services/attachments";
import {
  readBoundedBody,
  fileDownloadHeaders,
} from "@/modules/files/domain/supporting-file";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ attachmentId: string }> },
) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const fileId = z.uuid().parse((await ctx.params).attachmentId);
    const result = await downloadAttachment(a.actor, fileId);
    return new Response(new Uint8Array(result.bytes), {
      headers: fileDownloadHeaders(result.mime),
    });
  } catch (e) {
    return hProblem(e, id);
  }
}
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ attachmentId: string }> },
) {
  const id = createApiRequestId();
  try {
    const origin = createMutationOriginProblemResponse(request, id);
    if (origin) return origin;
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const fileId = z.uuid().parse((await ctx.params).attachmentId),
      commandId = z.uuid().parse(request.headers.get("x-command-id"));
    const meta = await withDomainTransaction(
      a.actor,
      (tx) => ownedAttachment(tx, fileId),
      { readOnlySnapshot: true },
    );
    const body = await readBoundedBody(
      request.body,
      Number(meta.declared_bytes),
      AbortSignal.timeout(30_000),
    );
    return createApiJsonResponse(
      await uploadAttachment(a.actor, fileId, commandId, body),
      200,
      id,
    );
  } catch (e) {
    return hProblem(e, id);
  }
}
