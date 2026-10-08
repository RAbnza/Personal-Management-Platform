import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolvePrivateAppBootstrap } from "@/app/_lib/private-app-bootstrap";
import { AuthCard } from "@/components/auth/auth-card";
import { AccountReconciliationForm } from "@/components/money/account-reconciliation-form";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/panel";
import { FinancialAccountNotFoundError } from "@/modules/finance/services/get-account-history";
import { getAccountReconciliationSetup } from "@/modules/finance/services/reconcile-account";
import type { ReconciliationSetup } from "@/modules/finance/domain/reconciliation";
export default async function ReconcileAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const bootstrap = await resolvePrivateAppBootstrap(await headers());
  if (bootstrap.kind === "unauthorized") redirect("/auth/sign-in");
  if (bootstrap.kind === "unavailable")
    return (
      <AuthCard
        eyebrow="Money"
        title="Workspace unavailable"
        description="Your private workspace could not be prepared safely."
      >
        <Link
          href="/money/accounts"
          className="inline-flex min-h-11 text-link underline"
        >
          Return to accounts
        </Link>
      </AuthCard>
    );
  const { user, workspace, preference } = bootstrap;
  const parsed = z.object({ accountId: z.uuid() }).safeParse(await params);
  let setup: ReconciliationSetup | null = null,
    unavailable = !parsed.success;
  if (parsed.success)
    try {
      setup = await getAccountReconciliationSetup({
        userId: user.id,
        workspaceId: workspace.id,
        financialAccountId: parsed.data.accountId,
      });
    } catch (e) {
      unavailable = e instanceof FinancialAccountNotFoundError;
    }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspace.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <AppShell
      pageTitle="Account reconciliation"
      activePath="/money/accounts"
      userName={user.name}
      userEmail={user.email}
      workspaceTheme={preference.theme}
      workspacePreferenceVersion={preference.version}
      gettingStartedDismissed={preference.gettingStartedDismissedAt !== null}
    >
      <div className="space-y-6">
        <header>
          <Link
            href="/money/accounts"
            className="inline-flex min-h-11 text-link underline"
          >
            Back to accounts
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Account reconciliation
          </h1>
          <p className="mt-3 text-muted-foreground">
            Compare an observed balance, investigate differences, and review any
            explicit correction before saving.
          </p>
        </header>
        {unavailable ? (
          <Panel
            title="Account unavailable"
            description="This account could not be found in your private workspace."
          />
        ) : !setup ? (
          <Panel
            title="Comparison temporarily unavailable"
            description="Current account sources could not be loaded safely."
          >
            <p>No comparison or adjustment has been submitted.</p>
            <Link
              href={
                parsed.success
                  ? `/money/accounts/${parsed.data.accountId}/reconcile`
                  : "/money/accounts"
              }
              className="inline-flex min-h-11 text-link underline"
            >
              Retry account setup
            </Link>
          </Panel>
        ) : (
          <AccountReconciliationForm setup={setup} today={today} />
        )}
      </div>
    </AppShell>
  );
}
