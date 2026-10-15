import { z } from "zod";
import { supportingUploadSchema } from "@/modules/files/domain/supporting-file";
import {
  reserveAttachment,
  listAttachments,
  mutateAttachment,
  attachmentCatalog,
  unlinkedAttachments,
} from "@/modules/files/services/attachments";
import { resolveApiActorForRequest } from "@/platform/http/api-v1-auth";
import {
  createApiRequestId,
  createApiJsonResponse,
} from "@/platform/http/api-v1";
import {
  createMutationOriginProblemResponse,
  readApiJsonBody,
} from "@/platform/http/api-v1-mutation";
import { hProblem } from "@/platform/http/portability-problem";
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    if (new URL(request.url).searchParams.get("unlinked") === "true") {
      z.object({ unlinked: z.literal("true") })
        .strict()
        .parse(Object.fromEntries(new URL(request.url).searchParams));
      return createApiJsonResponse(
        { attachments: await unlinkedAttachments(a.actor) },
        200,
        id,
      );
    }
    const q = z
      .union([
        z
          .object({
            sourceKind: z.string(),
            sourceId: z.uuid(),
            afterId: z.uuid().optional(),
          })
          .strict(),
        z
          .object({
            sourceKind: z.string(),
            catalog: z.literal("true"),
            afterId: z.uuid().optional(),
          })
          .strict(),
      ])
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return createApiJsonResponse(
      "catalog" in q
        ? await attachmentCatalog(a.actor, q.sourceKind, q.afterId)
        : {
            attachments: await listAttachments(
              a.actor,
              q.sourceKind,
              q.sourceId,
              q.afterId,
            ),
          },
      200,
      id,
    );
  } catch (e) {
    return hProblem(e, id);
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
      await reserveAttachment(
        a.actor,
        supportingUploadSchema.parse(await readApiJsonBody(request)),
      ),
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
    const c = z
      .object({
        clientCommandId: z.uuid(),
        attachmentId: z.uuid(),
        sourceKind: z.string().optional(),
        sourceId: z.uuid().optional(),
        operation: z.enum(["unlink", "delete"]),
        expectedVersion: z.number().int().positive(),
      })
      .strict()
      .parse(await readApiJsonBody(request));
    return createApiJsonResponse(await mutateAttachment(a.actor, c), 200, id);
  } catch (e) {
    return hProblem(e, id);
  }
}
