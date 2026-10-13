"use client";
import { Button } from "@/components/ui/button";
export default function RecurringError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Recurring plans unavailable</h1>
      <p>Your private evidence could not be loaded safely.</p>
      <Button onClick={reset}>Retry loading plans</Button>
    </section>
  );
}
