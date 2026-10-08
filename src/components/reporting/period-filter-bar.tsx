"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PeriodFilterBar({
  path,
  period = "month",
  anchorDate = "",
  startDate = "",
  endDate = "",
  asOfDate,
}: {
  path: string;
  period?: string;
  anchorDate?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
}) {
  const [kind, setKind] = useState(period),
    [pending, startTransition] = useTransition(),
    router = useRouter();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget))
      if (typeof v === "string" && v) params.set(k, v);
    startTransition(() => router.push(`${path}?${params}`));
  }
  return (
    <form
      action={path}
      onSubmit={submit}
      aria-label="Report period filters"
      className="space-y-3"
    >
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm font-medium">
          Reporting period
          <select
            name="period"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="min-h-11 w-full rounded-control border border-input bg-background px-3"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Yearly</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {kind === "custom" ? (
          <>
            <label className="text-sm font-medium">
              Start date
              <Input
                type="date"
                name="startDate"
                defaultValue={startDate}
                required
              />
            </label>
            <label className="text-sm font-medium">
              End date
              <Input
                type="date"
                name="endDate"
                defaultValue={endDate}
                required
              />
            </label>
          </>
        ) : (
          <label className="text-sm font-medium">
            Date in period
            <Input
              type="date"
              name="anchorDate"
              defaultValue={anchorDate}
              required
            />
          </label>
        )}
        {asOfDate !== undefined && (
          <label className="text-sm font-medium">
            Career as-of date
            <Input
              type="date"
              name="asOfDate"
              defaultValue={asOfDate}
              required
            />
          </label>
        )}
        <Button type="submit" loading={pending} loadingLabel="Updating report…">
          Apply period
        </Button>
      </fieldset>
      <p role="status" className="text-sm text-muted-foreground">
        {pending
          ? "Reading a fresh report snapshot…"
          : "Inclusive dates; configurable workspace week start and calendar quarters. All owned records are included, including archived records."}
      </p>
    </form>
  );
}
