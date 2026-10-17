"use client";
import { ScreenHeader } from "@/components/patterns/work-area";

import { Button } from "@/components/ui/button";
export default function SavingsGoalError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <ScreenHeader scope="Money" title="Savings goals unavailable" />
      <p role="alert">
        Your private savings goal comparison could not be loaded.
      </p>
      <Button onClick={reset}>Retry savings goals</Button>
    </div>
  );
}
