"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Layers3,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { OnboardingStepState } from "@/modules/core/domain/onboarding";
import type { ModulePreferenceItem } from "@/modules/core/services/list-module-preferences";
import { cn } from "@/lib/cn";

type StartingGoal = "money" | "career" | "both";

const goalOptions: readonly {
  value: StartingGoal;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: "money",
    title: "Track money",
    description:
      "Start with accounts and financial activity. Career can be enabled later.",
    icon: CircleDollarSign,
  },
  {
    value: "career",
    title: "Organize job applications",
    description:
      "Start with applications and follow-ups without requiring financial setup.",
    icon: BriefcaseBusiness,
  },
  {
    value: "both",
    title: "Use both",
    description: "Keep both Money and Career available from the beginning.",
    icon: Layers3,
  },
];

function getModule(
  modules: readonly ModulePreferenceItem[],
  moduleKey: ModulePreferenceItem["moduleKey"],
): ModulePreferenceItem {
  const modulePreference = modules.find(
    (module) => module.moduleKey === moduleKey,
  );

  if (!modulePreference) {
    throw new Error(`Missing ${moduleKey} module preference.`);
  }

  return modulePreference;
}

function resolveStartingGoal(
  modules: readonly ModulePreferenceItem[],
): StartingGoal {
  const moneyEnabled = getModule(modules, "money").enabled;
  const careerEnabled = getModule(modules, "career").enabled;

  if (moneyEnabled && !careerEnabled) {
    return "money";
  }

  if (!moneyEnabled && careerEnabled) {
    return "career";
  }

  return "both";
}

function getTargetEnabled(
  goal: StartingGoal,
  moduleKey: "money" | "career",
): boolean {
  if (goal === "both") {
    return true;
  }

  return goal === moduleKey;
}

async function updateModulePreference(
  preference: ModulePreferenceItem,
  enabled: boolean,
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

        enabled,
        agendaVisible: preference.agendaVisible,
        remindersEnabled: preference.remindersEnabled,
      }),

      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Module preference mutation failed.");
  }
}

async function completeStartingGoalStep(): Promise<void> {
  const response = await fetch("/api/v1/onboarding/steps/choose-goal", {
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

export interface StartingGoalFormProps {
  modules: readonly ModulePreferenceItem[];
  stepState: OnboardingStepState;
}

export function StartingGoalForm({
  modules,
  stepState,
}: StartingGoalFormProps) {
  const router = useRouter();

  const currentGoal = resolveStartingGoal(modules);

  const [selectedGoal, setSelectedGoal] = useState<StartingGoal>(currentGoal);

  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const moneyPreference = getModule(modules, "money");
    const careerPreference = getModule(modules, "career");

    const changes = [
      {
        preference: moneyPreference,
        enabled: getTargetEnabled(selectedGoal, "money"),
      },
      {
        preference: careerPreference,
        enabled: getTargetEnabled(selectedGoal, "career"),
      },
    ]
      .filter(({ preference, enabled }) => preference.enabled !== enabled)
      /*
       * Enable a destination before disabling another module. If a later
       * request fails, this avoids leaving both primary starting modules off.
       */
      .sort((left, right) => Number(right.enabled) - Number(left.enabled));

    try {
      for (const change of changes) {
        await updateModulePreference(change.preference, change.enabled);
      }
    } catch {
      setSaveError(
        "Your starting goal couldn't be saved completely. The latest workspace settings will be reloaded before you try again.",
      );

      router.refresh();
      setSaving(false);
      return;
    }

    /*
     * Completing onboarding is intentionally separate from changing the real
     * module state. Never mark the guidance step complete before the underlying
     * configuration commands have succeeded.
     */
    if (stepState !== "completed") {
      try {
        await completeStartingGoalStep();
      } catch {
        setSaveError(
          "Your module choices were saved, but the Getting Started progress couldn't be updated. Reload and try this step again.",
        );

        router.refresh();
        setSaving(false);
        return;
      }
    }

    setSaved(true);
    setSaving(false);

    /*
     * Re-read authoritative module versions and onboarding applicability.
     *
     * This is especially important when Money or Career has just been
     * disabled, because module-specific onboarding steps must immediately
     * leave the applicable path.
     */
    router.refresh();
  }

  return (
    <section
      aria-labelledby="starting-goal-title"
      className="rounded-card border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-link">First setup step</p>

          <h2
            id="starting-goal-title"
            className="mt-1 text-lg font-semibold text-foreground"
          >
            Choose a starting goal
          </h2>

          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
            Start with the parts of the workspace you need now. Turning a module
            off only removes it from your active setup path; it does not delete
            its records.
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

      <fieldset className="mt-6">
        <legend className="sr-only">Starting goal</legend>

        <div className="grid gap-3 md:grid-cols-3">
          {goalOptions.map((option) => {
            const selected = selectedGoal === option.value;
            const Icon = option.icon;

            return (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-11 cursor-pointer gap-3 rounded-control border p-4",
                  "transition-colors duration-(--motion-duration-fast) ease-state",
                  "motion-reduce:transition-none",
                  selected
                    ? "border-primary-border bg-accent"
                    : "border-border bg-surface hover:border-ring",
                  saving && "cursor-wait opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="starting-goal"
                  value={option.value}
                  checked={selected}
                  disabled={saving}
                  onChange={() => {
                    setSelectedGoal(option.value);
                    setSaved(false);
                  }}
                  className="mt-1 size-4 shrink-0"
                />

                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.9}
                    />

                    {option.title}
                  </span>

                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Calendar and Agenda remain available because they support deadlines and
        next actions from either starting goal.
      </p>

      {saveError ? (
        <p
          role="alert"
          className="mt-4 rounded-control border border-danger bg-danger-surface px-3 py-3 text-sm leading-5 text-danger"
        >
          {saveError}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="mt-4 text-sm font-medium text-success">
          Your starting goal has been saved.
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          loading={saving}
          loadingLabel="Saving goal…"
          onClick={() => {
            void handleSave();
          }}
        >
          {stepState === "completed" ? "Save goal" : "Save and continue"}
        </Button>
      </div>
    </section>
  );
}
