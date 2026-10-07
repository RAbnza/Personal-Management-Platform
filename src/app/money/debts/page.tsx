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
        <h1 className="text-2xl font-semibold">Invalid debt list filter</h1>

        <Link href="/money/debts" className="text-link underline">
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
      <header>
        <h1 className="text-2xl font-semibold sm:text-3xl">Debts</h1>

        <p className="mt-3 max-w-[68ch] text-muted-foreground">
          Track new borrowing and existing provider-confirmed liabilities.
          Recognized liability and scheduled payable remain separate, and
          missing breakdowns or due dates stay visible as unknown.
        </p>

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
      </header>

      {result.items.length === 0 ? (
        <p className="rounded-card border border-border bg-card p-6">
          {query.data.after
            ? "No more debts in this list."
            : "No debts yet. Record a new borrowing when money is received now, or import an existing provider-confirmed liability that began before your tracked history."}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {result.items.map((debt) => (
            <li
              key={debt.debtId}
              className="min-w-0 rounded-card border border-border bg-card p-5"
            >
              <h2 className="wrap-break-word text-lg font-semibold">
                <Link
                  href={`/money/debts/${debt.debtId}`}
                  className="inline-flex min-h-11 items-center text-link underline-offset-4 hover:underline"
                >
                  {debt.name}
                </Link>
              </h2>

              <p className="wrap-break-word text-sm text-muted-foreground">
                {debt.lenderName} · {debt.lifecycle.replaceAll("_", " ")}
              </p>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt>Recognized liability</dt>

                  <dd className="numeric-value mt-1 font-semibold">
                    {formatMoneyMinorUnits(
                      debt.currency,
                      debt.recognizedLiabilityMinor,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Remaining supplied schedule</dt>

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
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-5">
        {query.data.after ? (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href="/money/debts"
          >
            Back to first page
          </Link>
        ) : null}

        {result.nextCursor ? (
          <Link
            className="inline-flex min-h-11 items-center text-link underline"
            href={`/money/debts?after=${result.nextCursor}`}
          >
            Next debts
          </Link>
        ) : null}
      </div>
    </div>
  );
}
