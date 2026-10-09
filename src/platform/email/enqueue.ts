import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { fromDrizzle } from "pg-boss";
import { z } from "zod";
import { getAuthPool } from "@/platform/db/pools";
import { createRuntimeBoss, SECURITY_EMAIL_QUEUE } from "@/platform/jobs/boss";
import { AUTH_EMAIL_LINK_EXPIRY_SECONDS } from "@/platform/auth/email-links";
import { emailDelivery } from "@/platform/db/schema/email-delivery";
import { encryptEmailSecret } from "./cipher";
import type { EmailMessage } from "./sender";

const envelope = z.object({
  userId: z.uuid(),
  purpose: z.enum(["verify_email", "password_reset"]),
  token: z.string().min(1),
});
export async function enqueueSecurityEmail(
  input: z.infer<typeof envelope> & { message: EmailMessage },
) {
  const { userId, purpose, token } = envelope.parse(input);
  const id = randomUUID(),
    keyId = process.env.EMAIL_PAYLOAD_KEY_ID;
  if (!keyId || !/^[a-z0-9_-]{1,64}$/i.test(keyId))
    throw new Error("Security email key ID is not configured.");
  const logicalKey = createHash("sha256")
    .update(`${userId}:${purpose}:${token}`)
    .digest("hex");
  const pool = getAuthPool(),
    boss = createRuntimeBoss(pool);
  await drizzle(pool).transaction(async (tx) => {
    const inserted = await tx
      .insert(emailDelivery)
      .values({
        id,
        userId,
        purpose,
        logicalKey,
        keyId,
        recipientCiphertext: encryptEmailSecret(
          input.message.to,
          `${id}:recipient`,
        ),
        payloadCiphertext: encryptEmailSecret(
          JSON.stringify({
            subject: input.message.subject,
            text: input.message.text,
            html: input.message.html,
          }),
          `${id}:payload`,
        ),
        expiresAt: new Date(Date.now() + AUTH_EMAIL_LINK_EXPIRY_SECONDS * 1000),
      })
      .onConflictDoNothing({ target: emailDelivery.logicalKey })
      .returning({ id: emailDelivery.id });
    if (!inserted.length) return;
    const job = await boss.send(
      SECURITY_EMAIL_QUEUE,
      { schemaVersion: 1, deliveryId: id },
      { db: fromDrizzle(tx, sql) },
    );
    if (!job) throw new Error("Security email could not be queued.");
  });
}
