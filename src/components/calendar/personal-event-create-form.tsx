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
import { isCalendarDate } from "@/shared/calendar-date";

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

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

const personalEventSchema = z
  .object({
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

      if (
        values.endDateExclusive !== "" &&
        !isValidCalendarDate(values.endDateExclusive)
      ) {
        context.addIssue({
          code: "custom",
          path: ["endDateExclusive"],
          message: "Enter a valid end date.",
        });
      }

      if (
        isValidCalendarDate(values.eventDate) &&
        isValidCalendarDate(values.endDateExclusive) &&
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

type PersonalEventValues = z.infer<typeof personalEventSchema>;

type PersonalEventPayload = {
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
};

type PendingPersonalEventCommand = {
  clientCommandId: string;

  payload: PersonalEventPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type ApiProblem = {
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
        message: null,
      };
    }

    const record = body as Record<string, unknown>;

    return {
      message: typeof record.message === "string" ? record.message : null,
    };
  } catch {
    return {
      message: null,
    };
  }
}

async function postPersonalEvent(
  command: PendingPersonalEventCommand,
): Promise<Response> {
  return fetch("/api/v1/personal-events", {
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

export interface PersonalEventCreateFormProps {
  workspaceTimezone: string;
}

export function PersonalEventCreateForm({
  workspaceTimezone,
}: PersonalEventCreateFormProps) {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingPersonalEventCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<PersonalEventValues>({
    resolver: zodResolver(personalEventSchema),

    defaultValues: {
      title: "",

      temporalKind: "date",

      eventDate: "",

      endDateExclusive: "",

      startsLocal: "",

      endsLocal: "",

      description: "",

      location: "",

      referenceUrl: "",
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

  async function executeCommand(
    command: PendingPersonalEventCommand,
  ): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postPersonalEvent(command);

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
          "We couldn't confirm whether this personal event was saved. Keep this page open and retry the same save.",
        );

        return;
      }

      setPendingCommand(null);

      setSaveState("idle");

      setSaveError(
        problem.message ?? "The personal event could not be created.",
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this personal event was saved. Keep this page open and retry the same save.",
      );
    }
  }

  async function onSubmit(values: PersonalEventValues): Promise<void> {
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

    const payload: PersonalEventPayload = {
      title: values.title.trim(),

      temporalKind: values.temporalKind,

      eventDate: values.temporalKind === "date" ? values.eventDate : null,

      endDateExclusive:
        values.temporalKind === "date" && values.endDateExclusive !== ""
          ? values.endDateExclusive
          : null,

      startsAt,

      endsAt,

      timezone: values.temporalKind === "timed" ? workspaceTimezone : null,

      description: nullableText(values.description),

      location: nullableText(values.location),

      referenceUrl: nullableText(values.referenceUrl),
    };

    const command: PendingPersonalEventCommand = {
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
        "The previous save can no longer be retried safely. Reload Calendar before continuing.",
      );

      return;
    }

    await executeCommand(pendingCommand);
  }

  return (
    <section
      aria-labelledby="personal-event-create-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground"
    >
      <h2
        id="personal-event-create-title"
        className="text-lg font-semibold text-foreground"
      >
        Add personal event
      </h2>

      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Personal events are Calendar-owned source records. Timed events use your
        workspace timezone:{" "}
        <span className="font-medium text-foreground">{workspaceTimezone}</span>
        .
      </p>

      <form
        noValidate
        className="mt-5 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
      >
        <FormField
          htmlFor="personal-event-title"
          label="Title"
          error={errors.title?.message}
          errorId="personal-event-title-error"
        >
          <Input
            {...register("title")}
            id="personal-event-title"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={
              errors.title ? "personal-event-title-error" : undefined
            }
          />
        </FormField>

        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="personal-event-temporal-kind"
            label="Schedule type"
          >
            <select
              {...register("temporalKind")}
              id="personal-event-temporal-kind"
              disabled={fieldsDisabled}
              className={selectClassName}
            >
              <option value="date">Date only</option>

              <option value="timed">Specific time</option>
            </select>
          </FormField>

          {temporalKind === "date" ? (
            <FormField
              htmlFor="personal-event-date"
              label="Date"
              error={errors.eventDate?.message}
              errorId="personal-event-date-error"
            >
              <Input
                {...register("eventDate")}
                id="personal-event-date"
                type="date"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.eventDate)}
                aria-describedby={
                  errors.eventDate ? "personal-event-date-error" : undefined
                }
              />
            </FormField>
          ) : (
            <FormField
              htmlFor="personal-event-start"
              label="Start"
              description={`Entered in ${workspaceTimezone}.`}
              descriptionId="personal-event-start-description"
              error={errors.startsLocal?.message}
              errorId="personal-event-start-error"
            >
              <Input
                {...register("startsLocal")}
                id="personal-event-start"
                type="datetime-local"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.startsLocal)}
                aria-describedby={[
                  "personal-event-start-description",
                  errors.startsLocal ? "personal-event-start-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          )}

          {temporalKind === "date" ? (
            <FormField
              htmlFor="personal-event-end-date"
              label="Ends before"
              description="Optional. For a multi-day event, enter the first date that is not part of the event."
              descriptionId="personal-event-end-date-description"
              error={errors.endDateExclusive?.message}
              errorId="personal-event-end-date-error"
            >
              <Input
                {...register("endDateExclusive")}
                id="personal-event-end-date"
                type="date"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.endDateExclusive)}
                aria-describedby={[
                  "personal-event-end-date-description",
                  errors.endDateExclusive
                    ? "personal-event-end-date-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          ) : (
            <FormField
              htmlFor="personal-event-end"
              label="End"
              description="Optional."
              descriptionId="personal-event-end-description"
              error={errors.endsLocal?.message}
              errorId="personal-event-end-error"
            >
              <Input
                {...register("endsLocal")}
                id="personal-event-end"
                type="datetime-local"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.endsLocal)}
                aria-describedby={[
                  "personal-event-end-description",
                  errors.endsLocal ? "personal-event-end-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          )}

          <FormField
            htmlFor="personal-event-location"
            label="Location"
            description="Optional."
            descriptionId="personal-event-location-description"
          >
            <Input
              {...register("location")}
              id="personal-event-location"
              disabled={fieldsDisabled}
              aria-describedby="personal-event-location-description"
            />
          </FormField>

          <FormField
            htmlFor="personal-event-reference"
            label="Reference URL"
            description="Optional HTTP or HTTPS link related to this event."
            descriptionId="personal-event-reference-description"
            error={errors.referenceUrl?.message}
            errorId="personal-event-reference-error"
          >
            <Input
              {...register("referenceUrl")}
              id="personal-event-reference"
              type="url"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.referenceUrl)}
              aria-describedby={[
                "personal-event-reference-description",
                errors.referenceUrl ? "personal-event-reference-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </div>

        <FormField
          htmlFor="personal-event-description"
          label="Description"
          description="Optional context, preparation, or reminder details."
          descriptionId="personal-event-description-description"
          error={errors.description?.message}
          errorId="personal-event-description-error"
        >
          <Textarea
            {...register("description")}
            id="personal-event-description"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={[
              "personal-event-description-description",
              errors.description ? "personal-event-description-error" : null,
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
            Personal event created.
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
            loadingLabel="Creating event…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            Add personal event
          </Button>
        </div>
      </form>
    </section>
  );
}
