import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { z } from "zod";
import { DebtPaymentForm } from "@/components/money/debt-payment-form";
import { Panel } from "@/components/ui/panel";
import { getDebtPaymentSetup } from "@/modules/finance/services/get-debt-payment-setup";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { debtWorkspace } from "../../_workspace";

export default async function PayDebtPage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const { user, workspace } = await debtWorkspace();
  const parsed = z.object({ debtId: z.uuid() }).safeParse(await params);
  let setup: Awaited<ReturnType<typeof getDebtPaymentSetup>> | null = null;
  let unavailable = !parsed.success;
  if (parsed.success)
    try {
      setup = await getDebtPaymentSetup({
        userId: user.id,
        workspaceId: workspace.id,
        debtId: parsed.data.debtId,
      });
    } catch (error) {
      unavailable = error instanceof DebtUnavailableError;
    }
  const back = parsed.success
    ? `/money/debts/${parsed.data.debtId}`
    : "/money/debts";
  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="action-link">
          Back to debt
        </Link>
        {setup && (
          <BreadcrumbRecords
            path={`${back}/pay`}
            labels={{ [back]: setup.detail.debt.name }}
          />
        )}
        <ScreenHeader scope="Money" title="Record debt payment" />
        <p className="mt-3 text-muted-foreground">
          Record an actual payment with explicit accounting and contractual
          allocations.
        </p>
      </div>
      {unavailable ? (
        <Panel
          title="Debt unavailable"
          description="This debt could not be found in your private workspace."
        />
      ) : !setup ? (
        <Panel
          title="Payment entry temporarily unavailable"
          description="Current debt, account and category information could not be loaded safely."
        >
          <p className="text-sm">
            No payment has been submitted. Retry loading before recording it.
          </p>
          <Link href={`${back}/pay`} className="action-link">
            Retry payment setup
          </Link>
        </Panel>
      ) : setup.detail.debt.lifecycle !== "active" ||
        !setup.detail.debt.scheduleVersionId ? (
        <Panel
          title="Payment entry unavailable"
          description="New payments require an active debt with a finalized schedule context."
        />
      ) : setup.accounts.items.length === 0 ? (
        <Panel
          title="Add a paying account first"
          description="A debt payment must identify the tracked account where cash was actually paid."
        >
          <Link href="/money/accounts" className="action-link">
            Add financial account
          </Link>
        </Panel>
      ) : (
        <DebtPaymentForm
          detail={setup.detail}
          accounts={setup.accounts.items}
          categories={setup.categories.items}
        />
      )}
    </div>
  );
}
