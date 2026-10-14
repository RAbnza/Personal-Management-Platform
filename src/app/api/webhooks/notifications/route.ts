import {
  verifyNotificationWebhook,
  recordNotificationWebhook,
} from "@/platform/email/notification-webhook";
export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  const response = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!secret) return response(503);
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return response(413);
  let evidence;
  try {
    const reader = request.body?.getReader();
    if (!reader) return response(400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 65536) {
        await reader.cancel();
        return response(413);
      }
      chunks.push(r.value);
    }
    const payload = Buffer.concat(chunks).toString("utf8");
    evidence = verifyNotificationWebhook(payload, request.headers, secret);
  } catch {
    return response(400);
  }
  try {
    if (evidence) await recordNotificationWebhook(evidence);
    return response(204);
  } catch {
    return response(503);
  }
}
