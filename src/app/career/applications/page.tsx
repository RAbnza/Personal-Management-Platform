import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { JobApplicationList } from "@/components/career/job-application-list";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  CAREER_APPLICATION_STAGES,
  type CareerApplicationStage,
} from "@/modules/career/domain/application";
import {
  InvalidJobApplicationListCursorError,
  JobApplicationListWorkspaceUnavailableError,
  listJobApplications,
  type ListJobApplicationsResult,
} from "@/modules/career/services/list-job-applications";

type CareerApplicationsPageProps = {
  searchParams: Promise<{
    search?: string | string[] | undefined;
    stage?: string | string[] | undefined;
    cursor?: string | string[] | undefined;
  }>;
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

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isCareerApplicationStage(
  value: string | undefined,
): value is CareerApplicationStage {
  return (
    value !== undefined &&
    (CAREER_APPLICATION_STAGES as readonly string[]).includes(value)
  );
}

export default async function CareerApplicationsPage({
  searchParams,
}: CareerApplicationsPageProps) {
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
          href="/career/applications"
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
        pageTitle="Job applications"
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
              Career
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

  const resolvedSearchParams = await searchParams;

  const rawSearch = firstQueryValue(resolvedSearchParams.search);

  const search = (rawSearch ?? "").trim().slice(0, 200);

  const rawStage = firstQueryValue(resolvedSearchParams.stage);

  const stage = isCareerApplicationStage(rawStage) ? rawStage : null;

  const cursor = firstQueryValue(resolvedSearchParams.cursor);

  let applications: ListJobApplicationsResult | null = null;

  let invalidCursor = false;

  try {
    applications = await listJobApplications({
      userId: user.id,
      workspaceId: workspace.id,

      archive: "active",

      pageSize: 25,

      ...(search ? { search } : {}),

      ...(stage ? { stage } : {}),

      ...(cursor ? { cursor } : {}),
    });
  } catch (error) {
    if (error instanceof InvalidJobApplicationListCursorError) {
      invalidCursor = true;
    } else if (
      !(error instanceof JobApplicationListWorkspaceUnavailableError)
    ) {
      console.error("Job applications could not be loaded.");
    }
  }

  return (
    <AppShell
      pageTitle="Job applications"
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

          <p className="mt-3 text-sm font-medium text-link">Career</p>

          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Job applications
          </h1>

          <p className="mt-3 max-w-[68ch] text-base leading-6 text-muted-foreground">
            Track each application attempt separately, including saved
            opportunities, current stage, outcome, and upcoming Career activity.
          </p>
        </header>

        <Panel
          title="Find applications"
          description="Search company and role information or narrow the list by current stage."
        >
          <form
            method="get"
            action="/career/applications"
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem_auto]"
          >
            <div>
              <label
                htmlFor="career-search"
                className="block text-sm font-medium text-foreground"
              >
                Search
              </label>

              <div className="relative mt-2">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.9}
                />

                <Input
                  id="career-search"
                  name="search"
                  defaultValue={search}
                  maxLength={200}
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="career-stage-filter"
                className="block text-sm font-medium text-foreground"
              >
                Current stage
              </label>

              <select
                id="career-stage-filter"
                name="stage"
                defaultValue={stage ?? ""}
                className={[
                  "mt-2 min-h-11 w-full rounded-control border border-input",
                  "bg-surface px-3 py-2 text-base text-foreground",
                  "transition-colors duration-(--motion-duration-fast) ease-state",
                  "hover:border-ring",
                  "motion-reduce:transition-none",
                ].join(" ")}
              >
                <option value="">All active stages</option>

                {CAREER_APPLICATION_STAGES.map((item) => (
                  <option key={item} value={item}>
                    {stageLabels[item]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Button type="submit" variant="secondary">
                Apply filters
              </Button>

              {search || stage || cursor ? (
                <Link
                  href="/career/applications"
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                  Reset
                </Link>
              ) : null}
            </div>
          </form>
        </Panel>

        {applications ? (
          <JobApplicationList
            applications={applications}
            search={search}
            stage={stage}
            paginatedView={cursor !== undefined}
          />
        ) : invalidCursor ? (
          <Panel
            title="Application page is unavailable"
            description="The continuation link does not match the current application filters."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              No Career information has been changed. Return to the first
              matching page and continue from there.
            </p>

            <Link
              href="/career/applications"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Return to application list
            </Link>
          </Panel>
        ) : (
          <Panel
            title="Applications temporarily unavailable"
            description="Your Career application list could not be read safely."
          >
            <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
              No application information has been changed. Retry before entering
              another Career record.
            </p>

            <Link
              href="/career/applications"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.9}
              />
              Retry application list
            </Link>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
