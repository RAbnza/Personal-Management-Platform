import { randomUUID } from "node:crypto";

import { z } from "zod";

import { withDomainTransaction } from "@/platform/db";

import {
  createDefaultCategoriesIfMissing,
  createPersonalWorkspaceIfMissing,
  createUserProfileIfMissing,
  createWorkspacePreferenceIfMissing,
  findPersonalWorkspaceIdByOwner,
  installProvisioningWorkspaceContext,
} from "../repositories/workspace-provisioning-repository";

const provisionPersonalWorkspaceInputSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(1),
});

export type ProvisionPersonalWorkspaceResult = {
  workspaceId: string;
  created: boolean;
};

/**
 * Idempotently provision the authenticated user's private ownership root and
 * first-use defaults.
 *
 * A candidate workspace ID is installed as the initial transaction-local
 * workspace context. If another request has already created the user's
 * personal workspace, the unique owner constraint resolves the race and the
 * existing owned workspace is installed as the remaining transaction scope.
 *
 * New profile/workspace/settings/category records commit atomically for a
 * first-time workspace. Re-running provisioning also repairs missing
 * non-destructive defaults on workspaces created by older application
 * versions without overwriting existing preferences or category data.
 *
 * Module preferences intentionally remain sparse. Absence continues to mean
 * the documented enabled/agenda-visible/reminders-enabled defaults, as exposed
 * by the module-preference service.
 */
export async function provisionPersonalWorkspace(input: {
  userId: string;
  displayName: string;
}): Promise<ProvisionPersonalWorkspaceResult> {
  const validatedInput = provisionPersonalWorkspaceInputSchema.parse(input);

  const candidateWorkspaceId = randomUUID();

  return withDomainTransaction(
    {
      userId: validatedInput.userId,
      workspaceId: candidateWorkspaceId,
    },
    async (transaction) => {
      await createUserProfileIfMissing(transaction, {
        userId: validatedInput.userId,
        displayName: validatedInput.displayName,
      });

      const createdWorkspaceId = await createPersonalWorkspaceIfMissing(
        transaction,
        {
          workspaceId: candidateWorkspaceId,
          userId: validatedInput.userId,
        },
      );

      let workspaceId: string;
      let created: boolean;

      if (createdWorkspaceId) {
        workspaceId = createdWorkspaceId;
        created = true;
      } else {
        /*
         * Another successful request, or an earlier application version,
         * already owns the user's personal workspace.
         *
         * workspace rows are identity-scoped by app.user_id rather than by
         * app.workspace_id, so resolving this ID does not expose another
         * user's workspace.
         */
        const existingWorkspaceId = await findPersonalWorkspaceIdByOwner(
          transaction,
          validatedInput.userId,
        );

        if (!existingWorkspaceId) {
          throw new Error(
            "Personal workspace provisioning could not resolve the existing workspace.",
          );
        }

        workspaceId = existingWorkspaceId;
        created = false;

        /*
         * Child private tables require app.workspace_id to equal their actual
         * workspace scope. The resolved ID came from the authenticated user's
         * own RLS-protected workspace row.
         */
        await installProvisioningWorkspaceContext(transaction, workspaceId);
      }

      await createWorkspacePreferenceIfMissing(transaction, workspaceId);

      await createDefaultCategoriesIfMissing(transaction, workspaceId);

      return {
        workspaceId,
        created,
      };
    },
  );
}
