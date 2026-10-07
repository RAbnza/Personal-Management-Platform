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
import {
  CAREER_ACTIONABLE_EVENT_KINDS,
  type CareerActionableEventKind,
} from "@/modules/career/domain/application-event";
import { isCalendarDate } from "@/shared/calendar-date";

function isValidCalendarDate(value: string): boolean {
  return isCalendarDate(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

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

const applicationEventSchema = z
  .object({
    eventKind: z.enum(CAREER_ACTIONABLE_EVENT_KINDS),

    title: z.string().trim().min(1, "Enter an event title.").max(200),

    temporalKind: z.enum(["date", "timed"]),

    eventDate: z.string(),

    startsLocal: z.string(),

    endsLocal: z.string(),

    location: z.string().max(500),

    meetingUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => value === "" || isHttpUrl(value), {
        message: "Enter a valid HTTP or HTTPS meeting URL.",
      }),

    preparationNotes: z.string().max(20_000),

    setAsNextAction: z.boolean(),
  })
  .superRefine((values, context) => {
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

type ApplicationEventValues = z.infer<typeof applicationEventSchema>;

type EventPayload = {
  eventKind: CareerActionableEventKind;

  title: string;

  temporalKind: "date" | "timed";

  eventDate: string | null;

  startsAt: string | null;

  endsAt: string | null;

  timezone: string | null;

  location: string | null;

  meetingUrl: string | null;

  preparationNotes: string | null;

  setAsNextAction: boolean;

  expectedApplicationVersion: number | undefined;
};

type PendingEventCommand = {
  clientCommandId: string;

  payload: EventPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type ApiProblem = {
  code: string | null;
  message: string | null;
};

const eventKindLabels: Record<CareerActionableEventKind, string> = {
  interview: "Interview",
  assessment: "Assessment",
  follow_up: "Follow-up",
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

async function postEvent(
  applicationId: string,
  command: PendingEventCommand,
): Promise<Response> {
  return fetch(`/api/v1/applications/${applicationId}/events`, {
    method: "POST",

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

export interface ApplicationEventCreateFormProps {
  applicationId: string;

  applicationVersion: number;

  workspaceTimezone: string;
}

export function ApplicationEventCreateForm({
  applicationId,
  applicationVersion,
  workspaceTimezone,
}: ApplicationEventCreateFormProps) {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingEventCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ApplicationEventValues>({
    resolver: zodResolver(applicationEventSchema),

    defaultValues: {
      eventKind: "follow_up",

      title: "",

      temporalKind: "date",

      eventDate: "",

      startsLocal: "",

      endsLocal: "",

      location: "",

      meetingUrl: "",

      preparationNotes: "",

      setAsNextAction: true,
    },
  });

  const temporalKind = useWatch({
    control,
    name: "temporalKind",
  });

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeCommand(command: PendingEventCommand): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postEvent(applicationId, command);

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
          "We couldn't confirm whether this event was scheduled. Keep this page open and retry the same save.",
        );

        return;
      }

      setPendingCommand(null);

      setSaveState("idle");

      setSaveError(
        problem.code === "STALE_VERSION"
          ? "The application changed after this page was loaded. Reload it before changing the next action."
          : (problem.message ?? "The Career event could not be scheduled."),
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this event was scheduled. Keep this page open and retry the same save.",
      );
    }
  }

  async function onSubmit(values: ApplicationEventValues): Promise<void> {
    let startsAt: string | null = null;

    let endsAt: string | null = null;

    if (values.temporalKind === "timed") {
      try {
        startsAt = localDateTimeToInstant(
          values.startsLocal,
          workspaceTimezone,
        );
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
          endsAt = localDateTimeToInstant(values.endsLocal, workspaceTimezone);
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

    const payload: EventPayload = {
      eventKind: values.eventKind,

      title: values.title.trim(),

      temporalKind: values.temporalKind,

      eventDate: values.temporalKind === "date" ? values.eventDate : null,

      startsAt,

      endsAt,

      timezone: values.temporalKind === "timed" ? workspaceTimezone : null,

      location: nullableText(values.location),

      meetingUrl: nullableText(values.meetingUrl),

      preparationNotes: nullableText(values.preparationNotes),

      setAsNextAction: values.setAsNextAction,

      expectedApplicationVersion: values.setAsNextAction
        ? applicationVersion
        : undefined,
    };

    const command: PendingEventCommand = {
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

  return (
    <section
      aria-labelledby="application-event-create-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground"
    >
      <h2
        id="application-event-create-title"
        className="text-lg font-semibold text-foreground"
      >
        Schedule Career activity
      </h2>

      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Interviews, assessments, and follow-ups are real Career source records.
        Timed events use your workspace timezone:{" "}
        <span className="font-medium text-foreground">{workspaceTimezone}</span>
        .
      </p>

      <form
        noValidate
        className="mt-5 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="career-event-kind"
            label="Activity type"
            error={errors.eventKind?.message}
            errorId="career-event-kind-error"
          >
            <select
              {...register("eventKind")}
              id="career-event-kind"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.eventKind)}
              className={selectClassName}
            >
              {CAREER_ACTIONABLE_EVENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {eventKindLabels[kind]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="career-event-title"
            label="Title"
            error={errors.title?.message}
            errorId="career-event-title-error"
          >
            <Input
              {...register("title")}
              id="career-event-title"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={
                errors.title ? "career-event-title-error" : undefined
              }
            />
          </FormField>

          <FormField htmlFor="career-event-temporal-kind" label="Schedule type">
            <select
              {...register("temporalKind")}
              id="career-event-temporal-kind"
              disabled={fieldsDisabled}
              className={selectClassName}
            >
              <option value="date">Date only</option>

              <option value="timed">Specific time</option>
            </select>
          </FormField>

          {temporalKind === "date" ? (
            <FormField
              htmlFor="career-event-date"
              label="Date"
              error={errors.eventDate?.message}
              errorId="career-event-date-error"
            >
              <Input
                {...register("eventDate")}
                id="career-event-date"
                type="date"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.eventDate)}
                aria-describedby={
                  errors.eventDate ? "career-event-date-error" : undefined
                }
              />
            </FormField>
          ) : (
            <>
              <FormField
                htmlFor="career-event-start"
                label="Start"
                description={`Entered in ${workspaceTimezone}.`}
                descriptionId="career-event-start-description"
                error={errors.startsLocal?.message}
                errorId="career-event-start-error"
              >
                <Input
                  {...register("startsLocal")}
                  id="career-event-start"
                  type="datetime-local"
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.startsLocal)}
                  aria-describedby={[
                    "career-event-start-description",
                    errors.startsLocal ? "career-event-start-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </FormField>

              <FormField
                htmlFor="career-event-end"
                label="End"
                description="Optional."
                descriptionId="career-event-end-description"
                error={errors.endsLocal?.message}
                errorId="career-event-end-error"
              >
                <Input
                  {...register("endsLocal")}
                  id="career-event-end"
                  type="datetime-local"
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.endsLocal)}
                  aria-describedby={[
                    "career-event-end-description",
                    errors.endsLocal ? "career-event-end-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </FormField>
            </>
          )}

          <FormField
            htmlFor="career-event-location"
            label="Location"
            description="Optional physical or descriptive location."
            descriptionId="career-event-location-description"
          >
            <Input
              {...register("location")}
              id="career-event-location"
              disabled={fieldsDisabled}
              aria-describedby="career-event-location-description"
            />
          </FormField>

          <FormField
            htmlFor="career-event-meeting-url"
            label="Meeting URL"
            description="Optional HTTP or HTTPS meeting link."
            descriptionId="career-event-meeting-url-description"
            error={errors.meetingUrl?.message}
            errorId="career-event-meeting-url-error"
          >
            <Input
              {...register("meetingUrl")}
              id="career-event-meeting-url"
              type="url"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.meetingUrl)}
              aria-describedby={[
                "career-event-meeting-url-description",
                errors.meetingUrl ? "career-event-meeting-url-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </div>

        <FormField
          htmlFor="career-event-preparation"
          label="Preparation notes"
          description="Optional preparation, questions, requirements, or reminders."
          descriptionId="career-event-preparation-description"
          error={errors.preparationNotes?.message}
          errorId="career-event-preparation-error"
        >
          <Textarea
            {...register("preparationNotes")}
            id="career-event-preparation"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.preparationNotes)}
            aria-describedby={[
              "career-event-preparation-description",
              errors.preparationNotes ? "career-event-preparation-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </FormField>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-border bg-surface-subtle px-4 py-3">
          <input
            {...register("setAsNextAction")}
            type="checkbox"
            disabled={fieldsDisabled}
            className="mt-0.5 size-5 shrink-0"
          />

          <span>
            <span className="block text-sm font-medium text-foreground">
              Set as this application&apos;s next action
            </span>

            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
              The application will point to this event as its authoritative next
              action. The agenda will later project this same source record
              rather than creating a copy.
            </span>
          </span>
        </label>

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
            Career activity scheduled.
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
            loading={saveState === "saving"}
            loadingLabel="Scheduling activity…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            Schedule activity
          </Button>
        </div>
      </form>
    </section>
  );
}
