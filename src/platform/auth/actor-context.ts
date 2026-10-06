import { randomUUID } from "node:crypto";

import { z } from "zod";

import { resolveActivePersonalWorkspaceIdForActor } from "@/modules/core/repositories/actor-workspace-repository";
import { withIdentityTransaction } from "@/platform/db";

import { getVerifiedAuthenticatedSession } from "./session-boundary";

const actorContextSchema = z
  .object({
    userId: z.uuid(),
    workspaceId: z.uuid(),

    sessionId: z.uuid(),
    requestId: z.uuid(),
  })
  .strict();

const requestIdSchema = z.uuid();

export type ActorContext = z.infer<typeof actorContextSchema>;

export type ActorContextResolution =
  | {
      kind: "authenticated";

      actor: ActorContext;
    }
  | {
      kind: "unauthorized";

      requestId: string;
    }
  | {
      kind: "workspace_unavailable";

      requestId: string;
    };

/**
 * Build the trusted actor for one protected business request.
 *
 * Ownership scope comes exclusively from:
 *
 *   validated Better Auth session
 *     ->
 *   transaction-local app.user_id
 *     ->
 *   owner-scoped core.workspace RLS
 *     ->
 *   resolved personal workspace ID
 *
 * Personal workspace identity is never accepted from request JSON, query
 * parameters or URL path segments.
 *
 * HTTP callers may provide the request ID they generated at the route boundary
 * so authentication, application services, logging and the response share one
 * correlation identifier.
 */
export async function resolveActorContext(
  requestHeaders: Headers,
  requestId: string = randomUUID(),
): Promise<ActorContextResolution> {
  const trustedRequestId = requestIdSchema.parse(requestId);

  const authenticatedSession =
    await getVerifiedAuthenticatedSession(requestHeaders);

  if (!authenticatedSession) {
    return {
      kind: "unauthorized",
      requestId: trustedRequestId,
    };
  }

  const workspaceId = await withIdentityTransaction(
    {
      userId: authenticatedSession.user.id,
    },
    (transaction) => resolveActivePersonalWorkspaceIdForActor(transaction),
  );

  if (!workspaceId) {
    /*
     * Authentication succeeded, but application provisioning/lifecycle state
     * does not currently provide an active private workspace.
     */
    return {
      kind: "workspace_unavailable",
      requestId: trustedRequestId,
    };
  }

  return {
    kind: "authenticated",

    actor: actorContextSchema.parse({
      userId: authenticatedSession.user.id,

      workspaceId,

      sessionId: authenticatedSession.session.id,

      requestId: trustedRequestId,
    }),
  };
}
