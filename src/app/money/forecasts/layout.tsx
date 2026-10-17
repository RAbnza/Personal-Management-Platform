import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { debtWorkspace } from "../debts/_workspace";
export default async function ForecastLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, preference, modules } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Forecasts"
      activePath="/money/forecasts"
      modules={modules}
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6 break-words">
        {!modules.find((m) => m.moduleKey === "money")?.enabled && (
          <p>
            Money is hidden from navigation. Forecast source records remain
            preserved.{" "}
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
