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
      <header>
        <Link
          href={back}
          className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
        >
          Back to debt
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
          Record debt payment
        </h1>
        <p className="mt-3 text-muted-foreground">
          Record an actual payment with explicit accounting and contractual
          allocations.
        </p>
      </header>
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
          <Link
            href={`${back}/pay`}
            className="mt-3 inline-flex min-h-11 items-center text-link underline"
          >
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
          <Link
            href="/money/accounts"
            className="inline-flex min-h-11 items-center text-link underline"
          >
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
