"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type SaveState = "idle" | "saving" | "unconfirmed" | "saved";

type PendingReviewCommand = {
  clientCommandId: string;
};

async function patchAgendaReview(
  command: PendingReviewCommand,
): Promise<Response> {
  return fetch("/api/v1/onboarding/steps/review-agenda", {
    method: "PATCH",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      clientCommandId: command.clientCommandId,

      state: "completed",
    }),

    cache: "no-store",
  });
}

export function AgendaReviewButton() {
  const router = useRouter();

  const [pendingCommand, setPendingCommand] =
    useState<PendingReviewCommand | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [saveError, setSaveError] = useState<string | null>(null);

  async function executeCommand(command: PendingReviewCommand): Promise<void> {
    setSaveState("saving");
    setSaveError(null);

    try {
      const response = await patchAgendaReview(command);

      if (response.ok) {
        setPendingCommand(null);

        setSaveState("saved");

        router.refresh();

        return;
      }

      if (response.status >= 500) {
        setSaveState("unconfirmed");

        setSaveError(
          "We couldn't confirm whether your Agenda review was saved. Retry the same confirmation.",
        );

        return;
      }

      setPendingCommand(null);

      setSaveState("idle");

      setSaveError("The Agenda review could not be saved.");
    } catch {
      setSaveState("unconfirmed");

      setSaveError(
        "We couldn't confirm whether your Agenda review was saved. Retry the same confirmation.",
      );
    }
  }

  async function markReviewed(): Promise<void> {
    const command: PendingReviewCommand = {
      clientCommandId: crypto.randomUUID(),
    };

    setPendingCommand(command);

    await executeCommand(command);
  }

  async function retrySameConfirmation(): Promise<void> {
    if (!pendingCommand) {
      setSaveState("idle");

      setSaveError(
        "The previous confirmation can no longer be retried safely. Reload Calendar before continuing.",
      );

      return;
    }

    await executeCommand(pendingCommand);
  }

  return (
    <div>
      <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
        Review how Career activities and personal events appear here from their
        original source records. Confirm only after you understand that Agenda
        is a projection rather than another editable copy.
      </p>

      {saveState === "unconfirmed" ? (
        <div
          role="alert"
          className="mt-4 rounded-control border border-warning bg-warning-surface px-4 py-3 text-sm leading-6 text-warning"
        >
          <div className="flex gap-2">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.9}
            />

            <div>
              <p className="font-medium">Confirmation outcome unconfirmed</p>

              <p className="mt-1">{saveError}</p>
            </div>
          </div>
        </div>
      ) : saveError ? (
        <p
          role="alert"
          className="mt-4 rounded-control border border-danger bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
        >
          {saveError}
        </p>
      ) : null}

      {saveState === "saved" ? (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 text-sm font-medium text-success"
        >
          <CheckCircle2
            aria-hidden="true"
            className="size-4"
            strokeWidth={1.9}
          />
          Agenda review saved.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {saveState === "unconfirmed" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void retrySameConfirmation();
            }}
          >
            Retry same confirmation
          </Button>
        ) : null}

        <Button
          type="button"
          loading={saveState === "saving"}
          loadingLabel="Saving review…"
          disabled={saveState === "unconfirmed" || saveState === "saved"}
          onClick={() => {
            void markReviewed();
          }}
        >
          I&apos;ve reviewed my Agenda
        </Button>
      </div>
    </div>
  );
}
