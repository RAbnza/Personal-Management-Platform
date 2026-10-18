"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import type { DashboardResult } from "@/modules/dashboard/services/get-dashboard";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { spendingHref } from "@/modules/reporting/domain/period";
import { InfoTip } from "@/components/ui/info-tip";
import styles from "./home.module.css";

type Props = {
  finance: DashboardResult["finance"];
  currency: string;
  period: DashboardResult["period"];
};
const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

// Numeric coordinates are presentation only. All labels and tooltips retain the
// original signed integer string, including amounts above Number's safe range.
export function SpendingCharts({ finance, currency, period }: Props) {
  const [metric, setMetric] = useState<"netMinor" | "incomeMinor">("netMinor");
  const money = (value: string) => formatMoneyMinorUnits(currency, value);
  const trend = finance.breakdowns.trend.map((row) => ({
    ...row,
    plotted: Number(row[metric]) / 100,
  }));
  const categories = finance.breakdowns.categories.map((row, index) => ({
    ...row,
    plotted: Number(row.netMinor) / 100,
    color: colors[index % colors.length]!,
  }));
  const categoryHref = (id: string | null) =>
    `/reports/financial/detail?${new URLSearchParams({ period: "custom", startDate: period.startDate, endDate: period.endDate, metric: "net", categoryId: id ?? "uncategorized" })}`;
  const tick = (v: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  return (
    <>
      <section className={styles.trend} aria-labelledby="spending-trend-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>YOUR MONEY IN MOTION</p>
            <h2 id="spending-trend-title">The spending picture</h2>
          </div>
          <InfoTip title="Daily activity">
            Posted daily totals for the selected period. Refunds and corrections
            can make spending negative. Only dates with recorded postings are
            plotted; this is not a balance history. Exact values are available
            below.
          </InfoTip>
        </div>
        <div className={styles.chartToolbar}>
          <div className={styles.segmented} aria-label="Chart metric">
            {(
              [
                ["netMinor", "Spending"],
                ["incomeMinor", "Income"],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span>
            {period.startDate} — {period.endDate}
          </span>
        </div>
        {trend.length ? (
          <div
            className={styles.chart}
            role="group"
            aria-label={`Daily ${metric === "netMinor" ? "net spending" : "income"}; exact values in chart data`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart
                data={trend}
                margin={{ top: 12, right: 10, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(v).slice(5)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={tick}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="var(--input)" />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className={styles.tooltip}>
                        <span>{payload[0].payload.date}</span>
                        <strong>{money(payload[0].payload[metric])}</strong>
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="linear"
                  dataKey="plotted"
                  stroke="var(--chart-1)"
                  fill="var(--accent)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={trend.length === 1}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={styles.chartEmpty}>
            <span>No activity in this period</span>
            <p>Your recorded income and spending will appear here.</p>
          </div>
        )}
        <div className={styles.chartFooter}>
          <span>Recorded activity · {currency}</span>
          <Link href={spendingHref(period)} className={styles.smallAction}>
            Explore spending <ArrowUpRight size={16} />
          </Link>
        </div>
        {trend.length > 0 && (
          <details className={styles.dataDisclosure}>
            <summary>Exact chart data</summary>
            <div className={styles.dataTable}>
              <table>
                <caption>Recorded daily totals ({currency})</caption>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Net spending</th>
                    <th>Income</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td>{money(row.netMinor)}</td>
                      <td>{money(row.incomeMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
      <section className={styles.categories} aria-labelledby="category-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>WHERE IT WENT</p>
            <h2 id="category-title">By category</h2>
          </div>
          <InfoTip title="Category spending">
            Net spending includes refunds, rebates and waivers in this period.
            Negative totals are credits. Transfers and debt principal payments
            are excluded.
          </InfoTip>
        </div>
        {categories.length ? (
          <>
            <div
              className={styles.categoryChart}
              role="group"
              aria-label="Top five categories by signed net spending"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={categories.slice(0, 5)}
                  layout="vertical"
                  margin={{ left: 0, right: 16 }}
                  accessibilityLayer
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={100}
                    tick={{ fill: "var(--foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine x={0} stroke="var(--input)" />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className={styles.tooltip}>
                          <span>{payload[0].payload.category}</span>
                          <strong>{money(payload[0].payload.netMinor)}</strong>
                        </div>
                      ) : null
                    }
                  />
                  <Bar
                    dataKey="plotted"
                    barSize={14}
                    radius={4}
                    isAnimationActive={false}
                  >
                    {categories.slice(0, 5).map((row) => (
                      <Cell key={row.categoryId ?? "none"} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className={styles.categoryList}>
              {categories.slice(0, 5).map((row) => (
                <li key={row.categoryId ?? "none"}>
                  <Link href={categoryHref(row.categoryId)}>
                    <span
                      className={styles.colorDot}
                      style={{ background: row.color }}
                    />
                    <span>{row.category}</span>
                    <strong>{money(row.netMinor)}</strong>
                    <ArrowUpRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
            {categories.length > 5 && (
              <details className={styles.dataDisclosure}>
                <summary>{categories.length - 5} more categories</summary>
                <ul className={styles.categoryList}>
                  {categories.slice(5).map((row) => (
                    <li key={row.categoryId ?? "none"}>
                      <Link href={categoryHref(row.categoryId)}>
                        <span>{row.category}</span>
                        <strong>{money(row.netMinor)}</strong>
                        <ArrowUpRight size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <div className={styles.chartEmpty}>
            <span>A little clarity starts here</span>
            <p>
              Categories appear as you record spending. Uncategorized purchases
              are included too.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
