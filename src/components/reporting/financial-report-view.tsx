import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  financialMetrics,
  reportDates,
  type FinancialMetric,
} from "@/modules/reporting/domain/reports";
import type { FinancialReport } from "@/modules/reporting/services/get-reports";
import { LazyReportChart, LazyCategoryChart } from "./lazy-report-chart";
export function FinancialReportView({ data }: { data: FinancialReport }) {
  const money = (v: string) => formatMoneyMinorUnits(data.currency, v),
    dates = reportDates(data.period);
  const href = (metric: FinancialMetric, categoryId?: string) =>
    `/reports/financial/detail?${dates}&metric=${metric}${categoryId ? `&categoryId=${categoryId}` : ""}`;
  const sections: { title: string; metrics: FinancialMetric[] }[] = [
    {
      title: "Income and spending",
      metrics: [
        "income",
        "gross",
        "offsets",
        "net",
        "fees",
        "interest",
        "penalties",
        "debt_charges",
      ],
    },
    {
      title: "Actual cash movement",
      metrics: [
        "opening_cash",
        "cash_in",
        "cash_out",
        "baseline",
        "adjustments",
        "net_cash_change",
        "closing_cash",
        "transfers",
        "internal_cash_net",
        "borrowing",
        "cash_refunds",
        "debt_payments",
        "principal",
      ],
    },
    {
      title: "Recognized liability and tracked position",
      metrics: [
        "opening_liability",
        "liability_increases",
        "liability_reductions",
        "waivers",
        "closing_liability",
        "clearing",
        "tracked_net",
      ],
    },
  ];
  return (
    <div className="space-y-6">
      <Panel title="Coverage and definitions">
        <p>{data.coverage.note}</p>
        <p className="mt-2">{data.coverage.scope}</p>
        {data.coverage.periodBeforeCutoff && (
          <p className="mt-2 text-warning">
            This period reaches an opening cutoff. Earlier financial history was
            not supplied; coverage is incomplete.
          </p>
        )}
        {data.coverage.noAccounts && (
          <p className="mt-2 text-warning">
            No tracked accounts. Liquid-fund coverage is not established.
          </p>
        )}
        {data.coverage.noDebts && (
          <p className="mt-2">
            No recognized liability records. Unrecorded obligations remain
            unknown.
          </p>
        )}
        {data.coverage.incompleteLiability && (
          <p className="mt-2 text-warning">
            Some principal/cost breakdowns are unknown. Unclassified liability
            is included without estimating its components.
          </p>
        )}
        <p className="mt-2 text-sm">
          Posting amounts include all correction legs. Original dates are
          preserved; genuine refunds use their actual dates. Debt payments,
          principal, fees and expense summaries overlap where labeled and must
          not be added together.
        </p>
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer font-medium">
            Supporting records and opening cutoffs
          </summary>
          <ul>
            {data.coverage.cutoffs.map((c) => (
              <li key={`${c.kind}:${c.recordId}`}>
                <Link
                  className="inline-flex min-h-11 items-center text-link underline"
                  href={
                    c.kind === "account"
                      ? `/money/accounts/${c.recordId}/history`
                      : `/money/debts/${c.recordId}`
                  }
                >
                  {c.name}:{" "}
                  {c.cutoffDate
                    ? `opening through ${c.cutoffDate}`
                    : "tracked from origination"}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </Panel>
      {sections.map((section) => (
        <Panel key={section.title} title={section.title}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {section.title} for {data.period.startDate} through{" "}
                {data.period.endDate}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="p-3">
                    Metric and drilldown
                  </th>
                  <th scope="col" className="p-3 text-right">
                    {data.currency}
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.metrics.map((metric) => {
                  const value =
                    data.coverage.noAccounts &&
                    ["opening_cash", "closing_cash"].includes(metric)
                      ? "No tracked accounts"
                      : data.coverage.noAccounts && metric === "tracked_net"
                        ? "Coverage not established"
                        : money(data.metrics[metric]);
                  return (
                    <tr key={metric} className="border-t border-border">
                      <th scope="row" className="p-3 font-medium">
                        <Link
                          href={href(metric)}
                          className="inline-flex min-h-11 items-center text-link underline"
                          aria-label={`${financialMetrics[metric]}: ${value}; view contributions`}
                        >
                          {financialMetrics[metric]}
                        </Link>
                      </th>
                      <td className="p-3 text-right tabular-nums">{value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <Panel
        title="Reconciliation identities"
        description="Complementary accounting views, never one combined total."
      >
        <p>
          Closing liquid funds = opening liquid funds + external inflows −
          external outflows + baseline changes + explicit balance adjustments.
        </p>
        <p className="mt-2">
          {money(data.metrics.closing_cash)} ={" "}
          {money(data.metrics.opening_cash)} + {money(data.metrics.cash_in)} −{" "}
          {money(data.metrics.cash_out)} + {money(data.metrics.baseline)} +{" "}
          {money(data.metrics.adjustments)}.
        </p>
        <p className="mt-2">
          Liability closing = opening + recognized increases/baselines −
          recognized reductions.
        </p>
        <p className="mt-2">
          {money(data.metrics.closing_liability)} ={" "}
          {money(data.metrics.opening_liability)} +{" "}
          {money(data.metrics.liability_increases)} −{" "}
          {money(data.metrics.liability_reductions)}.
        </p>
        <p className="mt-2 font-medium">
          {data.identities.cashMatches && data.identities.liabilityMatches
            ? "Both identities reconcile to signed postings."
            : "An identity needs review; inspect contributions before relying on this report."}
        </p>
      </Panel>
      <Panel
        title={`Spending by category · ${data.period.startDate}–${data.period.endDate}`}
        description="Category grain: each categorized posting contributes once. Uncategorized entries remain explicit."
      >
        {data.categories.length > 0 && (
          <>
            <LazyCategoryChart
              rows={data.categories.slice(0, 20)}
              currency={data.currency}
            />
            <p className="text-sm text-muted-foreground">
              Top 20 net-spending categories; approximate chart coordinates. The
              table contains all exact category contributions, including
              negative offsets.
            </p>
          </>
        )}
        {data.categories.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Category", "Gross", "Offsets", "Net"].map((h) => (
                    <th key={h} scope="col" className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr
                    key={c.categoryId ?? "uncategorized"}
                    className="border-t border-border"
                  >
                    <th scope="row" className="p-3 font-medium">
                      {c.category}
                    </th>
                    {(["gross", "offsets", "net"] as const).map((m) => (
                      <td key={m} className="p-3 tabular-nums">
                        <Link
                          className="inline-flex min-h-11 items-center text-link underline"
                          href={href(m, c.categoryId ?? "uncategorized")}
                          aria-label={`${c.category} ${m}: ${money(c[`${m}Minor`])}`}
                        >
                          {money(c[`${m}Minor`])}
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No recognized spending contributions in this period.</p>
        )}
      </Panel>
      <Panel
        title={`Daily activity · ${data.period.startDate}–${data.period.endDate}`}
        description={`Recognized income, net spending and external cash outflows; ${data.currency}. Dates with no posted activity are absent; earlier missing history is not inferred.`}
      >
        {data.trend.length ? (
          <>
            <LazyReportChart rows={data.trend} currency={data.currency} />
            <details open className="mt-3">
              <summary className="min-h-11 cursor-pointer font-medium">
                View exact daily data
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Effective date",
                        "Income",
                        "Net spending",
                        "External outflow",
                      ].map((h) => (
                        <th key={h} scope="col" className="p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((r) => (
                      <tr key={r.date} className="border-t border-border">
                        <th scope="row" className="p-3">
                          {r.date}
                        </th>
                        {(["income", "net", "cash_out"] as const).map(
                          (m, i) => (
                            <td key={m} className="p-3 tabular-nums">
                              <Link
                                href={`/reports/financial/detail?period=custom&startDate=${r.date}&endDate=${r.date}&metric=${m}`}
                                className="inline-flex min-h-11 items-center text-link underline"
                              >
                                {money(
                                  [r.incomeMinor, r.netMinor, r.cashOutMinor][
                                    i
                                  ]!,
                                )}
                              </Link>
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p>No posted daily activity. Missing coverage remains unknown.</p>
        )}
      </Panel>
      <Panel
        title="Current scheduled payable in the selected due-date period"
        description="Current version and actual current allocations at generation time; includes future contractual charges. Separate from recognized liability."
      >
        <p className="font-semibold">
          Known remaining: {money(data.scheduledMinor)}
          {data.coverage.unknownSchedules
            ? ` + ${data.coverage.unknownSchedules} debts with unknown schedules`
            : ""}
        </p>
        {data.schedule.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Debt / due",
                    "Contractual",
                    "Opening satisfaction",
                    "Total satisfaction",
                    "Remaining",
                  ].map((h) => (
                    <th scope="col" key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((s) => (
                  <tr key={s.installmentId} className="border-t border-border">
                    <th scope="row" className="p-3">
                      <Link
                        className="inline-flex min-h-11 items-center text-link underline"
                        href={`/money/debts/${s.debtId}`}
                      >
                        {s.name} · {s.dueDate}
                      </Link>
                    </th>
                    {[
                      s.contractualMinor,
                      s.openingSatisfiedMinor,
                      s.satisfiedMinor,
                      s.remainingMinor,
                    ].map((v, i) => (
                      <td key={i} className="p-3 tabular-nums">
                        {money(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2">
            No supplied active schedule entries in this due-date period.
          </p>
        )}
      </Panel>
      <Panel
        title="Cash movement by meaning"
        description="Cash posting grain; inherited directions preserve correction signs. Internal legs net to zero in consolidated scope."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-3">
                  Meaning / direction
                </th>
                <th scope="col" className="p-3">
                  Exact contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {data.cash.map((c) => {
                const metric =
                  c.direction === "in"
                    ? "cash_in"
                    : c.direction === "out"
                      ? "cash_out"
                      : c.direction === "internal"
                        ? "internal_cash_net"
                        : c.direction === "baseline"
                          ? "baseline"
                          : "adjustments";
                return (
                  <tr
                    key={`${c.kind}:${c.direction}`}
                    className="border-t border-border"
                  >
                    <th scope="row" className="p-3 font-medium">
                      {c.kind} · {c.direction}
                    </th>
                    <td className="p-3">
                      <Link
                        href={`${href(metric)}&flowKind=${c.kind}`}
                        className="inline-flex min-h-11 items-center text-link underline"
                      >
                        {money(c.amountMinor)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.cash.length && <p>No supplied cash movements in this period.</p>}
      </Panel>
      <Panel
        title="Liability component roll-forward"
        description="Recognized posting components only. Unclassified is retained; no principal/interest proportions are estimated."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Component",
                  "Opening",
                  "Increases / baselines",
                  "Reductions",
                  "Closing",
                ].map((h) => (
                  <th scope="col" key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.liabilityComponents.map((c) => (
                <tr key={c.component} className="border-t border-border">
                  <th scope="row" className="p-3 font-medium">
                    {c.component}
                  </th>
                  {(
                    [
                      "opening_liability",
                      "liability_increases",
                      "liability_reductions",
                      "closing_liability",
                    ] as const
                  ).map((m, i) => (
                    <td key={m} className="p-3">
                      <Link
                        className="inline-flex min-h-11 items-center text-link underline"
                        href={`${href(m)}&liabilityComponent=${c.component}`}
                      >
                        {money(
                          [
                            c.openingMinor,
                            c.increasesMinor,
                            c.reductionsMinor,
                            c.closingMinor,
                          ][i]!,
                        )}
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title="Supporting recognized debt balances"
        description="Period-end credit-normal balances. Negative values are recognized debt credit states, separately visible here; future schedules are not counted as liability."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {["Debt", "Opening", "Closing / credit state"].map((h) => (
                  <th scope="col" key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.liabilityRecords.map((d) => (
                <tr key={d.debtId} className="border-t border-border">
                  <th scope="row" className="p-3">
                    <Link
                      href={`/money/debts/${d.debtId}`}
                      className="inline-flex min-h-11 items-center text-link underline"
                    >
                      {d.name}
                    </Link>
                  </th>
                  <td className="p-3">
                    <Link
                      href={`${href("opening_liability")}&ledgerId=${d.ledgerId}`}
                      className="inline-flex min-h-11 items-center text-link underline"
                    >
                      {money(d.openingMinor)}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`${href("closing_liability")}&ledgerId=${d.ledgerId}`}
                      className="inline-flex min-h-11 items-center text-link underline"
                    >
                      {money(d.closingMinor)}
                      {d.closingMinor.startsWith("-") ? " · debt credit" : ""}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
