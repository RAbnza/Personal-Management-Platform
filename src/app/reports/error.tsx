"use client";
import { Button } from "@/components/ui/button";
export default function ReportsError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Report unavailable</h2>
      <p role="alert">
        Report sources could not be loaded. Retry to read a fresh snapshot.
      </p>
      <Button onClick={reset}>Retry Reports</Button>
    </div>
  );
}
