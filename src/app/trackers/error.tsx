"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-3 p-6">
      <p role="alert">
        Private tracker data could not be loaded. Your saved records have not
        been changed.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
