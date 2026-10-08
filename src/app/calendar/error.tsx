"use client";
import { Button } from "@/components/ui/button";
export default function CalendarError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">
        Calendar is temporarily unavailable
      </h1>
      <p className="max-w-[68ch] text-sm leading-6">
        Agenda and reminder state could not be loaded. If a reminder save was
        interrupted, retry its original command from the review before starting
        another change.
      </p>
      <Button onClick={reset}>Retry Calendar read</Button>
    </div>
  );
}
