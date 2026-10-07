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
  CAREER_WORK_ARRANGEMENTS,
  type CareerApplicationOutcome,
  type CareerApplicationStage,
  type CareerWorkArrangement,
} from "@/modules/career/domain/application";
import { isCalendarDate } from "@/shared/calendar-date";

const optionalOutcomeSchema = z.union([
  z.literal(""),
  z.enum(CAREER_APPLICATION_OUTCOMES),
]);

const optionalWorkArrangementSchema = z.union([
  z.literal(""),
  z.enum(CAREER_WORK_ARRANGEMENTS),
]);

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

function parseTechnologyTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const applicationFormSchema = z
  .object({
    companyName: z.string().trim().min(1, "Enter the company name.").max(200),

    roleTitle: z.string().trim().min(1, "Enter the role title.").max(200),

    initialStage: z.enum(CAREER_APPLICATION_STAGES),

    initialOutcome: optionalOutcomeSchema,

    appliedDate: z.string(),

    stageEffectiveDate: z.string().refine(isValidCalendarDate, {
      message: "Enter a valid stage effective date.",
    }),

    stageReason: z.string().max(2000),

    postingUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => value === "" || isHttpUrl(value), {
        message: "Enter a valid HTTP or HTTPS posting URL.",
      }),

    sourceName: z.string().max(200),

    location: z.string().max(500),

    workArrangement: optionalWorkArrangementSchema,

    roleDescriptionSnapshot: z.string().max(20_000),

    technologyTags: z.string(),

    notes: z.string().max(20_000),
  })
  .superRefine((values, context) => {
    const appliedDate = values.appliedDate.trim();

    if (values.initialStage === "saved") {
      if (appliedDate !== "") {
        context.addIssue({
          code: "custom",
          path: ["appliedDate"],
          message:
            "A saved opportunity has not been submitted and must not have an applied date.",
        });
      }
    } else if (!isValidCalendarDate(appliedDate)) {
      context.addIssue({
        code: "custom",
        path: ["appliedDate"],
        message: "Submitted applications require a valid applied date.",
      });
    }

    if (
      values.initialStage === "applied" &&
      isValidCalendarDate(appliedDate) &&
      values.stageEffectiveDate !== appliedDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["stageEffectiveDate"],
        message:
          "The Applied stage effective date must match the applied date.",
      });
    }

    if (
      values.initialStage !== "saved" &&
      values.initialStage !== "applied" &&
      isValidCalendarDate(appliedDate) &&
      values.stageEffectiveDate < appliedDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["stageEffectiveDate"],
        message:
          "The current stage effective date cannot be earlier than the applied date.",
      });
    }

    if (
      values.initialStage === "accepted" &&
      values.initialOutcome !== "accepted"
    ) {
      context.addIssue({
        code: "custom",
        path: ["initialOutcome"],
        message: "The Accepted stage requires the Accepted outcome.",
      });
    }

    if (
      values.initialStage !== "accepted" &&
      values.initialOutcome === "accepted"
    ) {
      context.addIssue({
        code: "custom",
        path: ["initialOutcome"],
        message: "The Accepted outcome requires the Accepted stage.",
      });
    }

    const technologies = parseTechnologyTags(values.technologyTags);

    if (technologies.length > 50) {
      context.addIssue({
        code: "custom",
        path: ["technologyTags"],
        message: "Enter no more than 50 technology tags.",
      });
    }

    const normalized = new Set<string>();

    for (const technology of technologies) {
      if (technology.length > 100) {
        context.addIssue({
          code: "custom",
          path: ["technologyTags"],
          message: "Each technology tag must be 100 characters or fewer.",
        });

        break;
      }

      const key = technology.toLowerCase();

      if (normalized.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["technologyTags"],
          message: "Technology tags must not contain duplicates.",
        });

        break;
      }

      normalized.add(key);
    }
  });

type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

type ApplicationPayload = {
  companyName: string;
  roleTitle: string;

  postingUrl: string | null;
  sourceName: string | null;
  roleDescriptionSnapshot: string | null;
  location: string | null;
  workArrangement: CareerWorkArrangement | null;

  technologyTags: string[];

  appliedDate: string | null;

  initialStage: CareerApplicationStage;
  initialOutcome: CareerApplicationOutcome | null;

  initialStageEffectiveDate: string;
  initialStageReason: string | null;

  notes: string | null;

  allowPossibleDuplicate: boolean;
};

type PendingApplicationCommand = {
  clientCommandId: string;
  payload: ApplicationPayload;
};

type SaveState = "idle" | "saving" | "duplicate" | "unconfirmed" | "saved";

type ApiProblem = {
  code: string | null;
  message: string | null;
};

const stageLabels: Record<CareerApplicationStage, string> = {
  saved: "Saved opportunity",
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

const workArrangementLabels: Record<CareerWorkArrangement, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  unspecified: "Unspecified",
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

async function postApplication(
  command: PendingApplicationCommand,
): Promise<Response> {
  return fetch("/api/v1/applications", {
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

export interface JobApplicationCreateFormProps {
  workspaceCurrency: string;
}

export function JobApplicationCreateForm({
  workspaceCurrency,
}: JobApplicationCreateFormProps) {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingApplicationCommand | null>(null);

  const [duplicatePayload, setDuplicatePayload] =
    useState<ApplicationPayload | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),

    defaultValues: {
      companyName: "",
      roleTitle: "",

      initialStage: "applied",
      initialOutcome: "",

      appliedDate: "",
      stageEffectiveDate: "",
      stageReason: "",

      postingUrl: "",
      sourceName: "",
      location: "",
      workArrangement: "",

      roleDescriptionSnapshot: "",
      technologyTags: "",

      notes: "",
    },
  });

  const initialStage = useWatch({
    control,
    name: "initialStage",
  });

  const initialOutcome = useWatch({
    control,
    name: "initialOutcome",
  });

  const appliedDate = useWatch({
    control,
    name: "appliedDate",
  });

  useEffect(() => {
    if (initialStage === "saved") {
      setValue("appliedDate", "", {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [initialStage, setValue]);

  useEffect(() => {
    if (initialStage === "applied" && isValidCalendarDate(appliedDate)) {
      setValue("stageEffectiveDate", appliedDate, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [appliedDate, initialStage, setValue]);

  useEffect(() => {
    if (initialStage === "accepted" && initialOutcome !== "accepted") {
      setValue("initialOutcome", "accepted", {
        shouldDirty: false,
        shouldValidate: false,
      });

      return;
    }

    if (initialStage !== "accepted" && initialOutcome === "accepted") {
      setValue("initialOutcome", "", {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [initialOutcome, initialStage, setValue]);

  const fieldsDisabled =
    saveState === "saving" ||
    saveState === "duplicate" ||
    saveState === "unconfirmed" ||
    saveState === "saved";

  async function executeApplication(
    command: PendingApplicationCommand,
  ): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await postApplication(command);

      if (response.ok) {
        setPendingCommand(null);
        setDuplicatePayload(null);
        setSaveState("saved");

        router.push("/career/applications");
        router.refresh();

        return;
      }

      const problem = await readApiProblem(response);

      if (
        response.status === 409 &&
        problem.code === "POSSIBLE_DUPLICATE_APPLICATION"
      ) {
        setPendingCommand(null);

        setDuplicatePayload({
          ...command.payload,
          allowPossibleDuplicate: true,
        });

        setSaveState("duplicate");

        return;
      }

      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether this application was saved. Keep this page open and retry the same save before creating another application.",
        );

        return;
      }

      setPendingCommand(null);
      setSaveState("idle");

      setSaveError(
        problem.message ??
          "The application could not be saved. Review the information and try again.",
      );
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether this application was saved. Keep this page open and retry the same save before creating another application.",
      );
    }
  }

  async function onSubmit(values: ApplicationFormValues): Promise<void> {
    const payload: ApplicationPayload = {
      companyName: values.companyName.trim(),
      roleTitle: values.roleTitle.trim(),

      postingUrl: nullableText(values.postingUrl),
      sourceName: nullableText(values.sourceName),
      roleDescriptionSnapshot: nullableText(values.roleDescriptionSnapshot),
      location: nullableText(values.location),

      workArrangement:
        values.workArrangement === "" ? null : values.workArrangement,

      technologyTags: parseTechnologyTags(values.technologyTags),

      appliedDate: values.initialStage === "saved" ? null : values.appliedDate,

      initialStage: values.initialStage,

      initialOutcome:
        values.initialOutcome === "" ? null : values.initialOutcome,

      initialStageEffectiveDate: values.stageEffectiveDate,

      initialStageReason: nullableText(values.stageReason),

      notes: nullableText(values.notes),

      allowPossibleDuplicate: false,
    };

    const command: PendingApplicationCommand = {
      clientCommandId: crypto.randomUUID(),
      payload,
    };

    setPendingCommand(command);
    setDuplicatePayload(null);

    await executeApplication(command);
  }

  async function confirmSeparateAttempt(): Promise<void> {
    if (!duplicatePayload) {
      setSaveState("idle");

      setSaveError(
        "The duplicate confirmation can no longer be resolved safely. Review the form and submit it again.",
      );

      return;
    }

    const command: PendingApplicationCommand = {
      clientCommandId: crypto.randomUUID(),
      payload: duplicatePayload,
    };

    setPendingCommand(command);

    await executeApplication(command);
  }

  async function retryUnconfirmedSave(): Promise<void> {
    if (!pendingCommand) {
      setSaveState("idle");

      setSaveError(
        "The previous save can no longer be retried safely. Reload the page before continuing.",
      );

      return;
    }

    await executeApplication(pendingCommand);
  }

  return (
    <section
      aria-labelledby="create-application-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div>
        <p className="text-xs font-medium text-link">Career</p>

        <h2
          id="create-application-title"
          className="mt-1 text-lg font-semibold text-foreground"
        >
          Application details
        </h2>

        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
          Record one application attempt or saved opportunity. Stage changes
          remain dated history rather than overwriting the past.
        </p>
      </div>

      <form
        noValidate
        className="mt-6 space-y-7"
        onSubmit={handleSubmit(onSubmit)}
      >
        <fieldset disabled={fieldsDisabled} className="space-y-5">
          <legend className="text-sm font-semibold text-foreground">
            Role
          </legend>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField
              htmlFor="career-company-name"
              label="Company"
              error={errors.companyName?.message}
              errorId="career-company-name-error"
            >
              <Input
                {...register("companyName")}
                id="career-company-name"
                autoComplete="organization"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.companyName)}
                aria-describedby={
                  errors.companyName ? "career-company-name-error" : undefined
                }
              />
            </FormField>

            <FormField
              htmlFor="career-role-title"
              label="Role title"
              error={errors.roleTitle?.message}
              errorId="career-role-title-error"
            >
              <Input
                {...register("roleTitle")}
                id="career-role-title"
                autoComplete="off"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.roleTitle)}
                aria-describedby={
                  errors.roleTitle ? "career-role-title-error" : undefined
                }
              />
            </FormField>

            <FormField
              htmlFor="career-posting-url"
              label="Posting URL"
              description="Optional. The saved role-description snapshot below remains useful if this link later expires."
              descriptionId="career-posting-url-description"
              error={errors.postingUrl?.message}
              errorId="career-posting-url-error"
            >
              <Input
                {...register("postingUrl")}
                id="career-posting-url"
                type="url"
                autoComplete="url"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.postingUrl)}
                aria-describedby={[
                  "career-posting-url-description",
                  errors.postingUrl ? "career-posting-url-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>

            <FormField
              htmlFor="career-source"
              label="Source"
              description="Optional, such as LinkedIn, JobStreet, referral, or the company careers page."
              descriptionId="career-source-description"
            >
              <Input
                {...register("sourceName")}
                id="career-source"
                autoComplete="off"
                disabled={fieldsDisabled}
                aria-describedby="career-source-description"
              />
            </FormField>

            <FormField htmlFor="career-location" label="Location">
              <Input
                {...register("location")}
                id="career-location"
                autoComplete="off"
                disabled={fieldsDisabled}
              />
            </FormField>

            <FormField
              htmlFor="career-work-arrangement"
              label="Work arrangement"
            >
              <select
                {...register("workArrangement")}
                id="career-work-arrangement"
                disabled={fieldsDisabled}
                className={selectClassName}
              >
                <option value="">Not specified</option>

                {CAREER_WORK_ARRANGEMENTS.map((arrangement) => (
                  <option key={arrangement} value={arrangement}>
                    {workArrangementLabels[arrangement]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            htmlFor="career-role-description"
            label="Role description snapshot"
            description="Optional. Save key requirements or the description you actually applied against rather than relying only on an external URL."
            descriptionId="career-role-description-description"
            error={errors.roleDescriptionSnapshot?.message}
            errorId="career-role-description-error"
          >
            <Textarea
              {...register("roleDescriptionSnapshot")}
              id="career-role-description"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.roleDescriptionSnapshot)}
              aria-describedby={[
                "career-role-description-description",
                errors.roleDescriptionSnapshot
                  ? "career-role-description-error"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>

          <FormField
            htmlFor="career-technologies"
            label="Technologies"
            description="Optional comma-separated tags, for example TypeScript, React, PostgreSQL."
            descriptionId="career-technologies-description"
            error={errors.technologyTags?.message}
            errorId="career-technologies-error"
          >
            <Input
              {...register("technologyTags")}
              id="career-technologies"
              autoComplete="off"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.technologyTags)}
              aria-describedby={[
                "career-technologies-description",
                errors.technologyTags ? "career-technologies-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </fieldset>

        <fieldset
          disabled={fieldsDisabled}
          className="space-y-5 border-t border-border pt-6"
        >
          <legend className="text-sm font-semibold text-foreground">
            Current application state
          </legend>

          <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
            Saved opportunities are not submitted applications. For an
            application already further along, record its real applied date
            separately from the effective date of its current stage.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField
              htmlFor="career-stage"
              label="Current stage"
              error={errors.initialStage?.message}
              errorId="career-stage-error"
            >
              <select
                {...register("initialStage")}
                id="career-stage"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.initialStage)}
                aria-describedby={
                  errors.initialStage ? "career-stage-error" : undefined
                }
                className={selectClassName}
              >
                {CAREER_APPLICATION_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabels[stage]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              htmlFor="career-outcome"
              label="Outcome"
              description="Leave blank while the attempt is still active. Terminal outcomes remain separate from the last meaningful stage."
              descriptionId="career-outcome-description"
              error={errors.initialOutcome?.message}
              errorId="career-outcome-error"
            >
              <select
                {...register("initialOutcome")}
                id="career-outcome"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.initialOutcome)}
                aria-describedby={[
                  "career-outcome-description",
                  errors.initialOutcome ? "career-outcome-error" : null,
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

            {initialStage !== "saved" ? (
              <FormField
                htmlFor="career-applied-date"
                label="Applied date"
                description="Use the actual date the application was submitted."
                descriptionId="career-applied-date-description"
                error={errors.appliedDate?.message}
                errorId="career-applied-date-error"
              >
                <Input
                  {...register("appliedDate")}
                  id="career-applied-date"
                  type="date"
                  disabled={fieldsDisabled}
                  aria-invalid={Boolean(errors.appliedDate)}
                  aria-describedby={[
                    "career-applied-date-description",
                    errors.appliedDate ? "career-applied-date-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </FormField>
            ) : null}

            <FormField
              htmlFor="career-stage-date"
              label={
                initialStage === "saved"
                  ? "Saved date"
                  : "Current stage effective date"
              }
              description={
                initialStage === "applied"
                  ? "For the Applied stage, this matches the applied date."
                  : "Use the date this stage actually became effective."
              }
              descriptionId="career-stage-date-description"
              error={errors.stageEffectiveDate?.message}
              errorId="career-stage-date-error"
            >
              <Input
                {...register("stageEffectiveDate")}
                id="career-stage-date"
                type="date"
                disabled={fieldsDisabled}
                aria-invalid={Boolean(errors.stageEffectiveDate)}
                aria-describedby={[
                  "career-stage-date-description",
                  errors.stageEffectiveDate ? "career-stage-date-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </FormField>
          </div>

          <FormField
            htmlFor="career-stage-reason"
            label="Stage note or reason"
            description="Optional context for the initial stage or outcome, especially when recording an existing application already in progress."
            descriptionId="career-stage-reason-description"
            error={errors.stageReason?.message}
            errorId="career-stage-reason-error"
          >
            <Textarea
              {...register("stageReason")}
              id="career-stage-reason"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.stageReason)}
              aria-describedby={[
                "career-stage-reason-description",
                errors.stageReason ? "career-stage-reason-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </fieldset>

        <fieldset
          disabled={fieldsDisabled}
          className="space-y-5 border-t border-border pt-6"
        >
          <legend className="text-sm font-semibold text-foreground">
            Notes
          </legend>

          <FormField
            htmlFor="career-notes"
            label="Application notes"
            description={`Optional private notes. Your workspace currency is ${workspaceCurrency}; salary details are not required for this first application workflow.`}
            descriptionId="career-notes-description"
            error={errors.notes?.message}
            errorId="career-notes-error"
          >
            <Textarea
              {...register("notes")}
              id="career-notes"
              disabled={fieldsDisabled}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={[
                "career-notes-description",
                errors.notes ? "career-notes-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </FormField>
        </fieldset>

        {saveState === "duplicate" ? (
          <div
            role="alert"
            className="rounded-control border border-warning bg-warning-surface px-4 py-4 text-sm leading-6 text-warning"
          >
            <div className="flex gap-2">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
                strokeWidth={1.9}
              />

              <div>
                <p className="font-medium">Possible duplicate application</p>

                <p className="mt-1">
                  Another attempt with this company and role already exists.
                  Continue only if this is genuinely a separate application
                  attempt.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      void confirmSeparateAttempt();
                    }}
                  >
                    Create separate attempt
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDuplicatePayload(null);
                      setSaveState("idle");
                    }}
                  >
                    Edit details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
            Application saved. Returning to your application list…
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {saveState === "unconfirmed" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void retryUnconfirmedSave();
              }}
            >
              Retry same save
            </Button>
          ) : null}

          <Button
            type="submit"
            loading={saveState === "saving"}
            loadingLabel="Saving application…"
            disabled={
              saveState === "duplicate" ||
              saveState === "unconfirmed" ||
              saveState === "saved"
            }
          >
            Save application
          </Button>
        </div>
      </form>
    </section>
  );
}
