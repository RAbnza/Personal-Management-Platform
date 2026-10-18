"use client";
import { ScreenHeader } from "@/components/patterns/work-area";

import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function DebtError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 rounded-card border border-border p-6">
      <ScreenHeader
        scope="Money"
        title="Debt records temporarily unavailable"
      />
      <p>
        The read could not be completed. Retry to load your current records.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button onClick={reset}>Retry debt read</Button>
        <Link className="action-link" href="/money/debts">
          Back to debts
        </Link>
      </div>
    </section>
  );
}
