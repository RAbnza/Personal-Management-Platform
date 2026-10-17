"use client";
import { ScreenHeader } from "@/components/patterns/work-area";

import { Button } from "@/components/ui/button";
export default function BudgetError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <ScreenHeader scope="Money" title="Budgets unavailable" />
      <p role="alert">Your private budget comparison could not be loaded.</p>
      <Button onClick={reset}>Retry budgets</Button>
    </div>
  );
}
