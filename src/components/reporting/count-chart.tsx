"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CountChart({
  rows,
  label,
}: {
  rows: { label: string; count: number }[];
  label: string;
}) {
  const [sort, setSort] = useState(false);
  const data = sort ? [...rows].sort((a, b) => b.count - a.count) : rows;
  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        aria-pressed={sort}
        onClick={() => setSort(!sort)}
        className="action-link"
      >
        Largest first
      </button>
      <div
        role="group"
        aria-label={label}
        className="min-w-0"
        style={{ height: Math.max(240, rows.length * 42) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            accessibilityLayer
            margin={{ right: 24 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={125}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-control border border-border bg-background p-3 text-sm">
                    {payload[0].payload.label}: {payload[0].payload.count}
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="count"
              name="Count"
              fill="var(--color-primary)"
              radius={[0, 5, 5, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
