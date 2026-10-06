import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
} from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";

export default function Home() {
  return (
    <AppShell pageTitle="Dashboard" activePath="/">
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
