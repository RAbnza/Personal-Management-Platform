"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function DebtError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 rounded-card border border-border p-6">
      <h1 className="text-xl font-semibold">
        Debt records temporarily unavailable
      </h1>
      <p>
        The read could not be completed. Retry to load your current records.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button onClick={reset}>Retry debt read</Button>
        <Link
          className="inline-flex min-h-11 items-center text-link underline"
          href="/money/debts"
        >
          Back to debts
        </Link>
      </div>
    </section>
  );
}
