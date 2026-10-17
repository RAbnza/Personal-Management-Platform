import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { debtWorkspace } from "../debts/_workspace";

export default async function ActivityLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, preference, modules } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Financial activity"
      activePath="/money/actions"
      modules={modules}
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
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
