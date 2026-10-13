"use client";
import { Button } from "@/components/ui/button";
export default function BudgetError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Budgets unavailable</h1>
      <p role="alert">Your private budget comparison could not be loaded.</p>
      <Button onClick={reset}>Retry budgets</Button>
    </div>
  );
}
