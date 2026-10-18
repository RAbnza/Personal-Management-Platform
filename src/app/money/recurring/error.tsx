"use client";
import { ScreenHeader } from "@/components/patterns/work-area";

import { Button } from "@/components/ui/button";
export default function RecurringError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 p-6">
      <ScreenHeader scope="Money" title="Recurring plans unavailable" />
      <p>Your private evidence could not be loaded safely.</p>
      <Button onClick={reset}>Retry loading plans</Button>
    </section>
  );
}
