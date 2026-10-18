"use client";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast } from "@/modules/planning/services/get-forecast";
import { formatMoneyMinorUnits } from "@/shared/money-display";

export function ForecastChart({ data }: { data: Forecast }) {
  const [showBridge, setShowBridge] = useState(true);
  const money = (v: string) => formatMoneyMinorUnits(data.currency, v);
  const rows = data.daily
    .filter((d) => showBridge || !d.bridge)
    .map((d) => ({ ...d, value: Number(d.closingMinor) / 100 }));
  return (
    <section
      className="min-w-0 space-y-4 rounded-card border border-border bg-surface p-4 sm:p-6"
      aria-label="Cash projection chart"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Projected closing cash · {data.endDate}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tabular-nums">
            {money(data.totals.closingProjectedMinor)}
          </h2>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showBridge}
            onChange={(e) => setShowBridge(e.target.checked)}
          />
          Include bridge before selected window
        </label>
      </div>
      <p className="text-sm">
        Calculated {data.startDate} through {data.endDate}. Adjust controls
        below and calculate to update this projection.
      </p>
      <div
        className="h-72 min-w-0"
        role="group"
        aria-label="Daily projected closing cash"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            accessibilityLayer
            margin={{ right: 12, left: 8 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" minTickGap={45} tick={{ fontSize: 11 }} />
            <YAxis width={65} tick={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--color-warning)" />
            <ReferenceLine
              x={data.startDate}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
            />
            <Tooltip
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload;
                return active && d ? (
                  <div className="rounded-control border border-border bg-background p-3 text-sm">
                    <p>
                      {d.date}
                      {d.bridge ? " · bridge" : ""}
                    </p>
                    <p>Projected closing: {money(d.closingMinor)}</p>
                    <p>Movement: {money(d.movementMinor)}</p>
                  </div>
                ) : null;
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              name="Projected cash"
              stroke="var(--color-primary)"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Actual opening", data.totals.openingActualMinor],
          ["Recorded future net", data.totals.recordedFutureNetMinor],
          [
            "Expected net",
            (
              BigInt(data.totals.expectedInflowsMinor) -
              BigInt(data.totals.expectedOutflowsMinor)
            ).toString(),
          ],
          ["Hypothetical net", data.totals.assumptionNetMinor],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control bg-surface-subtle p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{money(value!)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-warning">
        {data.coverage.excludedSourceCount} sources excluded. Unknown amounts
        and unsupported obligations are not zero; this projection is not a
        guaranteed balance.
      </p>
    </section>
  );
}
