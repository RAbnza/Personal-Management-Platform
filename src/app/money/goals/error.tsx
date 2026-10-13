"use client";
import { Button } from "@/components/ui/button";
export default function SavingsGoalError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Savings goals unavailable</h1>
      <p role="alert">
        Your private savings goal comparison could not be loaded.
      </p>
      <Button onClick={reset}>Retry savings goals</Button>
    </div>
  );
}
