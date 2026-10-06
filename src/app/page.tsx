import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  RotateCcw,
} from "lucide-react";

import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
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

  const { user, workspace, preference } = bootstrap;

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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel
            title="Money"
            description="Accounts, financial activity, and obligations remain grounded in the financial ledger."
          >
            <div className="flex gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <CircleDollarSign
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.8}
                />
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                Financial summaries will appear here when the Money interface is
                connected. No placeholder balance is shown as if it were real
                data.
              </p>
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

              <p className="text-sm leading-6 text-muted-foreground">
                Application information will appear here once the Career
                interface is implemented, without inventing synthetic
                application counts.
              </p>
            </div>
          </Panel>

          <Panel
            title="Calendar"
            description="Upcoming items will be projected from their authoritative source records."
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

              <p className="text-sm leading-6 text-muted-foreground">
                Agenda information will link back to its source workflow rather
                than becoming a second editable copy.
              </p>
            </div>
          </Panel>
        </div>

        <Panel
          title="Start with what you need"
          description="The workspace is designed for progressive setup rather than requiring every module at once."
        >
          <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
            You can eventually use Career without configuring Money, or begin
            tracking finances without completing unrelated setup. Additional
            application navigation will appear as those workflows become
            available.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
