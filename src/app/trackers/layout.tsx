import type { ReactNode } from "react";
import Link from "next/link";
import { trackerActor } from "./_actor";
import { debtWorkspace } from "@/app/money/debts/_workspace";
import { AppShell } from "@/components/shell/app-shell";
export default async function TrackerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await trackerActor();
  const { user, preference } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Trackers"
      activePath="/trackers"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="min-w-0 space-y-6 break-words">
        <p className="rounded-card border border-border p-3 text-sm">
          Private tracker preview. Tracker reports, Calendar deadlines and
          reminders are not available yet. Workspace export and replacement are
          unavailable while tracker records exist; your saved data and history
          remain retained.
        </p>
        <nav aria-label="Trackers" className="flex flex-wrap gap-5">
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/trackers"
          >
            My trackers and templates
          </Link>
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/trackers/templates/new"
          >
            Create custom template
          </Link>
        </nav>
        {children}
      </div>
    </AppShell>
  );
}
