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
  career,
}: {
  path: string;
  period?: string;
  anchorDate?: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  career?:
    | {
        sources: (string | null)[];
        interval: string;
        sourceName?: string | undefined;
        sourceMissing?: "true" | undefined;
        compare?: "previous" | undefined;
      }
    | undefined;
}) {
  const [kind, setKind] = useState(period),
    [pending, startTransition] = useTransition(),
    router = useRouter();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget))
      if (typeof v === "string" && v) params.set(k, v);
    const source = params.get("careerSource");
    params.delete("careerSource");
    if (source === "null") params.set("sourceMissing", "true");
    else if (source) params.set("sourceName", JSON.parse(source));
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
        {career && (
          <>
            <label className="min-w-40 flex-1 text-sm font-medium">
              Cohort grouping
              <select
                name="cohortInterval"
                defaultValue={career.interval}
                className="min-h-11 w-full rounded-control border border-input bg-background px-3"
              >
                <option value="week">Weekly cohorts</option>
                <option value="month">Monthly cohorts</option>
                <option value="quarter">Quarterly cohorts</option>
                <option value="year">Yearly cohorts</option>
              </select>
            </label>
            <label className="min-w-40 flex-1 text-sm font-medium">
              Application source
              <select
                name="careerSource"
                defaultValue={
                  career.sourceMissing
                    ? "null"
                    : career.sourceName !== undefined
                      ? JSON.stringify(career.sourceName)
                      : ""
                }
                className="min-h-11 w-full max-w-full rounded-control border border-input bg-background px-3"
              >
                <option value="">All sources</option>
                {career.sourceName !== undefined &&
                  !career.sources.includes(career.sourceName) && (
                    <option value={JSON.stringify(career.sourceName)}>
                      Requested source: {career.sourceName} (no matching cohort
                      evidence)
                    </option>
                  )}
                {career.sourceMissing && !career.sources.includes(null) && (
                  <option value="null">
                    Unspecified source (no matching cohort evidence)
                  </option>
                )}
                {career.sources.map((source) => (
                  <option
                    key={JSON.stringify(source)}
                    value={JSON.stringify(source)}
                  >
                    {source ?? "Unspecified source"}
                    {source === "Unspecified source" ? " (recorded label)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="compare"
                value="previous"
                defaultChecked={career.compare === "previous"}
              />
              Compare preceding equal-length cohort
            </label>
          </>
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
