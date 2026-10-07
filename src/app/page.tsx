import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  RotateCcw,
} from "lucide-react";

import { resolveOnboardingProgress } from "@/app/_lib/onboarding-progress";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { GettingStartedPanel } from "@/components/onboarding/getting-started-panel";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";

export default async function Home() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Private workspace"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. Your application data has not been shown or changed by this screen."
      >
        <div className="space-y-5">
          <div className="rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning">
            This can happen when authentication or workspace services are
            temporarily unavailable. Retry before entering any new information.
          </div>

          <Link
            href="/"
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
            <RotateCcw
              aria-hidden="true"
              className="size-5"
              strokeWidth={1.9}
            />
            Retry workspace setup
          </Link>
        </div>
      </AuthCard>
    );
  }

  const { user, workspace, preference, modules } = bootstrap;

  const onboarding = await resolveOnboardingProgress({
    userId: user.id,
    workspaceId: workspace.id,
  });

  const moneyEnabled =
    modules.find((module) => module.moduleKey === "money")?.enabled === true;

  const careerEnabled =
    modules.find((module) => module.moduleKey === "career")?.enabled === true;

  const timeEnabled =
    modules.find((module) => module.moduleKey === "time")?.enabled === true;

  const showGettingStarted =
    onboarding !== null &&
    !onboarding.complete &&
    preference.gettingStartedDismissedAt === null;

  return (
    <AppShell
      pageTitle="Dashboard"
      activePath="/"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <p className="text-sm font-medium text-link">Private workspace</p>

          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Your dashboard will bring together the records and commitments that
            need your attention while keeping each module&apos;s underlying data
            authoritative.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            Workspace:{" "}
            <span className="font-medium text-foreground">
              {workspace.currency}
            </span>
            {" · "}
            <span className="font-medium text-foreground">
              {workspace.timezone}
            </span>
          </p>
        </header>

        {showGettingStarted ? (
          <GettingStartedPanel progress={onboarding} />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel
            title="Money"
            description="Accounts, financial activity, transfers, fees, and account history remain grounded in the financial ledger."
          >
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <CircleDollarSign
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.8}
                />
              </div>

              <div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {moneyEnabled
                    ? "Record real financial activity and review the exact ledger-derived balances and history behind each account."
                    : "Money is currently disabled for this workspace. Existing financial records remain preserved."}
                </p>

                {moneyEnabled ? (
                  <Link
                    href="/money/accounts"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                  >
                    Open Money
                  </Link>
                ) : (
                  <Link
                    href="/onboarding"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                  >
                    Enable Money
                  </Link>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title="Career"
            description="Applications, stages, and upcoming application activity stay connected to their history."
          >
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <BriefcaseBusiness
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.8}
                />
              </div>

              <div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {careerEnabled
                    ? "Track saved opportunities and submitted applications as separate attempts with explicit stages and dates."
                    : "Career is currently disabled for this workspace. Existing application records remain preserved."}
                </p>

                {careerEnabled ? (
                  <Link
                    href="/career/applications"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                  >
                    Open job applications
                  </Link>
                ) : (
                  <Link
                    href="/onboarding"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                  >
                    Enable Career
                  </Link>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title="Calendar"
            description="Upcoming items are projected directly from their authoritative source records."
            className="md:col-span-2 xl:col-span-1"
          >
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <CalendarDays
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.8}
                />
              </div>

              <div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {timeEnabled
                    ? "Review Career activities and personal events together without creating duplicate editable Calendar records."
                    : "Calendar can still show agenda-visible source records while manual personal-event creation is disabled."}
                </p>

                <Link
                  href="/calendar"
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Open Calendar
                </Link>
              </div>
            </div>
          </Panel>
        </div>

        {!showGettingStarted ? (
          <Panel
            title="Start with what you need"
            description="The workspace is designed for progressive setup rather than requiring every module at once."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              You can use Career without configuring Money, or begin tracking
              finances without completing unrelated setup. Your Getting Started
              guide remains available whenever you want to review the workflow.
            </p>

            <Link
              href="/onboarding"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Review Getting Started guide
            </Link>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
