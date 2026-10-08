"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function DashboardFilters({
  period = "month",
  startDate = "",
  endDate = "",
  source = "all",
}: {
  period?: string;
  startDate?: string;
  endDate?: string;
  source?: string;
}) {
  const [kind, setKind] = useState(period),
    [pending, startTransition] = useTransition();
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      params = new URLSearchParams();
    for (const [key, value] of data)
      if (typeof value === "string" && value) params.set(key, value);
    startTransition(() => router.push(`/?${params}`));
  }
  const select =
    "min-h-11 w-full rounded-control border border-input bg-background px-3 text-foreground";
  return (
    <form
      action="/"
      onSubmit={submit}
      aria-label="Dashboard filters"
      className="space-y-3"
    >
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-sm font-medium">
          Expense period
          <select
            className={select}
            name="period"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="year">This year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {kind === "custom" && (
          <>
            <label className="text-sm font-medium">
              Start date
              <Input
                type="date"
                name="startDate"
                required
                defaultValue={startDate}
              />
            </label>
            <label className="text-sm font-medium">
              End date
              <Input
                type="date"
                name="endDate"
                required
                defaultValue={endDate}
              />
            </label>
          </>
        )}
        <label className="min-w-40 flex-1 text-sm font-medium">
          Agenda sources
          <select className={select} name="source" defaultValue={source}>
            <option value="all">All sources</option>
            <option value="money">Money</option>
            <option value="career">Career</option>
            <option value="time">Calendar</option>
          </select>
        </label>
        <Button
          type="submit"
          loading={pending}
          loadingLabel="Updating dashboard…"
        >
          Apply filters
        </Button>
      </fieldset>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {pending
          ? "Updating dashboard…"
          : "Expense filters change the selected period. Balances are current; commitments show today through the next 14 days."}
      </p>
    </form>
  );
}
