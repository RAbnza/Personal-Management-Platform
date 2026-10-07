import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { debtWorkspace } from "./_workspace";

export default async function DebtLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, preference, modules } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Debts"
      activePath="/money/debts"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <nav
          aria-label="Money"
          className="flex flex-wrap gap-5 text-sm font-medium text-link"
        >
          <Link
            className="inline-flex min-h-11 items-center"
            href="/money/accounts"
          >
            Accounts
          </Link>
          <Link
            className="inline-flex min-h-11 items-center"
            href="/money/debts"
          >
            Debts
          </Link>
          <Link className="inline-flex min-h-11 items-center" href="/calendar">
            Agenda
          </Link>
        </nav>
        {!modules.find((module) => module.moduleKey === "money")?.enabled ? (
          <p className="rounded-control border border-border p-4 text-sm">
            Money is hidden from normal navigation. Your records and due dates
            are preserved.{" "}
            <Link href="/onboarding" className="text-link underline">
              Restore Money
            </Link>
            .
          </p>
        ) : null}
        {children}
      </div>
    </AppShell>
  );
}
