"use client";
import { Button } from "@/components/ui/button";
export default function ForecastError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Forecasts unavailable</h1>
      <p role="alert">Your private cash forecast could not be loaded.</p>
      <Button onClick={reset}>Retry forecasts</Button>
    </div>
  );
}
