"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function CsvExportControl({ dates }: { dates: string }) {
  const [kind, setKind] = useState("report"),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState("");
  async function download() {
    setPending(true);
    setError(null);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/exports/${kind}.csv?${dates}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const p = await response.json().catch(() => null);
        throw new Error(
          p?.message ?? "CSV could not be prepared. Retry shortly.",
        );
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv"))
        throw new Error("CSV response unavailable. Retry shortly.");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "report.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "CSV prepared and download started. Your browser controls download completion.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "CSV could not be prepared. Retry shortly.",
      );
    } finally {
      setPending(false);
    }
  }
  const meanings: Record<string, string> = {
    report:
      "Financial and Career aggregate definitions and exact values for this period.",
    transactions:
      "All posted financial contributions in the effective-date period, including original, reversal and replacement legs.",
    "debt-schedules":
      "All finalized schedule-version entries with due dates in this period. Historical versions are evidence; do not add them together.",
    "debt-payments":
      "Payment revision history dated in this period, with accounting components, direct contractual allocations and historical mapping in separate JSON columns.",
    applications:
      "Submitted-date application cohort, immutable stage observations through the as-of date, and all current-known event audit versions for those attempts.",
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        CSV contents
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setError(null);
            setMessage("");
          }}
          disabled={pending}
          className="mt-2 min-h-11 w-full rounded-control border border-input bg-background px-3"
        >
          <option value="report">Report aggregates</option>
          <option value="transactions">Transactions / postings</option>
          <option value="debt-schedules">Debt schedules</option>
          <option value="debt-payments">Debt payments</option>
          <option value="applications">Application history</option>
        </select>
      </label>
      <p className="text-sm">{meanings[kind]}</p>
      <p className="text-sm text-muted-foreground">
        Owner-scoped CSV with schema, date semantics, exact centavos/decimal
        amounts and coverage. This is not a complete workspace backup. Limit:
        10,000 rows / 10 MiB. History covers 30 days; expired metadata is pruned
        on your next export. Files are streamed without server storage.
      </p>
      <Button
        onClick={download}
        disabled={pending}
        loading={pending}
        loadingLabel="Preparing CSV…"
      >
        Download CSV
      </Button>
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">
        {pending ? "Preparing a consistent export snapshot…" : message}
      </p>
    </div>
  );
}
