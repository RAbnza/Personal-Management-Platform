import pino from "pino";
import { z } from "zod";
const logger = pino({
  base: null,
  level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
});
const detailsSchema = z
  .object({
    requestId: z.uuid().optional(),
    durationMs: z.number().nonnegative().optional(),
    count: z.number().int().nonnegative().optional(),
  })
  .strict();
const eventSchema = z.enum([
  "database_idle_error",
  "authentication_error",
  "worker_started",
  "worker_stopped",
  "worker_error",
  "security_email_retry",
  "lifecycle_error",
  "worker_heartbeat",
]);
/** Only fixed codes and bounded operational metadata can reach diagnostics.
 * Error objects, SQL parameters, requests, user records and URLs are excluded. */
export function logOperationalEvent(
  event: z.infer<typeof eventSchema>,
  details: z.infer<typeof detailsSchema> = {},
) {
  logger.info({
    event: eventSchema.parse(event),
    ...detailsSchema.parse(details),
  });
}
