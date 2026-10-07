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
import type { GetPersonalEventDetailResult } from "@/modules/time/services/get-personal-event-detail";
import { isCalendarDate } from "@/shared/calendar-date";

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
      "That local date and time is not valid in the event timezone.",
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

const personalEventActionSchema = z
  .object({
    action: z.enum(["edit", "complete", "cancel"]),

    title: z.string().trim().min(1, "Enter an event title.").max(200),

    temporalKind: z.enum(["date", "timed"]),

    eventDate: z.string(),

    endDateExclusive: z.string(),

    startsLocal: z.string(),

    endsLocal: z.string(),

    description: z.string().max(2000),

    location: z.string(),

    referenceUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => value === "" || isHttpUrl(value), {
        message: "Enter a valid HTTP or HTTPS reference URL.",
      }),

    reason: z.string().max(2000),
  })
  .superRefine((values, context) => {
    if (values.action !== "edit") {
      return;
    }

    if (values.temporalKind === "date") {
      if (!isCalendarDate(values.eventDate)) {
        context.addIssue({
          code: "custom",

          path: ["eventDate"],

          message: "Enter a valid event date.",
        });
      }

      if (
        values.endDateExclusive !== "" &&
        !isCalendarDate(values.endDateExclusive)
      ) {
        context.addIssue({
          code: "custom",

          path: ["endDateExclusive"],

          message: "Enter a valid exclusive end date.",
        });
      }

      if (
        isCalendarDate(values.eventDate) &&
        isCalendarDate(values.endDateExclusive) &&
        values.endDateExclusive <= values.eventDate
      ) {
        context.addIssue({
          code: "custom",

          path: ["endDateExclusive"],

          message: "The end boundary must be later than the event date.",
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

type PersonalEventActionValues = z.infer<typeof personalEventActionSchema>;

type EditPayload = {
  expectedEventVersion: number;

  action: "edit";

  title: string;

  temporalKind: "date" | "timed";

  eventDate: string | null;

  endDateExclusive: string | null;

  startsAt: string | null;

  endsAt: string | null;

  timezone: string | null;

  description: string | null;

  location: string | null;

  referenceUrl: string | null;

  reason: string | null;
};

type FinishPayload = {
  expectedEventVersion: number;

  action: "complete" | "cancel";

  reason: string | null;
};

type PersonalEventMutationPayload = EditPayload | FinishPayload;

type PendingPersonalEventMutation = {
  clientCommandId: string;

  payload: PersonalEventMutationPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type ApiProblem = {
  code: string | null;
  message: string | null;
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

async function patchPersonalEvent(
  eventId: string,
  command: PendingPersonalEventMutation,
): Promise<Response> {
  return fetch(`/api/v1/personal-events/${eventId}`, {
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

export interface PersonalEventActionsProps {
  event: GetPersonalEventDetailResult;

  workspaceTimezone: string;
}

export function PersonalEventActions({
  event,
  workspaceTimezone,
}: PersonalEventActionsProps) {
  const router = useRouter();

  const editTimezone =
    event.temporalKind === "timed" && event.timezone
      ? event.timezone
      : workspaceTimezone;

  const initialStartsLocal =
    event.temporalKind === "timed" && event.startsAt
      ? instantToLocalDateTime(event.startsAt, editTimezone)
      : "";

  const initialEndsLocal =
    event.temporalKind === "timed" && event.endsAt
      ? instantToLocalDateTime(event.endsAt, editTimezone)
      : "";

  const [pendingCommand, setPendingCommand] =
    useState<PendingPersonalEventMutation | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<PersonalEventActionValues>({
    resolver: zodResolver(personalEventActionSchema),

    defaultValues: {
      action: "edit",

      title: event.title,

      temporalKind: event.temporalKind,

      eventDate: event.eventDate ?? "",

      endDateExclusive: event.endDateExclusive ?? "",

      startsLocal: initialStartsLocal,

      endsLocal: initialEndsLocal,

      description: event.description ?? "",

      location: event.location ?? "",

      referenceUrl: event.referenceUrl ?? "",

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

  async function executeCommand(
    command: PendingPersonalEventMutation,
  ): Promise<void> {
    setSaveState("saving");

    setSaveError(null);

    try {
      const response = await patchPersonalEvent(event.eventId, command);

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
          "We couldn't confirm whether this personal event change was saved. Keep this page open and retry the same save.",
        );

        return;
      }

      setPendingCommand(null);

      setSaveState("idle");

      setSaveError(
        problem.code === "STALE_VERSION"
          ? "This personal event changed after the page was loaded. Reload before saving another change."
          : (problem.message ?? "The personal event could not be changed."),
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this personal event change was saved. Keep this page open and retry the same save.",
      );
    }
  }

  async function onSubmit(values: PersonalEventActionValues): Promise<void> {
    let payload: PersonalEventMutationPayload;

    if (values.action === "edit") {
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

        action: "edit",

        title: values.title.trim(),

        temporalKind: values.temporalKind,

        eventDate: values.temporalKind === "date" ? values.eventDate : null,

        endDateExclusive:
          values.temporalKind === "date" && values.endDateExclusive !== ""
            ? values.endDateExclusive
            : null,

        startsAt,

        endsAt,

        timezone: values.temporalKind === "timed" ? editTimezone : null,

        description: nullableText(values.description),

        location: nullableText(values.location),

        referenceUrl: nullableText(values.referenceUrl),

        reason: nullableText(values.reason),
      };
    } else {
      payload = {
        expectedEventVersion: event.version,

        action: values.action,

        reason: nullableText(values.reason),
      };
    }

    const command: PendingPersonalEventMutation = {
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
        "The previous save can no longer be retried safely. Reload the event before continuing.",
      );

      return;
    }

    await executeCommand(pendingCommand);
  }

  const primaryLabel =
    action === "edit"
      ? "Save event changes"
      : action === "complete"
        ? "Mark complete"
        : "Cancel event";

  return (
    <section
      aria-labelledby="personal-event-actions-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground"
    >
      <h2
        id="personal-event-actions-title"
        className="text-lg font-semibold text-foreground"
      >
        Manage personal event
      </h2>

      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Scheduled personal events can be edited, completed, or cancelled.
        Completed and cancelled events are terminal records.
      </p>

      <form
        noValidate
        className="mt-5 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
      >
        <FormField htmlFor="personal-event-action" label="Action">
          <select
            {...register("action")}
            id="personal-event-action"
            disabled={fieldsDisabled}
            className={selectClassName}
          >
            <option value="edit">Edit event</option>

            <option value="complete">Mark complete</option>

            <option value="cancel">Cancel event</option>
          </select>
        </FormField>

        {action === "edit" ? (
          <>
            <FormField
              htmlFor="personal-event-edit-title"
              label="Title"
              error={errors.title?.message}
              errorId="personal-event-edit-title-error"
            >
              <Input
                {...register("title")}
                id="personal-event-edit-title"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={
                  errors.title ? "personal-event-edit-title-error" : undefined
                }
              />
            </FormField>

            <div className="grid gap-5 md:grid-cols-2">
              <FormField
                htmlFor="personal-event-edit-temporal-kind"
                label="Schedule type"
              >
                <select
                  {...register("temporalKind")}
                  id="personal-event-edit-temporal-kind"
                  disabled={fieldsDisabled}
                  className={selectClassName}
                >
                  <option value="date">Date only</option>

                  <option value="timed">Specific time</option>
                </select>
              </FormField>

              {temporalKind === "date" ? (
                <FormField
                  htmlFor="personal-event-edit-date"
                  label="Date"
                  error={errors.eventDate?.message}
                  errorId="personal-event-edit-date-error"
                >
                  <Input
                    {...register("eventDate")}
                    id="personal-event-edit-date"
                    type="date"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.eventDate)}
                    aria-describedby={
                      errors.eventDate
                        ? "personal-event-edit-date-error"
                        : undefined
                    }
                  />
                </FormField>
              ) : (
                <FormField
                  htmlFor="personal-event-edit-start"
                  label="Start"
                  description={`Entered in ${editTimezone}.`}
                  descriptionId="personal-event-edit-start-description"
                  error={errors.startsLocal?.message}
                  errorId="personal-event-edit-start-error"
                >
                  <Input
                    {...register("startsLocal")}
                    id="personal-event-edit-start"
                    type="datetime-local"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.startsLocal)}
                    aria-describedby={[
                      "personal-event-edit-start-description",

                      errors.startsLocal
                        ? "personal-event-edit-start-error"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </FormField>
              )}

              {temporalKind === "date" ? (
                <FormField
                  htmlFor="personal-event-edit-end-date"
                  label="Ends before"
                  description="Optional exclusive end boundary for a multi-day event."
                  descriptionId="personal-event-edit-end-date-description"
                  error={errors.endDateExclusive?.message}
                  errorId="personal-event-edit-end-date-error"
                >
                  <Input
                    {...register("endDateExclusive")}
                    id="personal-event-edit-end-date"
                    type="date"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.endDateExclusive)}
                    aria-describedby={[
                      "personal-event-edit-end-date-description",

                      errors.endDateExclusive
                        ? "personal-event-edit-end-date-error"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </FormField>
              ) : (
                <FormField
                  htmlFor="personal-event-edit-end"
                  label="End"
                  description="Optional."
                  descriptionId="personal-event-edit-end-description"
                  error={errors.endsLocal?.message}
                  errorId="personal-event-edit-end-error"
                >
                  <Input
                    {...register("endsLocal")}
                    id="personal-event-edit-end"
                    type="datetime-local"
                    disabled={fieldsDisabled}
                    aria-invalid={Boolean(errors.endsLocal)}
                    aria-describedby={[
                      "personal-event-edit-end-description",

                      errors.endsLocal ? "personal-event-edit-end-error" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </FormField>
              )}

              <FormField
                htmlFor="personal-event-edit-location"
                label="Location"
                description="Optional."
                descriptionId="personal-event-edit-location-description"
              >
                <Input
                  {...register("location")}
                  id="personal-event-edit-location"
                  disabled={fieldsDisabled}
                  aria-describedby="personal-event-edit-location-description"
                />
              </FormField>

              <FormField
                htmlFor="personal-event-edit-reference"
                label="Reference URL"
                description="Optional HTTP or HTTPS link."
                descriptionId="personal-event-edit-reference-description"
                error={errors.referenceUrl?.message}
                errorId="personal-event-edit-reference-error"
              >
                <Input
                  {...register("referenceUrl")}
                  id="personal-event-edit-reference"
                  type="url"
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.referenceUrl)}
                  aria-describedby={[
                    "personal-event-edit-reference-description",

                    errors.referenceUrl
                      ? "personal-event-edit-reference-error"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </FormField>
            </div>

            <FormField
              htmlFor="personal-event-edit-description"
              label="Description"
              description="Optional context or preparation details."
              descriptionId="personal-event-edit-description-description"
              error={errors.description?.message}
              errorId="personal-event-edit-description-error"
            >
              <Textarea
                {...register("description")}
                id="personal-event-edit-description"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={[
                  "personal-event-edit-description-description",

                  errors.description
                    ? "personal-event-edit-description-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          </>
        ) : (
          <p className="rounded-control border border-border bg-surface-subtle px-4 py-3 text-sm leading-6 text-muted-foreground">
            {action === "complete"
              ? "Completing this event removes it from the active Agenda while preserving the historical source record."
              : "Cancelling this event removes it from the active Agenda while preserving the historical source record."}
          </p>
        )}

        <FormField
          htmlFor="personal-event-edit-reason"
          label="Change reason"
          description="Optional context recorded with the audit revision."
          descriptionId="personal-event-edit-reason-description"
          error={errors.reason?.message}
          errorId="personal-event-edit-reason-error"
        >
          <Textarea
            {...register("reason")}
            id="personal-event-edit-reason"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={[
              "personal-event-edit-reason-description",

              errors.reason ? "personal-event-edit-reason-error" : null,
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
            Personal event updated.
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
            loadingLabel="Saving event…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            {primaryLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}
