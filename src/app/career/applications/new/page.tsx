import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { JobApplicationCreateForm } from "@/components/career/job-application-create-form";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";

export default async function NewJobApplicationPage() {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());

  if (bootstrap.kind === "unauthorized") {
    redirect("/auth/sign-in");
  }

  if (bootstrap.kind === "unavailable") {
    return (
      <AuthCard
        eyebrow="Career"
        title="We couldn't prepare your workspace"
        description="Your private workspace couldn't be loaded safely. No application information has been changed."
      >
        <Link
          href="/career/applications/new"
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

  const careerEnabled =
    modules.find((module) => module.moduleKey === "career")?.enabled === true;

  if (!careerEnabled) {
    return (
      <AppShell
        pageTitle="Add application"
        activePath="/career/applications"
        userName={user.name}
        userEmail={user.email}
        workspaceTheme={preference.theme}
        workspacePreferenceVersion={preference.version}
        gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
      >
        <div className="space-y-8">
          <header>
            <Link
              href="/career/applications"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              <ArrowLeft
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Back to applications
            </Link>

            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              Add application
            </h1>
          </header>

          <Panel
            title="Career is currently disabled"
            description="Existing application records remain preserved when the module is hidden."
          >
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              Enable Career from Getting Started
            </Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Add application"
      activePath="/career/applications"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header>
          <Link
            href="/career/applications"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.9}
            />
            Back to applications
          </Link>

          <p className="mt-3 text-sm font-medium text-link">Career</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Add application
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Create one application attempt or saved opportunity using the dates
            and stage that reflect what actually happened.
          </p>
        </header>

        <JobApplicationCreateForm workspaceCurrency={workspace.currency} />
      </div>
    </AppShell>
  );
}
