import type { PoolClient } from "pg";
import { z } from "zod";
import { decryptEmailSecret } from "./cipher";
import {
  EmailProviderError,
  sendEmailWithReceipt,
  type EmailMessage,
} from "./sender";

const jobSchema = z
  .object({ schemaVersion: z.literal(1), deliveryId: z.uuid() })
  .strict();
const messageSchema = z.object({
  subject: z.string(),
  text: z.string(),
  html: z.string().optional(),
});
/** The row lock remains held during the bounded provider call, serializing
 * duplicate execution. 'uncertain' is persisted BEFORE I/O: a crash never
 * turns possible provider acceptance into an apparently unsent delivery. */
export async function processSecurityEmail(
  client: Pick<PoolClient, "query">,
  data: unknown,
  retryCount: number,
  send: typeof sendEmailWithReceipt = sendEmailWithReceipt,
) {
  const { deliveryId } = jobSchema.parse(data);
  await client.query("BEGIN");
  try {
    const found = await client.query(
      "SELECT * FROM ops.email_delivery WHERE id=$1 FOR UPDATE",
      [deliveryId],
    );
    const r = found.rows[0];
    if (!r || !["queued", "uncertain"].includes(r.status)) {
      await client.query("COMMIT");
      return;
    }
    const finish = async (
      status: string,
      code: string | null = null,
      providerId: string | null = null,
    ) => {
      await client.query(
        "UPDATE ops.email_delivery SET status=$2,last_error_code=$3,provider_message_id=$4,accepted_at=CASE WHEN $2='accepted' THEN clock_timestamp() ELSE accepted_at END,recipient_ciphertext=decode('','hex'),payload_ciphertext=NULL,updated_at=clock_timestamp() WHERE id=$1",
        [deliveryId, status, code, providerId],
      );
      await client.query("COMMIT");
    };
    if (new Date(r.expires_at).getTime() <= Date.now()) {
      await finish("expired");
      return;
    }
    if (r.key_id !== process.env.EMAIL_PAYLOAD_KEY_ID) {
      await finish("failed", "key_unavailable");
      return;
    }
    const to = decryptEmailSecret(
      r.recipient_ciphertext,
      `${deliveryId}:recipient`,
    );
    if (
      !(
        await client.query(
          "SELECT ops.email_source_active($1,$2,$3) AS active",
          [r.user_id, r.purpose, to],
        )
      ).rows[0]?.active
    ) {
      await finish("cancelled", "source_inactive");
      return;
    }
    // Mailpit has no provider deduplication guarantee. A previous uncertain
    // attempt is held for operator review and expiration, never blindly sent.
    if (r.status === "uncertain" && process.env.EMAIL_PROVIDER !== "resend") {
      await client.query("COMMIT");
      return;
    }
    const message: EmailMessage = {
      to,
      ...messageSchema.parse(
        JSON.parse(
          decryptEmailSecret(r.payload_ciphertext, `${deliveryId}:payload`),
        ),
      ),
    };
    await client.query(
      "UPDATE ops.email_delivery SET status='uncertain',updated_at=clock_timestamp() WHERE id=$1",
      [deliveryId],
    );
    await client.query("COMMIT");
    await client.query("BEGIN");
    // Serialize a racing job and recheck lifecycle immediately before sending.
    const locked = (
      await client.query(
        "SELECT status FROM ops.email_delivery WHERE id=$1 FOR UPDATE",
        [deliveryId],
      )
    ).rows[0];
    if (locked?.status !== "uncertain") {
      await client.query("COMMIT");
      return;
    }
    if (
      !(
        await client.query(
          "SELECT ops.email_source_active($1,$2,$3) AS active",
          [r.user_id, r.purpose, to],
        )
      ).rows[0]?.active
    ) {
      await finish("cancelled", "source_inactive");
      return;
    }
    try {
      const receipt = await send(message, `security-email/${r.logical_key}`);
      await finish("accepted", null, receipt.providerMessageId);
    } catch (error) {
      const uncertain =
        !(error instanceof EmailProviderError) || error.outcome === "uncertain";
      if (uncertain && process.env.EMAIL_PROVIDER !== "resend") {
        await client.query(
          "UPDATE ops.email_delivery SET last_error_code='provider_uncertain',updated_at=clock_timestamp() WHERE id=$1",
          [deliveryId],
        );
        await client.query("COMMIT");
        return;
      }
      if (retryCount >= 6 && !uncertain) {
        await finish("failed", "provider_rejected");
        throw new Error("security_email_failed");
      }
      await client.query(
        "UPDATE ops.email_delivery SET status=$2,last_error_code=$3,updated_at=clock_timestamp() WHERE id=$1",
        [
          deliveryId,
          uncertain ? "uncertain" : "queued",
          uncertain ? "provider_uncertain" : "provider_rejected",
        ],
      );
      await client.query("COMMIT");
      throw new Error("security_email_retry");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
