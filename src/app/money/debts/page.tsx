import { ScreenHeader } from "@/components/patterns/work-area";
import { ArrowUpRight, CreditCard } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import Link from "next/link";

import { debtReadQuerySchema } from "@/modules/finance/domain/debt";
import { listDebts } from "@/modules/finance/services/read-debts";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "./_workspace";

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, workspace } = await debtWorkspace();

  const query = debtReadQuerySchema.safeParse(await searchParams);

  if (!query.success) {
    return (
      <div>
        <ScreenHeader scope="Money" title="Invalid debt list filter" />

        <Link href="/money/debts" className="action-link">
          Reset filters
        </Link>
      </div>
    );
  }

  const result = await listDebts({
    userId: user.id,
    workspaceId: workspace.id,
    ...query.data,
  });

  return (
    <div className="space-y-6">
      <div>
        <ScreenHeader scope="Money" title="Debts" />

        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          A clear view of what you owe.
          <InfoTip title="Debt balances">
            Recorded debt balances and scheduled payments are separate. Missing
            breakdowns and due dates stay unknown until you supply evidence.
          </InfoTip>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/money/debts/borrow"
            className={[
              "inline-flex min-h-11 items-center justify-center",
              "rounded-button bg-primary px-4 py-2",
              "font-semibold text-primary-foreground",
              "transition-colors duration-(--motion-duration-fast) ease-state",
              "hover:bg-primary-hover active:bg-primary-pressed",
              "motion-reduce:transition-none",
            ].join(" ")}
          >
            Record new borrowing
          </Link>

          <Link
            href="/money/debts/import"
            className={[
              "inline-flex min-h-11 items-center justify-center",
              "rounded-button border border-border bg-surface px-4 py-2",
              "font-semibold text-foreground",
              "transition-colors duration-(--motion-duration-fast) ease-state",
              "hover:bg-surface-subtle",
              "motion-reduce:transition-none",
            ].join(" ")}
          >
            Import existing debt
          </Link>
        </div>
      </div>

      {result.items.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-6">
          {query.data.after
            ? "No more debts in this list."
            : "No debts yet. Record a new borrowing when money is received now, or import an existing provider-confirmed liability that began before your tracked history."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {result.items.map((debt) => (
            <li
              key={debt.debtId}
              className="grid min-w-0 gap-x-6 gap-y-2 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
            >
              <h2 className="wrap-break-word text-lg font-semibold">
                <Link
                  href={`/money/debts/${debt.debtId}`}
                  className="action-link"
                >
                  {debt.name}
                  <ArrowUpRight size={16} />
                </Link>
              </h2>

              <p className="wrap-break-word text-sm text-muted-foreground">
                {debt.lenderName} · {debt.lifecycle.replaceAll("_", " ")}
              </p>

              <dl className="grid gap-4 text-sm sm:grid-cols-3 lg:col-start-2 lg:row-span-3 lg:row-start-1">
                <div>
                  <dt>Recorded balance</dt>

                  <dd className="numeric-value mt-1 font-semibold">
                    {formatMoneyMinorUnits(
                      debt.currency,
                      debt.recognizedLiabilityMinor,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Scheduled payments left</dt>

                  <dd className="numeric-value mt-1">
                    {debt.remainingScheduledMinor === null
                      ? "Unknown — schedule not supplied"
                      : formatMoneyMinorUnits(
                          debt.currency,
                          debt.remainingScheduledMinor,
                        )}
                  </dd>
                </div>

                <div>
                  <dt>Liability breakdown</dt>

                  <dd>
                    {debt.breakdownStatus === "known"
                      ? "Known"
                      : debt.breakdownStatus === "partial"
                        ? "Partially known"
                        : "Breakdown not provided"}
                  </dd>
                </div>
              </dl>
              {debt.lifecycle === "active" && (
                <Link
                  href={`/money/debts/${debt.debtId}/pay`}
                  className="action-link w-fit"
                >
                  <CreditCard size={16} />
                  Record payment
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-5">
        {query.data.after ? (
          <Link className="action-link" href="/money/debts">
            Back to first page
          </Link>
        ) : null}

        {result.nextCursor ? (
          <Link
            className="action-link"
            href={`/money/debts?after=${result.nextCursor}`}
          >
            Next debts
          </Link>
        ) : null}
      </div>
    </div>
  );
}
