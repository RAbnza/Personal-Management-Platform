import Link from "next/link";
import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import styles from "./home.module.css";
const linkClass = styles.smallAction;
export function FinancialCoverage({ data }: { data: DashboardResult }) {
  const f = data.finance,
    money = (v: string) => formatMoneyMinorUnits(data.currency, v);
  return (
    <details className="mt-5 border-t border-border pt-3">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">
        Financial details and coverage
      </summary>
      <div className="mt-3 space-y-4">
        <dl className="grid gap-4 md:grid-cols-3">
          <Metric
            title="Tracked net position"
            value={
              data.coverage.noAccounts && data.coverage.noDebts
                ? "Coverage not established"
                : money(f.trackedNetMinor)
            }
            href="#financial-coverage"
            note="Liquid funds plus recorded debt/card credits less recognized liabilities; limited coverage."
          />
          <Metric
            title="Upcoming contractual payments"
            value={`${money(f.upcomingMinor)}${data.coverage.unknownSchedules ? " + unknown dues" : ""}`}
            href="#tracked-debts"
            note={`${data.today} through ${data.horizon}. Current due allocations, separate from recognized liability.`}
          />
          <Metric
            title="Remaining scheduled payable"
            value={`${money(f.scheduledMinor)}${data.coverage.unknownSchedules ? " + unknown dues" : ""}`}
            href="#tracked-debts"
            note={
              data.coverage.unknownSchedules
                ? `${data.coverage.unknownSchedules} debt schedule(s) unknown; total covers supplied schedules only.`
                : "Supplied active schedules after opening, direct and mapped satisfaction."
            }
          />
        </dl>
        <div
          id="financial-coverage"
          className="mt-5 space-y-2 rounded-control border border-border bg-muted p-4 text-sm leading-6"
        >
          <h3 className="font-semibold">Coverage and uncertainty</h3>

          <p>
            Excluded payment clearing: {money(f.clearingMinor)}. Recognized debt
            credit balances: {money(f.liabilityCreditMinor)}.
          </p>

          {f.spending.baselineMinor !== "0" && (
            <p>
              Opening baseline additions in this period:{" "}
              {money(f.spending.baselineMinor)}; excluded from income and
              spending.
            </p>
          )}
          <p>
            Opening/import cutoffs are listed with each record below. A debt
            with no import cutoff was tracked from origination.
          </p>
        </div>
        <details id="tracked-accounts" className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting cash accounts
          </summary>
          {f.accounts.length === 0 ? (
            <p>No cash accounts tracked. Add an account when you are ready.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.accounts.map((a) => (
                <li key={a.account_id} className="py-2">
                  <Link
                    className="block min-h-11 max-w-full break-words text-sm font-semibold text-link underline-offset-4 hover:underline"
                    href={`/money/accounts/${a.account_id}/history`}
                  >
                    {a.name}: {money(a.current_balance_minor)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Opening cutoff {a.opening_cutoff_date}
                    {a.archived ? " · Archived" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details id="tracked-debts" className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting debt liabilities and schedules
          </summary>
          {f.debts.length === 0 ? (
            <p>No debt records tracked. Other liabilities remain unknown.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.debts.map((d) => (
                <li key={d.debtId} className="py-2">
                  <Link className={linkClass} href={`/money/debts/${d.debtId}`}>
                    {d.name}
                  </Link>
                  <p className="text-sm leading-6">
                    Recognized balance {money(d.liabilityMinor)} · Remaining
                    schedule{" "}
                    {d.scheduledMinor === null
                      ? "Not supplied / no active dues"
                      : money(d.scheduledMinor)}{" "}
                    · Upcoming {money(d.upcomingMinor)} · Overdue{" "}
                    {money(d.overdueMinor)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {d.cutoffDate
                      ? `Import cutoff ${d.cutoffDate}`
                      : "Tracked from origination"}{" "}
                    · Breakdown {d.breakdownStatus}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Supporting credit card liabilities
          </summary>
          <ul className="divide-y divide-border">
            {f.cards.map((c) => (
              <li key={c.cardId} className="py-3">
                <Link href={`/money/cards/${c.cardId}`} className={linkClass}>
                  {c.name}: {money(c.liabilityMinor)}
                </Link>
              </li>
            ))}
          </ul>
          {!f.cards.length && <p>No tracked cards.</p>}
        </details>
      </div>
    </details>
  );
}
function Metric({
  title,
  value,
  href,
  note,
}: {
  title: string;
  value: string;
  href: string;
  note: string;
}) {
  return (
    <div className="min-w-0 border-l-2 border-border px-4 py-2">
      <dt className="text-sm text-muted-foreground">{title}</dt>
      <dd>
        <Link
          href={href}
          aria-label={`${title}: ${value}`}
          className={styles.smallAction}
        >
          {value}
        </Link>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{note}</p>
      </dd>
    </div>
  );
}
