import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { debtWorkspace } from "../debts/_workspace";
export default async function RecurringLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, preference, modules } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Recurring obligations"
      activePath="/money/recurring"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6 break-words">
        <nav
          aria-label="Money"
          className="flex flex-wrap gap-5 text-sm font-medium text-link"
        >
          {[
            ["Accounts", "/money/accounts"],
            ["Credit cards", "/money/cards"],
            ["Recurring obligations", "/money/recurring"],
            ["Budgets", "/money/budgets"],
            ["Financial activity", "/money/actions"],
            ["Agenda", "/calendar"],
          ].map(([label, path]) => (
            <Link
              key={path}
              href={path!}
              className="inline-flex min-h-11 items-center"
            >
              {label}
            </Link>
          ))}
        </nav>
        {!modules.find((m) => m.moduleKey === "money")?.enabled && (
          <p>
            Money is hidden from normal navigation. Existing plans and due dates
            remain preserved.{" "}
            <Link href="/onboarding" className="text-link underline">
              Restore Money
            </Link>
            .
          </p>
        )}
        {children}
      </div>
    </AppShell>
  );
}
