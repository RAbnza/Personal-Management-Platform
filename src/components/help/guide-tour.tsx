"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
const steps = [
  [
    "Start with what you know",
    "Choose useful modules. Opening balances establish a baseline; unknown financial coverage stays unknown. Setup can be skipped and resumed.",
  ],
  [
    "Record actual activity",
    "Income, spending and transfers have distinct meanings. Principal repayment is not spending. Review exact fees and allocations before recording a real payment.",
  ],
  [
    "Review what needs attention",
    "Dashboard and mixed Agenda use source records. Due dates are edited at their source. Dismissing or snoozing a reminder never pays a debt or completes an interview.",
  ],
  [
    "Inspect the evidence",
    "Reports share date periods and offer supporting-record drilldowns. CSV exports identify their coverage and are not a complete backup.",
  ],
  [
    "Keep control of access and data",
    "Settings separates module visibility, Agenda visibility and reminders. Hiding retains records; archive keeps history. Whole-account deletion requires its own scope review and password confirmation.",
  ],
];
export function GuideTour() {
  const [step, setStep] = useState<number | null>(null);
  return (
    <Panel
      title="Replayable workspace tour"
      description="Instructional examples only. This tour cannot submit accounts, payments, applications or Calendar records."
    >
      {step === null ? (
        <Button onClick={() => setStep(0)}>Start tour</Button>
      ) : (
        <div>
          <p role="status" className="text-sm text-muted-foreground">
            Step {step + 1} of {steps.length}
          </p>
          <h3 className="mt-3 font-semibold">{steps[step]![0]}</h3>
          <p className="mt-2">{steps[step]![1]}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Previous
            </Button>
            <Button
              onClick={() =>
                setStep(step === steps.length - 1 ? null : step + 1)
              }
            >
              {step === steps.length - 1 ? "Finish tour" : "Next"}
            </Button>
            <Button variant="secondary" onClick={() => setStep(null)}>
              Close tour
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
