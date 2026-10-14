import { z } from "zod";
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const notificationPreferencesSchema = z
  .object({
    enabled: z.boolean(),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Choose a supported timezone.")
      .nullable(),
    quietStart: clock.nullable(),
    quietEnd: clock.nullable(),
    includeDueDate: z.boolean(),
  })
  .strict()
  .refine(
    (v) =>
      (v.quietStart === null && v.quietEnd === null) ||
      (v.quietStart !== null &&
        v.quietEnd !== null &&
        v.quietStart !== v.quietEnd),
    "Quiet hours need two different times.",
  );
export const notificationCommandSchema = z
  .object({
    clientCommandId: z.uuid(),
    expectedVersion: z.number().int().min(0),
    preferences: notificationPreferencesSchema,
  })
  .strict();
export type NotificationCommand = z.infer<typeof notificationCommandSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
> & { version: number; enabledAt: string | null };
export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false,
  timezone: null,
  quietStart: null,
  quietEnd: null,
  includeDueDate: false,
  version: 0,
  enabledAt: null,
};
export class NotificationConflictError extends Error {
  readonly code = "STALE_NOTIFICATION_PREFERENCES";
  constructor() {
    super("Notification preferences changed. Reload before saving.");
  }
}
export class NotificationIdentityError extends Error {
  readonly code = "NOTIFICATION_IDENTITY_UNAVAILABLE";
  constructor() {
    super(
      "A current verified sign-in email is required to enable notifications.",
    );
  }
}
export function notificationMessage(
  origin: string,
  dueDate: string | null,
  includeDueDate: boolean,
) {
  return {
    subject: "Personal Management reminder",
    text: `A reminder is ready in your private Agenda.${includeDueDate && dueDate ? ` Recorded due date: ${dueDate}.` : ""}\nOpen ${new URL("/calendar", origin).toString()} to review current evidence.\nManage optional email in ${new URL("/settings/notifications", origin).toString()}.`,
  };
}
