"use client";
import { Button } from "@/components/ui/button";
export default function SharingError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Shared records are unavailable</h1>
      <p role="alert">
        This record may be unavailable to your membership, or the request could
        not be completed.
      </p>
      <Button onClick={reset}>Retry page</Button>
    </section>
  );
}
