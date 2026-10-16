import { sql } from "drizzle-orm";
import { z } from "zod";
import { withDomainTransaction } from "@/platform/db";
import { id } from "../domain/sharing";
import { tokenHash, type SharingActor } from "./groups";
import { invitationReviewSchema } from "./read-groups";
export const invitationCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("review"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("accept"),
      token: z.string().regex(/^[a-f0-9]{64}$/),
      clientCommandId: id,
      expectedVersion: z.number().int().positive(),
      consent: z.literal(true),
      displayName: z.string().trim().min(1).max(200),
    })
    .strict(),
]);
export function invitationCommand(actor: SharingActor, raw: unknown) {
  const c = invitationCommandSchema.parse(raw);
  return withDomainTransaction(actor, async (t) => {
    if (c.kind === "review")
      return invitationReviewSchema.parse(
        (
          await t.db.execute<{ review: unknown }>(
            sql`SELECT sharing.review_invitation(${tokenHash(c.token)}) AS review`,
          )
        ).rows[0]?.review,
      );
    return (
      await t.db.execute<{ result: unknown }>(
        sql`SELECT sharing.accept_invitation(${tokenHash(c.token)},${c.clientCommandId}::uuid,${c.expectedVersion},${c.consent},${c.displayName}) AS result`,
      )
    ).rows[0]!.result;
  });
}
