import { rejectDuplicateJsonKeys } from "@/modules/portability/domain/portable-bundle";
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
  prepareWorkspaceExport,
  downloadWorkspaceExport,
  downloadWorkspaceRecovery,
  previewWorkspaceRestore,
  restoreWorkspace,
  restoreStatus,
} from "@/modules/portability/services/workspace-bundles";
export async function GET(request: Request) {
  const id = createApiRequestId();
  try {
    const a = await resolveApiActorForRequest(request, id);
    if (a.kind === "response") return a.response;
    const q = z
      .object({
        exportRunId: z.uuid().optional(),
        recoveryRunId: z.uuid().optional(),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!q.exportRunId && !q.recoveryRunId)
      return createApiJsonResponse(
        { restores: await restoreStatus(a.actor) },
        200,
        id,
      );
    const bundle = q.recoveryRunId
      ? await downloadWorkspaceRecovery(a.actor, q.recoveryRunId)
      : await downloadWorkspaceExport(a.actor, q.exportRunId!);
    return new Response(JSON.stringify(bundle), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="private-workspace-v2.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
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
    if (
      request.headers.get("content-type")?.split(";")[0] ===
      "application/vnd.pmp.private-workspace-graph+json"
    ) {
      const q = z
        .object({ operation: z.literal("preview"), clientCommandId: z.uuid() })
        .strict()
        .parse(Object.fromEntries(new URL(request.url).searchParams));
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(
          request.body,
          10 * 1024 * 1024,
          AbortSignal.timeout(30_000),
        ),
      );
      rejectDuplicateJsonKeys(text);
      return createApiJsonResponse(
        await previewWorkspaceRestore(a.actor, {
          clientCommandId: q.clientCommandId,
          bundle: JSON.parse(text),
        }),
        200,
        id,
      );
    }
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw Error("JSON required");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await readBoundedBody(
        request.body,
        10 * 1024 * 1024,
        AbortSignal.timeout(30_000),
      ),
    );
    rejectDuplicateJsonKeys(text);
    const raw = JSON.parse(text);
    const c = z
      .discriminatedUnion("operation", [
        z
          .object({ operation: z.literal("export"), clientCommandId: z.uuid() })
          .strict(),
        z
          .object({
            operation: z.literal("preview"),
            clientCommandId: z.uuid(),
            bundle: z.unknown(),
          })
          .strict(),
        z
          .object({
            operation: z.literal("restore"),
            clientCommandId: z.uuid(),
            runId: z.uuid(),
            previewHash: z.string().regex(/^[a-f0-9]{64}$/),
            confirmation: z.literal("replace-private-workspace"),
          })
          .strict(),
      ])
      .parse(raw);
    let result;
    const { operation, ...body } = c;
    if (operation === "export")
      result = await prepareWorkspaceExport(a.actor, c.clientCommandId);
    else if (c.operation === "preview")
      result = await previewWorkspaceRestore(a.actor, {
        clientCommandId: c.clientCommandId,
        bundle: c.bundle,
      });
    else if (c.operation === "restore") {
      const { operation: _op, ...command } = c;
      void _op;
      result = await restoreWorkspace(a.actor, command);
    }
    void body;
    return createApiJsonResponse(result, 200, id);
  } catch (e) {
    return hProblem(e, id);
  }
}
