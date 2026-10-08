"use client";
import { Button } from "@/components/ui/button";
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Dashboard could not be loaded</h1>
      <p>Private source records are temporarily unavailable.</p>
      <Button onClick={reset}>Retry Dashboard</Button>
    </div>
  );
}
