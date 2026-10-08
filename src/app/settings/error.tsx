"use client";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="p-6">
      <h1 className="text-xl font-semibold">Settings unavailable</h1>
      <p role="alert" className="my-4">
        Current settings could not be loaded. No changes were confirmed.
      </p>
      <Button onClick={reset}>Retry settings</Button>
    </section>
  );
}
