import { randomUUID } from "node:crypto";

import { z } from "zod";

import { withDomainTransaction } from "@/platform/db";

import {
  createPersonalWorkspaceIfMissing,
  createUserProfileIfMissing,
  createWorkspacePreference,
  findPersonalWorkspaceIdByOwner,
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
 * Idempotently provision the S0 ownership root for a verified user.
 *
 * A candidate workspace ID is installed as the transaction-local workspace
 * context before insertion. If another request has already created the user's
 * personal workspace, the partial unique owner constraint resolves the race
 * and the existing workspace is returned.
 *
 * New workspace preference creation occurs in the same transaction as the new
 * profile/workspace records, so a successfully provisioned workspace cannot
 * commit without its S0 settings row.
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

      if (createdWorkspaceId) {
        await createWorkspacePreference(transaction, createdWorkspaceId);

        return {
          workspaceId: createdWorkspaceId,
          created: true,
        };
      }

      /*
       * Another successful provisioning transaction already owns the personal
       * workspace. Because profile, workspace and preference are committed
       * atomically, there is no partial preference row to repair here.
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

      return {
        workspaceId: existingWorkspaceId,
        created: false,
      };
    },
  );
}
