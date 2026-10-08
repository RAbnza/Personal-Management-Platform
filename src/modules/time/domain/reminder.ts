import { z } from "zod";
import { AGENDA_DISPLAY_MODULES, AGENDA_SOURCE_KINDS } from "./agenda";

export const reminderSourceSchema = z
  .object({ sourceKind: z.enum(AGENDA_SOURCE_KINDS), sourceId: z.uuid() })
  .strict();
export type ReminderSource = z.infer<typeof reminderSourceSchema>;
export const reminderTargetSchema = z.union([
  reminderSourceSchema,
  z.object({ moduleKey: z.enum(AGENDA_DISPLAY_MODULES) }).strict(),
]);
export type ReminderTarget = z.infer<typeof reminderTargetSchema>;
export const reminderRuleInputSchema = z
  .object({
    offsetDays: z.number().int().min(0).max(365),
    localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
const rulesSchema = z
  .array(reminderRuleInputSchema)
  .max(8)
  .refine(
    (r) =>
      new Set(r.map((x) => `${x.offsetDays}:${x.localTime}`)).size === r.length,
    { message: "Reminder times cannot be duplicated." },
  );
export const reminderCommandSchema = z
  .object({
    target: reminderTargetSchema,
    clientCommandId: z.uuid(),
    expectedSnapshot: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("settings"),
          mode: z.enum(["inherit", "override", "off"]),
          rules: rulesSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("dismiss"),
          ruleKey: z.string().min(1).max(30),
        })
        .strict(),
      z
        .object({
          kind: z.literal("restore"),
          ruleKey: z.string().min(1).max(30),
        })
        .strict(),
      z
        .object({
          kind: z.literal("snooze"),
          ruleKey: z.string().min(1).max(30),
          snoozedUntil: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      "moduleKey" in v.target &&
      (v.action.kind !== "settings" || v.action.mode !== "override")
    )
      c.addIssue({
        code: "custom",
        message: "Module defaults use override settings.",
      });
    if (
      v.action.kind === "settings" &&
      v.action.mode !== "override" &&
      v.action.rules.length
    )
      c.addIssue({
        code: "custom",
        message:
          "Inherited or disabled settings cannot contain override rules.",
      });
  });
export type ReminderCommand = z.infer<typeof reminderCommandSchema>;
export type ReminderRuleView = {
  id: string | null;
  key: string;
  offsetDays: number;
  localTime: string;
  generation: number;
  scheduledFor: string;
  state: "active" | "dismissed" | "snoozed" | "cancelled";
  snoozedUntil: string | null;
  occurrenceId: string | null;
  version: number;
  due: boolean;
};
export type ReminderHistoryItem = {
  id: string;
  state: string;
  scheduledFor: string;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  cancellationReason: string | null;
  occurrenceKey: string;
  sourceGeneration: number;
  ruleGeneration: number;
  updatedAt: string;
};
export type ReminderView = {
  target: ReminderTarget;
  snapshot: string;
  mode: "inherit" | "override" | "off";
  timezone: string;
  moduleRemindersEnabled: boolean;
  moduleHidden: boolean;
  agendaVisible: boolean;
  eligible: boolean;
  sourceVersion: number | null;
  occurrenceKey: string | null;
  sourceGeneration: number | null;
  title: string;
  sourceRoute: string | null;
  dueDate: string | null;
  remainingMinor: string | null;
  configuration: { offsetDays: number; localTime: string }[];
  rules: ReminderRuleView[];
  history: ReminderHistoryItem[];
  actions?: {
    id: string;
    operation: string;
    recordedAt: string;
    snoozedUntil: string | null;
  }[];
};
export class ReminderUnavailableError extends Error {
  readonly code = "REMINDER_SOURCE_UNAVAILABLE";
  constructor() {
    super(
      "This reminder source is unavailable or has been resolved. Open the source or reload its history.",
    );
  }
}
export class ReminderConflictError extends Error {
  readonly code = "STALE_REMINDER";
  constructor() {
    super(
      "The source or reminder settings changed. Reload and review before trying again.",
    );
  }
}
export class InvalidReminderActionError extends Error {
  readonly code = "INVALID_REMINDER_ACTION";
  constructor(message: string) {
    super(message);
  }
}
export function reminderHref(source: ReminderSource): string {
  return `/calendar/reminders/${source.sourceKind}/${source.sourceId}`;
}
