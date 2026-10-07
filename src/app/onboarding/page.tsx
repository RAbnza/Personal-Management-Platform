import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolveOnboardingProgress } from "@/app/_lib/onboarding-progress";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { GettingStartedPanel } from "@/components/onboarding/getting-started-panel";
import { StartingGoalForm } from "@/components/onboarding/starting-goal-form";
import { WorkspacePreferencesForm } from "@/components/onboarding/workspace-preferences-form";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";

export default async function OnboardingPage() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Getting started"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No setup changes were made."
      >
        <Link
          href="/onboarding"
          className={[
            "inline-flex min-h-11 w-full items-center justify-center gap-2",
            "rounded-button border border-primary-border",
            "bg-primary px-4 py-2.5",
            "text-sm font-semibold text-primary-foreground",
            "transition-colors duration-(--motion-duration-fast) ease-state",
            "hover:bg-primary-hover active:bg-primary-pressed",
            "motion-reduce:transition-none",
          ].join(" ")}
        >
          <RotateCcw aria-hidden="true" className="size-5" strokeWidth={1.9} />
          Retry
        </Link>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const progress = await resolveOnboardingProgress({
    userId: user.id,
    workspaceId: workspace.id,
  });

  const chooseGoalStep = progress?.steps.find(
    (step) => step.stepKey === "choose-goal",
  );

  const confirmPreferencesStep = progress?.steps.find(
    (step) => step.stepKey === "confirm-preferences",
  );

  const addFirstAccountStep = progress?.steps.find(
    (step) => step.stepKey === "add-first-account",
  );

  const recordFirstTransactionStep = progress?.steps.find(
    (step) => step.stepKey === "record-first-transaction",
  );

  const addJobApplicationStep = progress?.steps.find(
    (step) => step.stepKey === "add-job-application",
  );

  return (
    <AppShell
      pageTitle="Getting started"
      activePath="/onboarding"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to dashboard
          </Link>

          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Getting started
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Start with the parts of the workspace that are useful to you. Setup
            is resumable, and completing the guide is not required before you
            can use available product features.
          </p>
        </header>

        {progress ? (
          <>
            <GettingStartedPanel progress={progress} showGuideLink={false} />

            {chooseGoalStep ? (
              <StartingGoalForm
                key={[
                  ...modules.map(
                    (module) =>
                      `${module.moduleKey}:${module.version}:${module.enabled}`,
                  ),
                  chooseGoalStep.state,
                ].join("|")}
                modules={modules}
                stepState={chooseGoalStep.state}
              />
            ) : null}

            {confirmPreferencesStep ? (
              <WorkspacePreferencesForm
                key={[
                  workspace.version,
                  workspace.currency,
                  workspace.timezone,
                  workspace.weekStart,
                  workspace.currencyChangeAllowed,
                  ...modules.map(
                    (module) =>
                      `${module.moduleKey}:${module.version}:${module.remindersEnabled}:${module.enabled}`,
                  ),
                  confirmPreferencesStep.state,
                ].join("|")}
                workspace={{
                  currency: workspace.currency,
                  timezone: workspace.timezone,
                  weekStart: workspace.weekStart,
                  version: workspace.version,
                  currencyChangeAllowed: workspace.currencyChangeAllowed,
                }}
                modules={modules}
                stepState={confirmPreferencesStep.state}
              />
            ) : null}

            {addFirstAccountStep?.applicable &&
            addFirstAccountStep.state !== "completed" ? (
              <Panel
                title="Next: add your first account"
                description="Money setup now has a real account workflow. Add the place where your current funds are held and establish its opening balance."
              >
                <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  The opening balance is a baseline, not income. You will choose
                  the date that the balance represents before anything is
                  written to the financial ledger.
                </p>

                <Link
                  href="/money/accounts"
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Add your first account
                </Link>
              </Panel>
            ) : null}

            {recordFirstTransactionStep?.applicable &&
            addFirstAccountStep?.state === "completed" &&
            recordFirstTransactionStep.state !== "completed" ? (
              <Panel
                title="Next: record a real transaction"
                description="Record actual income or spending and then inspect the updated account balance."
              >
                <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Planned income or bills do not change balances. Use this step
                  only for a transaction that really happened.
                </p>

                <Link
                  href="/money/transactions"
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Record transaction
                </Link>
              </Panel>
            ) : null}

            {addJobApplicationStep?.applicable &&
            addJobApplicationStep.state !== "completed" ? (
              <Panel
                title="Next: add a job application"
                description="Start the Career workflow with a real saved opportunity or application attempt."
              >
                <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
                  Record the company, role, real application stage, and dates
                  now. This guide step also expects a real next action such as
                  an interview, assessment, or follow-up, so it will remain open
                  until that Career event is scheduled.
                </p>

                <Link
                  href="/career/applications/new"
                  className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Add job application
                </Link>
              </Panel>
            ) : null}
          </>
        ) : (
          <section
            aria-labelledby="onboarding-unavailable-title"
            className="rounded-card border border-warning bg-warning-surface p-5"
          >
            <h2
              id="onboarding-unavailable-title"
              className="text-lg font-semibold text-foreground"
            >
              Guide temporarily unavailable
            </h2>

            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Your private workspace is still available, but its setup checklist
              could not be loaded. Refresh the page to try again.
            </p>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Reload guide
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
