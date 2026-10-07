"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CAREER_APPLICATION_OUTCOMES,
  CAREER_APPLICATION_STAGES,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
} from "@/modules/career/domain/application";
import { isCalendarDate } from "@/shared/calendar-date";

function isValidCalendarDate(value: string): boolean {
  return isCalendarDate(value);
}

const optionalOutcomeSchema = z.union([
  z.literal(""),
  z.enum(CAREER_APPLICATION_OUTCOMES),
]);

const stageTransitionSchema = z
  .object({
    stage: z.enum(CAREER_APPLICATION_STAGES),

    outcome: optionalOutcomeSchema,

    effectiveDate: z.string().refine(isValidCalendarDate, {
      message: "Enter a valid effective date.",
    }),

    appliedDate: z.string(),

    reason: z.string().max(2000),
  })
  .superRefine((values, context) => {
    if (
      values.stage !== "saved" &&
      values.appliedDate !== "" &&
      !isValidCalendarDate(values.appliedDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["appliedDate"],
        message: "Enter a valid applied date.",
      });
    }

    if (
      values.stage === "applied" &&
      isValidCalendarDate(values.appliedDate) &&
      values.effectiveDate !== values.appliedDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveDate"],
        message: "The Applied stage must use the actual applied date.",
      });
    }

    if (
      values.stage !== "saved" &&
      isValidCalendarDate(values.appliedDate) &&
      values.effectiveDate < values.appliedDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveDate"],
        message:
          "A submitted application stage cannot be effective before the applied date.",
      });
    }

    if (values.stage === "accepted" && values.outcome !== "accepted") {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "The Accepted stage requires the Accepted outcome.",
      });
    }

    if (values.stage !== "accepted" && values.outcome === "accepted") {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "The Accepted outcome requires the Accepted stage.",
      });
    }
  });

type StageTransitionValues = z.infer<typeof stageTransitionSchema>;

type StageTransitionPayload = {
  expectedVersion: number;

  stage: CareerApplicationStage;

  outcome: CareerApplicationOutcome | null;

  effectiveDate: string;

  appliedDate: string | null;

  reason: string | null;
};

type PendingStageCommand = {
  clientCommandId: string;

  payload: StageTransitionPayload;
};

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type ApiProblem = {
  code: string | null;
  message: string | null;
};

const stageLabels: Record<CareerApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  technical_assessment: "Technical assessment",
  final_interview: "Final interview",
  offer: "Offer",
  accepted: "Accepted",
};

const outcomeLabels: Record<CareerApplicationOutcome, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  offer_declined: "Offer declined",
  offer_expired: "Offer expired",
  employer_cancelled: "Employer cancelled",
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

async function postStageTransition(
  applicationId: string,
  command: PendingStageCommand,
): Promise<Response> {
  return fetch(`/api/v1/applications/${applicationId}`, {
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

export interface ApplicationStageTransitionFormProps {
  applicationId: string;

  applicationVersion: number;

  currentStage: CareerApplicationStage;

  currentOutcome: CareerApplicationOutcome | null;

  appliedDate: string | null;
}

export function ApplicationStageTransitionForm({
  applicationId,
  applicationVersion,
  currentStage,
  currentOutcome,
  appliedDate,
}: ApplicationStageTransitionFormProps) {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingStageCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<StageTransitionValues>({
    resolver: zodResolver(stageTransitionSchema),

    defaultValues: {
      stage: currentStage,

      outcome: currentOutcome ?? "",

      effectiveDate:
        currentStage === "applied" && appliedDate ? appliedDate : "",

      appliedDate: appliedDate ?? "",

      reason: "",
    },
  });

  const selectedStage = useWatch({
    control,
    name: "stage",
  });

  const selectedOutcome = useWatch({
    control,
    name: "outcome",
  });

  const selectedAppliedDate = useWatch({
    control,
    name: "appliedDate",
  });

  useEffect(() => {
    if (
      selectedStage === "applied" &&
      isValidCalendarDate(selectedAppliedDate)
    ) {
      setValue("effectiveDate", selectedAppliedDate, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [selectedAppliedDate, selectedStage, setValue]);

  useEffect(() => {
    if (selectedStage === "accepted" && selectedOutcome !== "accepted") {
      setValue("outcome", "accepted", {
        shouldDirty: false,
        shouldValidate: false,
      });

      return;
    }

    if (selectedStage !== "accepted" && selectedOutcome === "accepted") {
      setValue("outcome", "", {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [selectedOutcome, selectedStage, setValue]);

  const availableStages =
    appliedDate === null
      ? CAREER_APPLICATION_STAGES
      : CAREER_APPLICATION_STAGES.filter((stage) => stage !== "saved");

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeCommand(command: PendingStageCommand): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postStageTransition(applicationId, command);

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
          "We couldn't confirm whether this stage change was saved. Keep this page open and retry the same save.",
        );

        return;
      }

      setPendingCommand(null);
      setSaveState("idle");

      setSaveError(
        problem.code === "STALE_VERSION"
          ? "This application changed after the page was loaded. Reload the page before recording another stage change."
          : (problem.message ?? "The stage change could not be saved."),
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this stage change was saved. Keep this page open and retry the same save.",
      );
    }
  }

  async function onSubmit(values: StageTransitionValues): Promise<void> {
    const payload: StageTransitionPayload = {
      expectedVersion: applicationVersion,

      stage: values.stage,

      outcome: values.outcome === "" ? null : values.outcome,

      effectiveDate: values.effectiveDate,

      appliedDate:
        appliedDate ?? (values.stage === "saved" ? null : values.appliedDate),

      reason: nullableText(values.reason),
    };

    const command: PendingStageCommand = {
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
      aria-labelledby="application-stage-transition-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground"
    >
      <h2
        id="application-stage-transition-title"
        className="text-lg font-semibold text-foreground"
      >
        Record stage change
      </h2>

      <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Stage changes append dated history. They do not rewrite earlier
        observations. Reopening a terminal application requires a reason.
      </p>

      <form
        noValidate
        className="mt-5 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="career-transition-stage"
            label="Stage"
            error={errors.stage?.message}
            errorId="career-transition-stage-error"
          >
            <select
              {...register("stage")}
              id="career-transition-stage"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.stage)}
              aria-describedby={
                errors.stage ? "career-transition-stage-error" : undefined
              }
              className={selectClassName}
            >
              {availableStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            htmlFor="career-transition-outcome"
            label="Outcome"
            description="Leave blank while the attempt remains active."
            descriptionId="career-transition-outcome-description"
            error={errors.outcome?.message}
            errorId="career-transition-outcome-error"
          >
            <select
              {...register("outcome")}
              id="career-transition-outcome"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.outcome)}
              aria-describedby={[
                "career-transition-outcome-description",
                errors.outcome ? "career-transition-outcome-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              className={selectClassName}
            >
              <option value="">No outcome yet</option>

              {CAREER_APPLICATION_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcomeLabels[outcome]}
                </option>
              ))}
            </select>
          </FormField>

          {appliedDate === null && selectedStage !== "saved" ? (
            <FormField
              htmlFor="career-transition-applied-date"
              label="Applied date"
              description="Required when this is the application's first submitted stage."
              descriptionId="career-transition-applied-date-description"
              error={errors.appliedDate?.message}
              errorId="career-transition-applied-date-error"
            >
              <Input
                {...register("appliedDate")}
                id="career-transition-applied-date"
                type="date"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.appliedDate)}
                aria-describedby={[
                  "career-transition-applied-date-description",
                  errors.appliedDate
                    ? "career-transition-applied-date-error"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          ) : null}

          <FormField
            htmlFor="career-transition-effective-date"
            label="Stage effective date"
            description="Use when this stage actually became effective, not when you happened to enter it."
            descriptionId="career-transition-effective-date-description"
            error={errors.effectiveDate?.message}
            errorId="career-transition-effective-date-error"
          >
            <Input
              {...register("effectiveDate")}
              id="career-transition-effective-date"
              type="date"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.effectiveDate)}
              aria-describedby={[
                "career-transition-effective-date-description",
                errors.effectiveDate
                  ? "career-transition-effective-date-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </div>

        <FormField
          htmlFor="career-transition-reason"
          label="Reason or note"
          description="Optional for ordinary progression; required when reopening a terminal application."
          descriptionId="career-transition-reason-description"
          error={errors.reason?.message}
          errorId="career-transition-reason-error"
        >
          <Textarea
            {...register("reason")}
            id="career-transition-reason"
            disabled={fieldsDisabled}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={[
              "career-transition-reason-description",
              errors.reason ? "career-transition-reason-error" : null,
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
            Stage history saved.
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
            loadingLabel="Saving stage…"
            disabled={saveState === "unconfirmed" || saveState === "saved"}
          >
            Record stage change
          </Button>
        </div>
      </form>
    </section>
  );
}
