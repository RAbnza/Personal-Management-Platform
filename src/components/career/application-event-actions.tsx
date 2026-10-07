"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobApplicationDetailEvent } from "@/modules/career/services/get-job-application-detail";
import { isCalendarDate } from "@/shared/calendar-date";

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function isValidCalendarDate(value: string): boolean {
  return isCalendarDate(value);
}

function localDateTimeToInstant(value: string, timezone: string): string {
  const match = localDateTimePattern.exec(value);

  if (!match) {
    throw new TypeError("Enter a complete local date and time.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone);

  if (
    Number.isNaN(zoned.getTime()) ||
    zoned.getFullYear() !== year ||
    zoned.getMonth() !== month - 1 ||
    zoned.getDate() !== day ||
    zoned.getHours() !== hour ||
    zoned.getMinutes() !== minute
  ) {
    throw new RangeError(
      "That local date and time is not valid in the workspace timezone.",
    );
  }

  return zoned.toISOString();
}

function instantToLocalDateTime(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,

    year: "numeric",
    month: "2-digit",
    day: "2-digit",

    hour: "2-digit",
    minute: "2-digit",

    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const byType = new Map(parts.map((part) => [part.type, part.value]));

  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  const hour = byType.get("hour");
  const minute = byType.get("minute");

  if (!year || !month || !day || !hour || !minute) {
    throw new Error("The event schedule could not be prepared for editing.");
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

const optionalReplacementEventSchema = z.union([z.literal(""), z.uuid()]);

const applicationEventActionSchema = z
  .object({
    action: z.enum(["reschedule", "complete", "cancel"]),

    temporalKind: z.enum(["date", "timed"]),

    eventDate: z.string(),

    startsLocal: z.string(),

    endsLocal: z.string(),

    outcomeNotes: z.string().max(20_000),

    replacementNextActionEventId: optionalReplacementEventSchema,

    reason: z.string().max(2000),
  })
  .superRefine((values, context) => {
    if (values.action !== "reschedule") {
      return;
    }

    if (values.temporalKind === "date") {
      if (!isValidCalendarDate(values.eventDate)) {
        context.addIssue({
          code: "custom",
          path: ["eventDate"],
          message: "Enter a valid event date.",
        });
      }

      return;
    }

    if (!localDateTimePattern.test(values.startsLocal)) {
      context.addIssue({
        code: "custom",
        path: ["startsLocal"],
        message: "Enter a complete start date and time.",
      });
    }

    if (
      values.endsLocal !== "" &&
      !localDateTimePattern.test(values.endsLocal)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsLocal"],
        message: "Enter a complete end date and time.",
      });
    }

    if (
      localDateTimePattern.test(values.startsLocal) &&
      localDateTimePattern.test(values.endsLocal) &&
      values.endsLocal <= values.startsLocal
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsLocal"],
        message: "End time must be later than start time.",
      });
    }
  });

type ApplicationEventActionValues = z.infer<
  typeof applicationEventActionSchema
>;

type ReschedulePayload = {
  expectedEventVersion: number;

  action: "reschedule";

  temporalKind: "date" | "timed";

  eventDate: string | null;

  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;

  reason: string | null;
};

type FinishPayload = {
  expectedEventVersion: number;

  action: "complete" | "cancel";

  outcomeNotes: string | null;

  expectedApplicationVersion: number | undefined;

  replacementNextActionEventId: string | null | undefined;

  reason: string | null;
};

type EventMutationPayload = ReschedulePayload | FinishPayload;

type PendingEventMutation = {
  clientCommandId: string;

  payload: EventMutationPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type ApiProblem = {
  code: string | null;
  message: string | null;
};

export type ReplacementCareerEvent = {
  eventId: string;
  title: string;
};

const selectClassName = [
  "min-h-11 w-full rounded-control border border-input",
  "bg-surface px-3 py-2 text-base text-foreground",
  "transition-colors duration-(--motion-duration-fast) ease-state",
  "hover:border-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-disabled-foreground",
  "aria-invalid:border-danger",
  "motion-reduce:transition-none",
].join(" ");

function nullableText(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

async function readApiProblem(response: Response): Promise<ApiProblem> {
  try {
    const body: unknown = await response.json();

    if (typeof body !== "object" || body === null) {
      return {
        code: null,
        message: null,
      };
    }

    const record = body as Record<string, unknown>;

    return {
      code: typeof record.code === "string" ? record.code : null,

      message: typeof record.message === "string" ? record.message : null,
    };
  } catch {
    return {
      code: null,
      message: null,
    };
  }
}

async function patchEvent(
  applicationId: string,
  eventId: string,
  command: PendingEventMutation,
): Promise<Response> {
  return fetch(`/api/v1/applications/${applicationId}/events/${eventId}`, {
    method: "PATCH",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      clientCommandId: command.clientCommandId,

      ...command.payload,
    }),

    cache: "no-store",
  });
}

export interface ApplicationEventActionsProps {
  applicationId: string;

  applicationVersion: number;

  event: JobApplicationDetailEvent;

  workspaceTimezone: string;

  replacementEvents: readonly ReplacementCareerEvent[];
}

export function ApplicationEventActions({
  applicationId,
  applicationVersion,
  event,
  workspaceTimezone,
  replacementEvents,
}: ApplicationEventActionsProps) {
  const router = useRouter();

  const editTimezone = workspaceTimezone;

  const initialStartsLocal =
    event.temporalKind === "timed" && event.startsAt
      ? instantToLocalDateTime(event.startsAt, editTimezone)
      : "";

  const initialEndsLocal =
    event.temporalKind === "timed" && event.endsAt
      ? instantToLocalDateTime(event.endsAt, editTimezone)
      : "";

  const [pendingCommand, setPendingCommand] =
    useState<PendingEventMutation | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ApplicationEventActionValues>({
    resolver: zodResolver(applicationEventActionSchema),

    defaultValues: {
      action: "reschedule",

      temporalKind: event.temporalKind,

      eventDate: event.eventDate ?? "",

      startsLocal: initialStartsLocal,

      endsLocal: initialEndsLocal,

      outcomeNotes: "",

      replacementNextActionEventId: "",

      reason: "",
    },
  });

  const action = useWatch({
    control,
    name: "action",
  });

  const temporalKind = useWatch({
    control,
    name: "temporalKind",
  });

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeCommand(command: PendingEventMutation): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await patchEvent(applicationId, event.eventId, command);

      if (response.ok) {
        setPendingCommand(null);

        setSaveState("saved");

        router.refresh();

        return;
      }

      const problem = await readApiProblem(response);

      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether this Career event change was saved. Keep this page open and retry the same save.",
        );

        return;
      }

      setPendingCommand(null);

      setSaveState("idle");

      setSaveError(
        problem.code === "STALE_VERSION"
          ? "This Career event or its application changed after the page was loaded. Reload before saving another change."
          : (problem.message ?? "The Career event could not be changed."),
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this Career event change was saved. Keep this page open and retry the same save.",
      );
    }
  }

  async function onSubmit(values: ApplicationEventActionValues): Promise<void> {
    let payload: EventMutationPayload;

    if (values.action === "reschedule") {
      let startsAt: string | null = null;
      let endsAt: string | null = null;

      if (values.temporalKind === "timed") {
        try {
          startsAt = localDateTimeToInstant(values.startsLocal, editTimezone);
        } catch (error) {
          setError("startsLocal", {
            type: "validate",

            message:
              error instanceof Error
                ? error.message
                : "Enter a valid start time.",
          });

          return;
        }

        if (values.endsLocal !== "") {
          try {
            endsAt = localDateTimeToInstant(values.endsLocal, editTimezone);
          } catch (error) {
            setError("endsLocal", {
              type: "validate",

              message:
                error instanceof Error
                  ? error.message
                  : "Enter a valid end time.",
            });

            return;
          }

          if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
            setError("endsLocal", {
              type: "validate",
              message: "End time must be later than start time.",
            });

            return;
          }
        }
      }

      payload = {
        expectedEventVersion: event.version,

        action: "reschedule",

        temporalKind: values.temporalKind,

        eventDate: values.temporalKind === "date" ? values.eventDate : null,

        startsAt,
        endsAt,

        timezone: values.temporalKind === "timed" ? editTimezone : null,

        reason: nullableText(values.reason),
      };
    } else {
      payload = {
        expectedEventVersion: event.version,

        action: values.action,

        outcomeNotes: nullableText(values.outcomeNotes),

        expectedApplicationVersion: event.isNextAction
          ? applicationVersion
          : undefined,

        replacementNextActionEventId: event.isNextAction
          ? values.replacementNextActionEventId === ""
            ? null
            : values.replacementNextActionEventId
          : undefined,

        reason: nullableText(values.reason),
      };
    }

    const command: PendingEventMutation = {
      clientCommandId: crypto.randomUUID(),

      payload,
    };

    setPendingCommand(command);

    await executeCommand(command);
  }

  async function retrySameSave(): Promise<void> {
    if (!pendingCommand) {
      setSaveState("idle");

      setSaveError(
        "The previous save can no longer be retried safely. Reload the application before continuing.",
      );

      return;
    }

    await executeCommand(pendingCommand);
  }

  const primaryLabel =
    action === "reschedule"
      ? "Save new schedule"
      : action === "complete"
        ? "Mark complete"
        : "Cancel activity";

  return (
    <details className="mt-4 rounded-control border border-border bg-surface-subtle">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-semibold text-foreground">
        Manage activity
      </summary>

      <form
        noValidate
        className="space-y-5 border-t border-border p-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <FormField
          htmlFor={`career-event-action-${event.eventId}`}
          label="Action"
        >
          <select
            {...register("action")}
            id={`career-event-action-${event.eventId}`}
            disabled={fieldsDisabled}
            className={selectClassName}
          >
            <option value="reschedule">Reschedule</option>
            <option value="complete">Mark complete</option>
            <option value="cancel">Cancel activity</option>
          </select>
        </FormField>

        {action === "reschedule" ? (
          <div className="space-y-5">
            <FormField
              htmlFor={`career-event-temporal-${event.eventId}`}
              label="Schedule type"
            >
              <select
                {...register("temporalKind")}
                id={`career-event-temporal-${event.eventId}`}
                disabled={fieldsDisabled}
                className={selectClassName}
              >
                <option value="date">Date only</option>
                <option value="timed">Specific time</option>
              </select>
            </FormField>

            {temporalKind === "date" ? (
              <FormField
                htmlFor={`career-event-date-${event.eventId}`}
                label="Date"
                error={errors.eventDate?.message}
                errorId={`career-event-date-error-${event.eventId}`}
              >
                <Input
                  {...register("eventDate")}
                  id={`career-event-date-${event.eventId}`}
                  type="date"
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.eventDate)}
                  aria-describedby={
                    errors.eventDate
                      ? `career-event-date-error-${event.eventId}`
                      : undefined
                  }
                />
              </FormField>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  htmlFor={`career-event-start-${event.eventId}`}
                  label="Start"
                  description={`Entered in ${editTimezone}.`}
                  descriptionId={`career-event-start-description-${event.eventId}`}
                  error={errors.startsLocal?.message}
                  errorId={`career-event-start-error-${event.eventId}`}
                >
                  <Input
                    {...register("startsLocal")}
                    id={`career-event-start-${event.eventId}`}
                    type="datetime-local"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.startsLocal)}
                    aria-describedby={[
                      `career-event-start-description-${event.eventId}`,
                      errors.startsLocal
                        ? `career-event-start-error-${event.eventId}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </FormField>

                <FormField
                  htmlFor={`career-event-end-${event.eventId}`}
                  label="End"
                  description="Optional."
                  descriptionId={`career-event-end-description-${event.eventId}`}
                  error={errors.endsLocal?.message}
                  errorId={`career-event-end-error-${event.eventId}`}
                >
                  <Input
                    {...register("endsLocal")}
                    id={`career-event-end-${event.eventId}`}
                    type="datetime-local"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.endsLocal)}
                    aria-describedby={[
                      `career-event-end-description-${event.eventId}`,
                      errors.endsLocal
                        ? `career-event-end-error-${event.eventId}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </FormField>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <FormField
              htmlFor={`career-event-outcome-${event.eventId}`}
              label="Outcome notes"
              description="Optional notes about what happened or why this activity is being closed."
              descriptionId={`career-event-outcome-description-${event.eventId}`}
              error={errors.outcomeNotes?.message}
              errorId={`career-event-outcome-error-${event.eventId}`}
            >
              <Textarea
                {...register("outcomeNotes")}
                id={`career-event-outcome-${event.eventId}`}
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.outcomeNotes)}
                aria-describedby={[
                  `career-event-outcome-description-${event.eventId}`,
                  errors.outcomeNotes
                    ? `career-event-outcome-error-${event.eventId}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>

            {event.isNextAction ? (
              <FormField
                htmlFor={`career-event-replacement-${event.eventId}`}
                label="Replacement next action"
                description="Completing or cancelling the current next action must either clear the pointer or move it to another scheduled Career activity."
                descriptionId={`career-event-replacement-description-${event.eventId}`}
                error={errors.replacementNextActionEventId?.message}
                errorId={`career-event-replacement-error-${event.eventId}`}
              >
                <select
                  {...register("replacementNextActionEventId")}
                  id={`career-event-replacement-${event.eventId}`}
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.replacementNextActionEventId)}
                  aria-describedby={[
                    `career-event-replacement-description-${event.eventId}`,
                    errors.replacementNextActionEventId
                      ? `career-event-replacement-error-${event.eventId}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  className={selectClassName}
                >
                  <option value="">Clear next action</option>

                  {replacementEvents.map((replacement) => (
                    <option
                      key={replacement.eventId}
                      value={replacement.eventId}
                    >
                      {replacement.title}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
          </div>
        )}

        <FormField
          htmlFor={`career-event-reason-${event.eventId}`}
          label="Change reason"
          description="Optional context for this lifecycle change."
          descriptionId={`career-event-reason-description-${event.eventId}`}
          error={errors.reason?.message}
          errorId={`career-event-reason-error-${event.eventId}`}
        >
          <Textarea
            {...register("reason")}
            id={`career-event-reason-${event.eventId}`}
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={[
              `career-event-reason-description-${event.eventId}`,
              errors.reason
                ? `career-event-reason-error-${event.eventId}`
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        {saveState === "unconfirmed" ? (
          <div
            role="alert"
            className="rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning"
          >
            <div className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
                strokeWidth={1.9}
              />

              <div>
                <p className="font-medium">Save outcome unconfirmed</p>

                <p className="mt-1">{saveError}</p>
              </div>
            </div>
          </div>
        ) : saveError ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
          >
            {saveError}
          </p>
        ) : null}

        {saveState === "saved" ? (
          <div
            role="status"
            className="flex items-center gap-2 text-sm font-medium text-success"
          >
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Career activity updated.
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {saveState === "unconfirmed" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void retrySameSave();
              }}
            >
              Retry same save
            </Button>
          ) : null}

          <Button
            type="submit"
            variant={action === "cancel" ? "danger" : "primary"}
            loading={saveState === "saving"}
            loadingLabel="Saving activity…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            {primaryLabel}
          </Button>
        </div>
      </form>
    </details>
  );
}
