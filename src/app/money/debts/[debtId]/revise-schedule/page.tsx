import Link from "next/link";
import { z } from "zod";
import { Panel } from "@/components/ui/panel";
import { DebtScheduleRevisionForm } from "@/components/money/debt-schedule-revision-form";
import { getDebtScheduleSetup } from "@/modules/finance/services/get-debt-schedule-setup";
import { DebtUnavailableError } from "@/modules/finance/services/read-debts";
import { debtWorkspace } from "../../_workspace";
export default async function ReviseSchedulePage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const { user, workspace } = await debtWorkspace();
  const parsed = z.object({ debtId: z.uuid() }).safeParse(await params);
  let setup: Awaited<ReturnType<typeof getDebtScheduleSetup>> | null = null;
  let unavailable = !parsed.success;
  if (parsed.success)
    try {
      setup = await getDebtScheduleSetup({
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
      <header>
        <Link
          href={back}
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Back to debt
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Revise debt schedule</h1>
        <p className="mt-3 text-muted-foreground">
          Review contractual terms, carried payment satisfaction and affected
          Agenda dates. Every finalized version stays in history.
        </p>
      </header>
      {unavailable ? (
        <Panel
          title="Debt unavailable"
          description="This debt could not be found in your private workspace."
        />
      ) : !setup ? (
        <Panel
          title="Schedule revision temporarily unavailable"
          description="The current schedule and allocation snapshot could not be loaded safely."
        >
          <Link
            href={`${back}/revise-schedule`}
            className="inline-flex min-h-11 items-center text-link underline"
          >
            Retry loading schedule
          </Link>
        </Panel>
      ) : setup.detail.debt.lifecycle !== "active" ? (
        <Panel
          title="Revision unavailable"
          description="Schedule revisions require an active debt."
        />
      ) : (
        <DebtScheduleRevisionForm setup={setup} today={today} />
      )}
    </div>
  );
}
