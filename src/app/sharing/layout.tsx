import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { sharingEnabled } from "@/modules/sharing/domain/sharing";
import { debtWorkspace } from "@/app/money/debts/_workspace";
import { AppShell } from "@/components/shell/app-shell";
export default async function SharingLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  if (!sharingEnabled()) notFound();
  const { user, preference } = await debtWorkspace();
  return (
    <AppShell
      pageTitle="Shared Expenses"
      activePath="/sharing"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="min-w-0 space-y-6 break-words">
        <p className="rounded-card border border-border p-3 text-sm">
          Shared group records · Private financial adoption requires your
          approval. Pending reports affect confirmed group balances only after
          receipt confirmation.
        </p>
        <nav aria-label="Sharing" className="flex flex-wrap gap-5">
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/sharing"
          >
            Groups
          </Link>
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/money/transactions"
          >
            Add Expense
          </Link>
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/settings"
          >
            Settings and password verification
          </Link>
        </nav>
        {children}
      </div>
    </AppShell>
  );
}
