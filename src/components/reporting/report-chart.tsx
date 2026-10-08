"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoneyMinorUnits } from "@/shared/money-display";
export function CategoryChart({
  rows,
  currency,
}: {
  rows: { category: string; netMinor: string }[];
  currency: string;
}) {
  const data = rows.map((r) => ({ ...r, value: Number(r.netMinor) / 100 }));
  return (
    <div
      className="min-w-0"
      style={{ height: Math.max(180, rows.length * 40) }}
      aria-label={`Net recognized spending by category in ${currency}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          accessibilityLayer
          margin={{ right: 16, left: 8 }}
        >
          <XAxis type="number" />
          <YAxis
            type="category"
            dataKey="category"
            width={130}
            tick={{ fontSize: 11 }}
          />
          <ReferenceLine x={0} stroke="var(--color-foreground)" />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0]?.payload ? (
                <div className="rounded-control border border-border bg-background p-3 text-sm">
                  {payload[0].payload.category}:{" "}
                  {formatMoneyMinorUnits(currency, payload[0].payload.netMinor)}
                </div>
              ) : null
            }
          />
          <Bar
            dataKey="value"
            name="Net recognized spending"
            fill="var(--color-link)"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export default function ReportChart({
  rows,
  currency,
}: {
  rows: {
    date: string;
    incomeMinor: string;
    netMinor: string;
    cashOutMinor: string;
  }[];
  currency: string;
}) {
  // Approximate chart coordinates only. Exact source strings remain in the
  // tooltip and the adjacent server-rendered table; no business totals here.
  const data = rows.map((r) => ({
    ...r,
    income: Number(r.incomeMinor) / 100,
    net: Number(r.netMinor) / 100,
    cashOut: Number(r.cashOutMinor) / 100,
  }));
  return (
    <div
      className="h-72 w-full min-w-0"
      aria-label={`Daily recognized income, net spending and external cash outflows in ${currency}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          accessibilityLayer
          margin={{ left: 12, right: 12, bottom: 16 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={45} />
          <YAxis tick={{ fontSize: 11 }} width={75} />
          <ReferenceLine y={0} stroke="var(--color-foreground)" />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.[0]?.payload ? (
                <div className="rounded-control border border-border bg-background p-3 text-sm">
                  <p>{String(label)}</p>
                  <p>
                    Income:{" "}
                    {formatMoneyMinorUnits(
                      currency,
                      payload[0].payload.incomeMinor,
                    )}
                  </p>
                  <p>
                    Net spending:{" "}
                    {formatMoneyMinorUnits(
                      currency,
                      payload[0].payload.netMinor,
                    )}
                  </p>
                  <p>
                    External cash outflow:{" "}
                    {formatMoneyMinorUnits(
                      currency,
                      payload[0].payload.cashOutMinor,
                    )}
                  </p>
                </div>
              ) : null
            }
          />
          <Legend />
          <Bar
            name="Recognized income"
            dataKey="income"
            fill="var(--color-link)"
            isAnimationActive={false}
          />
          <Bar
            name="Net recognized spending"
            dataKey="net"
            fill="var(--color-warning)"
            isAnimationActive={false}
          />
          <Bar
            name="External cash outflows"
            dataKey="cashOut"
            fill="var(--color-muted-foreground)"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
