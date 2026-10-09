"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  setOnboardingStepStateResultSchema,
  type OnboardingStepKey,
  type OnboardingStepState,
} from "@/modules/core/domain/onboarding";

export function OnboardingStepControls({
  stepKey,
  state,
  title,
}: {
  stepKey: OnboardingStepKey;
  state: OnboardingStepState;
  title: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<
    "editing" | "saving" | "unconfirmed" | "saved"
  >("editing");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{
    clientCommandId: string;
    state: "pending" | "skipped";
  } | null>(null);
  const busy = useRef(false);
  if (state === "completed") return null;

  async function save() {
    if (busy.current || stage === "saved") return;
    busy.current = true;
    pending.current ??= {
      clientCommandId: crypto.randomUUID(),
      state: state === "skipped" ? "pending" : "skipped",
    };
    const command = pending.current;
    setStage("saving");
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/v1/onboarding/steps/${stepKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: controller.signal,
      });
      if (response.status >= 400 && response.status < 500) {
        if (stage !== "unconfirmed") pending.current = null;
        setStage(stage === "unconfirmed" ? "unconfirmed" : "editing");
        setError(
          "Progress could not be changed. Reload current access before trying again.",
        );
        return;
      }
      if (!response.ok) throw new Error("Unconfirmed progress");
      const result = setOnboardingStepStateResultSchema.parse(
        await response.json(),
      );
      if (result.stepKey !== stepKey || result.state !== command.state)
        throw new Error("Unconfirmed progress");
      setStage("saved");
      router.refresh();
    } catch {
      setStage("unconfirmed");
      setError(
        "We could not confirm the progress change. Retry the same change to resolve it safely.",
      );
    } finally {
      clearTimeout(timeout);
      busy.current = false;
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={stage === "saving" || stage === "saved"}
        onClick={() => void save()}
        aria-label={
          stage === "unconfirmed"
            ? `Retry progress change: ${title}`
            : `${state === "skipped" ? "Resume" : "Skip for now"}: ${title}`
        }
      >
        {stage === "saving"
          ? "Saving progress..."
          : stage === "unconfirmed"
            ? "Retry identical progress change"
            : state === "skipped"
              ? "Resume step"
              : "Skip for now"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {stage === "saved" && (
        <p role="status" className="text-sm">
          Progress saved. No business records were created.
        </p>
      )}
    </div>
  );
}
