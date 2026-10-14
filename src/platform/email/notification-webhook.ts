import { createHash } from "node:crypto";
import { Resend } from "resend";
import { z } from "zod";
import { getAuthPool } from "@/platform/db/pools";
const evidence = z.object({
  type: z.enum([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.failed",
  ]),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.string().min(1).max(200),
    to: z.array(z.email()).length(1),
    tags: z.record(z.string(), z.string()).optional(),
  }),
});
export function verifyNotificationWebhook(
  payload: string,
  headers: Headers,
  secret: string,
) {
  if (Buffer.byteLength(payload) > 65536)
    throw new Error("notification_webhook_invalid");
  const id = z.string().min(1).max(200).parse(headers.get("svix-id"));
  const verified = new Resend("re_verification_only").webhooks.verify({
    payload,
    headers: {
      id,
      timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    },
    webhookSecret: secret,
  });
  const parsed = evidence.safeParse(verified);
  if (!parsed.success) {
    if (
      [
        "email.sent",
        "email.delivered",
        "email.bounced",
        "email.failed",
      ].includes(verified.type)
    )
      throw new Error("notification_webhook_invalid");
    return null;
  }
  const v = parsed.data;
  const tag = z.uuid().safeParse(v.data.tags?.notification_id);
  return {
    eventId: id,
    messageId: v.data.email_id,
    kind: v.type,
    occurred: v.created_at,
    deliveryId: tag.success ? tag.data : null,
    recipientHash: createHash("sha256").update(v.data.to[0]!).digest("hex"),
  };
}
export async function recordNotificationWebhook(
  v: NonNullable<ReturnType<typeof verifyNotificationWebhook>>,
) {
  await getAuthPool().query(
    "SELECT ops.record_notification_event($1,$2,$3,$4,$5,$6)",
    [v.eventId, v.messageId, v.kind, v.occurred, v.deliveryId, v.recipientHash],
  );
}
