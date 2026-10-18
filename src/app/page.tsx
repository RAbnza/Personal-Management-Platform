import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveOnboardingProgress } from "@/app/_lib/onboarding-progress";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { GettingStartedPanel } from "@/components/onboarding/getting-started-panel";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import {
  getDashboard,
  type DashboardResult,
} from "@/modules/dashboard/services/get-dashboard";
import { dashboardQuerySchema } from "@/modules/reporting/domain/period";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    return (
      <AuthCard
        eyebrow="Private workspace"
        title={
          bootstrap.lifecyclePending
            ? "Workspace deletion is pending"
            : "We couldn't prepare your workspace"
        }
        description={
          bootstrap.lifecyclePending
            ? "Ordinary workspace access is blocked. Review deletion status or cancel during the grace period."
            : "Private workspace services are temporarily unavailable."
        }
      >
        <Link
          href={bootstrap.lifecyclePending ? "/settings/lifecycle" : "/"}
          className="text-link underline"
        >
          {bootstrap.lifecyclePending
            ? "Review account lifecycle"
            : "Retry workspace setup"}
        </Link>
      </AuthCard>
    );
  const { user, workspace, preference, modules } = bootstrap;
  const onboarding = await resolveOnboardingProgress({
    userId: user.id,
    workspaceId: workspace.id,
  });
  const moduleEnabled = {
    money: modules.some((m) => m.moduleKey === "money" && m.enabled),
    career: modules.some((m) => m.moduleKey === "career" && m.enabled),
    time: modules.some((m) => m.moduleKey === "time" && m.enabled),
    trackers: modules.some((m) => m.moduleKey === "trackers" && m.enabled),
  };
  let data: DashboardResult | null = null,
    invalid = false;
  try {
    const params = await searchParams;
    if (Object.values(params).some(Array.isArray))
      throw new RangeError("Duplicate query values.");
    const query = dashboardQuerySchema.parse(params);
    data = await getDashboard({
      userId: user.id,
      workspaceId: workspace.id,
      query,
    });
  } catch (error) {
    invalid = error instanceof z.ZodError || error instanceof RangeError;
  }
  return (
    <AppShell
      pageTitle="Home"
      activePath="/"
      modules={modules}
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              YOUR PERSONAL WORKSPACE
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              A clearer day, {user.name.split(" ")[0]}.
            </h1>
          </div>
          <Link
            href="/onboarding"
            className={buttonVariants({ variant: "secondary" })}
          >
            Customize workspace
          </Link>
        </header>
        {onboarding !== null &&
          !onboarding.complete &&
          preference.gettingStartedDismissedAt === null && (
            <GettingStartedPanel progress={onboarding} compact />
          )}
        {data ? (
          <DashboardView data={data} moduleEnabled={moduleEnabled} />
        ) : (
          <Panel title={invalid ? "Check Home filters" : "Home unavailable"}>
            <p role="alert" className="mb-4">
              {invalid
                ? "Choose a supported period with valid ordered dates, at most 366 days. Balances have not been shown for invalid filters."
                : "Dashboard source records could not be loaded. Retry to read a fresh snapshot."}
            </p>
            {invalid ? (
              <DashboardFilters />
            ) : (
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href="/"
              >
                Retry Home
              </Link>
            )}
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
