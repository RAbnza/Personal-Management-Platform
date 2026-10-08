import {
  getCurrentUserOverview,
  type GetCurrentUserOverviewResult,
} from "@/modules/core/services/get-current-user-overview";
import { provisionPersonalWorkspace } from "@/modules/core/services/provision-personal-workspace";
import { getVerifiedAuthenticatedSession } from "@/platform/auth/session-boundary";
import { getIdentityProfile } from "@/modules/core/services/profile";

export type PrivateAppBootstrapResult =
  | {
      kind: "ready";

      user: {
        id: string;
        name: string;
        email: string;
      };

      workspace: {
        id: string;
      } & GetCurrentUserOverviewResult["workspace"];

      preference: GetCurrentUserOverviewResult["preference"];

      modules: GetCurrentUserOverviewResult["modules"];
    }
  | {
      kind: "unauthorized";
    }
  | {
      kind: "unavailable";
      lifecyclePending?: boolean;
    };

/**
 * Establish the trusted server-side state required to render the private
 * application.
 *
 * Authentication identity comes exclusively from the verified Better Auth
 * session. Workspace provisioning is idempotent and derives ownership from
 * that authenticated user rather than accepting browser-supplied identifiers.
 */
export async function resolvePrivateAppBootstrap(
  requestHeaders: Headers,
): Promise<PrivateAppBootstrapResult> {
  try {
    const authenticatedSession =
      await getVerifiedAuthenticatedSession(requestHeaders);

    if (!authenticatedSession) {
      return {
        kind: "unauthorized",
      };
    }

    const profile = await getIdentityProfile(authenticatedSession.user.id);
    if (profile && profile.lifecycle !== "active")
      return { kind: "unavailable", lifecyclePending: true };
    const provisionedWorkspace = await provisionPersonalWorkspace({
      userId: authenticatedSession.user.id,
      displayName: authenticatedSession.user.name,
    });

    const overview = await getCurrentUserOverview({
      userId: authenticatedSession.user.id,
      workspaceId: provisionedWorkspace.workspaceId,
    });

    return {
      kind: "ready",

      user: {
        id: authenticatedSession.user.id,
        name: profile?.displayName ?? authenticatedSession.user.name,
        email: authenticatedSession.user.email,
      },

      workspace: {
        id: provisionedWorkspace.workspaceId,
        ...overview.workspace,
      },

      preference: overview.preference,
      modules: overview.modules,
    };
  } catch {
    /*
     * Keep session contents, database details, workspace identifiers and stack
     * traces out of user-visible errors and ordinary application logs.
     */
    console.error("Private application bootstrap failed unexpectedly.");

    return {
      kind: "unavailable",
    };
  }
}
