import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { z } from "zod";
import { DebtSettlementForm } from "@/components/money/debt-settlement-form";
import { Panel } from "@/components/ui/panel";
import { getDebtSettlementSetup } from "@/modules/finance/services/settle-debt";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { debtWorkspace } from "../../_workspace";
export default async function SettleDebtPage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const { user, workspace } = await debtWorkspace();
  const parsed = z.object({ debtId: z.uuid() }).safeParse(await params);
  let setup: Awaited<ReturnType<typeof getDebtSettlementSetup>> | null = null;
  let unavailable = !parsed.success;
  if (parsed.success)
    try {
      setup = await getDebtSettlementSetup({
        userId: user.id,
        workspaceId: workspace.id,
        debtId: parsed.data.debtId,
      });
    } catch (e) {
      unavailable = e instanceof DebtUnavailableError;
    }
  const back = parsed.success
    ? `/money/debts/${parsed.data.debtId}`
    : "/money/debts";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspace.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="action-link">
          Back to debt
        </Link>
        {setup && (
          <BreadcrumbRecords
            path={`${back}/settle`}
            labels={{ [back]: setup.detail.debt.name }}
          />
        )}
        <ScreenHeader scope="Money" title="Settle debt" />
        <p className="mt-3 text-muted-foreground">
          Record an explicit provider-confirmed payoff and verify accounting
          resolution before closing the debt.
        </p>
      </div>
      {unavailable ? (
        <Panel
          title="Debt unavailable"
          description="This debt could not be found in your private workspace."
        />
      ) : !setup ? (
        <Panel
          title="Settlement entry temporarily unavailable"
          description="Current settlement information could not be loaded safely."
        >
          <p>No settlement has been submitted.</p>
          <Link className="action-link" href={`${back}/settle`}>
            Retry settlement setup
          </Link>
        </Panel>
      ) : setup.detail.debt.lifecycle !== "active" ? (
        <Panel
          title="Settlement entry unavailable"
          description="Settlement requires an active debt."
        />
      ) : (
        <DebtSettlementForm setup={setup} today={today} />
      )}
    </div>
  );
}
