import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  CircleMinus,
  type LucideIcon,
} from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { OnboardingStepControls } from "./onboarding-step-controls";
import { cn } from "@/lib/cn";
import type {
  OnboardingStepKey,
  OnboardingStepState,
} from "@/modules/core/domain/onboarding";
import type { ListOnboardingProgressResult } from "@/modules/core/services/list-onboarding-progress";

const stepContent: Record<
  OnboardingStepKey,
  {
    title: string;
    description: string;
  }
> = {
  "choose-goal": {
    title: "Choose a starting goal",
    description:
      "Decide whether you want to begin with Money, Career, or both. Other modules can be enabled later.",
  },

  "confirm-preferences": {
    title: "Confirm workspace preferences",
    description:
      "Review your currency, timezone, week start, and reminder preferences before building your records.",
  },

  "add-first-account": {
    title: "Add your first financial account",
    description:
      "Enter the current balance and the date that balance represents. The opening balance establishes your starting point and is not income.",
  },

  "record-first-transaction": {
    title: "Record a real transaction",
    description:
      "Add an actual income or expense and inspect how the transaction changes the relevant account balance.",
  },

  "add-job-application": {
    title: "Add a job application",
    description:
      "Record the company, role, stage, and next action so the application can participate in your Career workflow.",
  },

  "review-agenda": {
    title: "Review your agenda",
    description:
      "See how dates from authoritative source records become upcoming items without creating duplicate editable records.",
  },
};

const stateContent: Record<
  OnboardingStepState,
  {
    label: string;
    icon: LucideIcon;
    className: string;
  }
> = {
  pending: {
    label: "To do",
    icon: Circle,
    className: "text-muted-foreground",
  },

  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-success",
  },

  skipped: {
    label: "Skipped",
    icon: CircleMinus,
    className: "text-muted-foreground",
  },
};

export interface GettingStartedPanelProps {
  progress: ListOnboardingProgressResult;
  showGuideLink?: boolean;
}

export function GettingStartedPanel({
  progress,
  showGuideLink = true,
}: GettingStartedPanelProps) {
  const applicableSteps = progress.steps.filter((step) => step.applicable);

  const completionPercentage =
    progress.applicableStepCount === 0
      ? 0
      : Math.round(
          (progress.resolvedApplicableStepCount /
            progress.applicableStepCount) *
            100,
        );

  return (
    <Panel
      title={progress.complete ? "Getting started complete" : "Getting started"}
      description={
        progress.complete
          ? "You have resolved every currently applicable setup step. You can return to this guide whenever you want to review the workflow."
          : "Set up only what is useful to you now. Your progress is saved, and module-specific steps disappear from the active path when that module is disabled."
      }
      action={
        showGuideLink ? (
          <Link
            href="/onboarding"
            className={[
              "inline-flex min-h-11 items-center justify-center",
              "rounded-button border border-input bg-secondary px-4 py-2.5",
              "text-sm font-semibold text-secondary-foreground",
              "transition-colors duration-(--motion-duration-fast) ease-state",
              "hover:bg-accent hover:text-accent-foreground",
              "motion-reduce:transition-none",
            ].join(" ")}
          >
            {progress.complete ? "Review guide" : "Continue setup"}
          </Link>
        ) : null
      }
    >
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {progress.resolvedApplicableStepCount} of{" "}
              {progress.applicableStepCount} applicable steps resolved
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Guide version {progress.guideVersion}
            </p>
          </div>

          <p className="numeric-value text-sm font-semibold text-foreground">
            {completionPercentage}%
          </p>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{
              width: `${completionPercentage}%`,
            }}
          />
        </div>

        <ol className="mt-6 divide-y divide-border">
          {applicableSteps.map((step, index) => {
            const content = stepContent[step.stepKey];
            const state = stateContent[step.state];
            const StateIcon = state.icon;

            return (
              <li
                key={step.stepKey}
                className="flex gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface",
                    state.className,
                  )}
                >
                  <StateIcon
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={1.9}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Step {index + 1}
                      </p>

                      <h3 className="mt-1 text-sm font-semibold text-foreground">
                        {content.title}
                      </h3>
                    </div>

                    <span
                      className={cn("text-xs font-medium", state.className)}
                    >
                      {state.label}
                    </span>
                  </div>

                  <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
                    {content.description}
                  </p>
                  {!showGuideLink && (
                    <OnboardingStepControls
                      key={`${step.stepKey}:${step.state}`}
                      stepKey={step.stepKey}
                      state={step.state}
                      title={content.title}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
