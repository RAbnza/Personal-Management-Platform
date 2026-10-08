import Link from "next/link";
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
        title="We couldn't prepare your workspace"
        description="Private workspace services are temporarily unavailable."
      >
        <Link href="/" className="text-link underline">
          Retry workspace setup
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
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-3 text-muted-foreground">
            Your tracked records, commitments and next actions.
          </p>
        </header>
        {data ? (
          <DashboardView data={data} moduleEnabled={moduleEnabled} />
        ) : (
          <Panel
            title={
              invalid ? "Check Dashboard filters" : "Dashboard unavailable"
            }
          >
            <p role="alert" className="mb-4">
              {invalid
                ? "Choose a supported period with valid ordered dates, at most 366 days. Balances have not been shown for invalid filters."
                : "Dashboard source records could not be loaded. Retry to read a fresh snapshot."}
            </p>
            {invalid ? (
              <DashboardFilters />
            ) : (
              <Link
                className="inline-flex min-h-11 items-center text-link underline"
                href="/"
              >
                Retry Dashboard
              </Link>
            )}
          </Panel>
        )}
        {onboarding !== null &&
          !onboarding.complete &&
          preference.gettingStartedDismissedAt === null && (
            <GettingStartedPanel progress={onboarding} />
          )}
      </div>
    </AppShell>
  );
}
