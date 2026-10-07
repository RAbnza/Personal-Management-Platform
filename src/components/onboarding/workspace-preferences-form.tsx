"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { OnboardingStepState } from "@/modules/core/domain/onboarding";
import type { ModulePreferenceItem } from "@/modules/core/services/list-module-preferences";

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date(0));

    return true;
  } catch {
    return false;
  }
}

const workspacePreferencesSchema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, {
      message: "Use a three-letter uppercase currency code.",
    }),

  timezone: z
    .string()
    .trim()
    .min(1, "Enter your timezone.")
    .max(100, "Timezone is too long.")
    .refine(isIanaTimezone, {
      message: "Enter a valid IANA timezone such as Asia/Manila.",
    }),

  weekStart: z.number().int().min(0).max(6),

  reminders: z.object({
    money: z.boolean(),
    career: z.boolean(),
    time: z.boolean(),
  }),
});

type WorkspacePreferencesValues = z.infer<typeof workspacePreferencesSchema>;

const weekStartOptions = [
  {
    value: 0,
    label: "Sunday",
  },
  {
    value: 1,
    label: "Monday",
  },
  {
    value: 2,
    label: "Tuesday",
  },
  {
    value: 3,
    label: "Wednesday",
  },
  {
    value: 4,
    label: "Thursday",
  },
  {
    value: 5,
    label: "Friday",
  },
  {
    value: 6,
    label: "Saturday",
  },
] as const;

const moduleLabels: Record<
  ModulePreferenceItem["moduleKey"],
  {
    title: string;
    description: string;
  }
> = {
  money: {
    title: "Money reminders",
    description:
      "Use reminder defaults for financial deadlines and obligations when those workflows support them.",
  },

  career: {
    title: "Career reminders",
    description:
      "Use reminder defaults for interviews, assessments, follow-ups, and other Career dates.",
  },

  time: {
    title: "Calendar reminders",
    description:
      "Use reminder defaults for agenda and personal time-based items.",
  },
};

function getReminderValues(
  modules: readonly ModulePreferenceItem[],
): WorkspacePreferencesValues["reminders"] {
  return {
    money:
      modules.find((module) => module.moduleKey === "money")
        ?.remindersEnabled ?? true,

    career:
      modules.find((module) => module.moduleKey === "career")
        ?.remindersEnabled ?? true,

    time:
      modules.find((module) => module.moduleKey === "time")?.remindersEnabled ??
      true,
  };
}

async function updateWorkspaceSettings(input: {
  expectedVersion: number;
  currency: string;
  timezone: string;
  weekStart: number;
}): Promise<void> {
  const response = await fetch("/api/v1/settings/workspace", {
    method: "PATCH",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      clientCommandId: crypto.randomUUID(),

      expectedVersion: input.expectedVersion,

      currency: input.currency,
      timezone: input.timezone,
      weekStart: input.weekStart,
    }),

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Workspace settings mutation failed.");
  }
}

async function updateModuleReminderPreference(
  preference: ModulePreferenceItem,
  remindersEnabled: boolean,
): Promise<void> {
  const response = await fetch(
    `/api/v1/module-preferences/${preference.moduleKey}`,
    {
      method: "PATCH",

      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        clientCommandId: crypto.randomUUID(),

        expectedVersion: preference.version,

        enabled: preference.enabled,
        agendaVisible: preference.agendaVisible,
        remindersEnabled,
      }),

      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Module reminder preference mutation failed.");
  }
}

async function completePreferencesStep(): Promise<void> {
  const response = await fetch("/api/v1/onboarding/steps/confirm-preferences", {
    method: "PATCH",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      clientCommandId: crypto.randomUUID(),
      state: "completed",
    }),

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Onboarding progress mutation failed.");
  }
}

export interface WorkspacePreferencesSnapshot {
  currency: string;
  timezone: string;
  weekStart: number;
  version: number;
  currencyChangeAllowed: boolean;
}

export interface WorkspacePreferencesFormProps {
  workspace: WorkspacePreferencesSnapshot;
  modules: readonly ModulePreferenceItem[];
  stepState: OnboardingStepState;
}

export function WorkspacePreferencesForm({
  workspace,
  modules,
  stepState,
}: WorkspacePreferencesFormProps) {
  const router = useRouter();

  const [saveError, setSaveError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkspacePreferencesValues>({
    resolver: zodResolver(workspacePreferencesSchema),

    defaultValues: {
      currency: workspace.currency,
      timezone: workspace.timezone,
      weekStart: workspace.weekStart,
      reminders: getReminderValues(modules),
    },
  });

  async function onSubmit(values: WorkspacePreferencesValues) {
    setSaveError(null);
    setSaved(false);

    const workspaceChanged =
      values.currency !== workspace.currency ||
      values.timezone !== workspace.timezone ||
      values.weekStart !== workspace.weekStart;

    const reminderChanges = modules
      .filter((module) => module.enabled)
      .map((module) => ({
        module,
        remindersEnabled: values.reminders[module.moduleKey],
      }))
      .filter(
        ({ module, remindersEnabled }) =>
          module.remindersEnabled !== remindersEnabled,
      );

    try {
      if (workspaceChanged) {
        await updateWorkspaceSettings({
          expectedVersion: workspace.version,

          currency: values.currency,
          timezone: values.timezone,
          weekStart: values.weekStart,
        });
      }

      for (const change of reminderChanges) {
        await updateModuleReminderPreference(
          change.module,
          change.remindersEnabled,
        );
      }
    } catch {
      setSaveError(
        "Some preferences could not be saved. Any confirmed changes will be reloaded from your workspace before you try again.",
      );

      router.refresh();
      return;
    }

    if (stepState !== "completed") {
      try {
        await completePreferencesStep();
      } catch {
        setSaveError(
          "Your preferences were saved, but the Getting Started progress could not be updated. Reload and try this step again.",
        );

        router.refresh();
        return;
      }
    }

    setSaved(true);

    /*
     * Refresh the authoritative versions and onboarding progress after all
     * confirmed mutations. This also prevents subsequent commands from using
     * stale optimistic-concurrency versions.
     */
    router.refresh();
  }

  const currencyErrorId = errors.currency
    ? "workspace-currency-error"
    : undefined;

  const timezoneErrorId = errors.timezone
    ? "workspace-timezone-error"
    : undefined;

  const weekStartErrorId = errors.weekStart
    ? "workspace-week-start-error"
    : undefined;

  return (
    <section
      aria-labelledby="workspace-preferences-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-link">Second setup step</p>

          <h2
            id="workspace-preferences-title"
            className="mt-1 text-lg font-semibold text-foreground"
          >
            Confirm workspace preferences
          </h2>

          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
            Confirm the settings that control dates, reports, money formatting,
            and reminder defaults in your private workspace.
          </p>
        </div>

        {stepState === "completed" ? (
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Completed
          </div>
        ) : null}
      </div>

      <form
        noValidate
        className="mt-6 space-y-6"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            htmlFor="workspace-currency"
            label="Currency"
            description={
              workspace.currencyChangeAllowed
                ? "Use the three-letter currency code for this workspace. V1 keeps one currency per workspace."
                : "Currency is locked because financial account structure already exists."
            }
            descriptionId="workspace-currency-description"
            error={errors.currency?.message}
            errorId="workspace-currency-error"
          >
            <Input
              {...register("currency")}
              id="workspace-currency"
              type="text"
              inputMode="text"
              maxLength={3}
              readOnly={!workspace.currencyChangeAllowed}
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={Boolean(errors.currency)}
              aria-describedby={[
                "workspace-currency-description",
                currencyErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
              className={
                workspace.currencyChangeAllowed
                  ? "uppercase"
                  : "bg-surface-subtle uppercase"
              }
            />
          </FormField>

          <FormField
            htmlFor="workspace-timezone"
            label="Timezone"
            description="Use an IANA timezone such as Asia/Manila."
            descriptionId="workspace-timezone-description"
            error={errors.timezone?.message}
            errorId="workspace-timezone-error"
          >
            <>
              <Input
                {...register("timezone")}
                id="workspace-timezone"
                type="text"
                list="workspace-timezone-options"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.timezone)}
                aria-describedby={[
                  "workspace-timezone-description",
                  timezoneErrorId,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />

              <datalist id="workspace-timezone-options">
                <option value="Asia/Manila" />
                <option value="Asia/Singapore" />
                <option value="Asia/Tokyo" />
                <option value="UTC" />
                <option value="Europe/London" />
                <option value="America/New_York" />
              </datalist>
            </>
          </FormField>

          <FormField
            htmlFor="workspace-week-start"
            label="Week starts on"
            description="Weekly reports and calendar grouping use this preference."
            descriptionId="workspace-week-start-description"
            error={errors.weekStart?.message}
            errorId="workspace-week-start-error"
          >
            <select
              {...register("weekStart", {
                valueAsNumber: true,
              })}
              id="workspace-week-start"
              aria-invalid={Boolean(errors.weekStart)}
              aria-describedby={[
                "workspace-week-start-description",
                weekStartErrorId,
              ]
                .filter(Boolean)
                .join(" ")}
              className={[
                "min-h-11 w-full rounded-control border border-input",
                "bg-surface px-3 py-2 text-base text-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:border-ring",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              {weekStartOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <fieldset className="border-t border-border pt-6">
          <legend className="text-sm font-semibold text-foreground">
            Reminder defaults
          </legend>

          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground">
            These preferences control whether currently enabled modules may
            surface reminder-driven guidance. External email or push delivery is
            not enabled by this setting.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modules
              .filter((module) => module.enabled)
              .map((module) => {
                const content = moduleLabels[module.moduleKey];

                return (
                  <label
                    key={module.moduleKey}
                    className="flex cursor-pointer gap-3 rounded-control border border-border bg-surface p-4 hover:border-ring"
                  >
                    <input
                      {...register(`reminders.${module.moduleKey}`)}
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                    />

                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {content.title}
                      </span>

                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {content.description}
                      </span>
                    </span>
                  </label>
                );
              })}
          </div>
        </fieldset>

        {saveError ? (
          <p
            role="alert"
            className="rounded-control border border-danger bg-danger-surface px-3 py-3 text-sm leading-5 text-danger"
          >
            {saveError}
          </p>
        ) : null}

        {saved ? (
          <p role="status" className="text-sm font-medium text-success">
            Your workspace preferences have been saved.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={isSubmitting}
            loadingLabel="Saving preferences…"
          >
            {stepState === "completed"
              ? "Save preferences"
              : "Save and continue"}
          </Button>
        </div>
      </form>
    </section>
  );
}
