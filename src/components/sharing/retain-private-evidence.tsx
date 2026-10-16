"use client";
import type { RetainedSourceReview } from "@/modules/finance/services/review-group-source";
import { Input } from "@/components/ui/input";
import { CommandForm, Field } from "./forms";
export function RetainPrivateEvidence({
  groupId,
  linkId,
  linkRevisionId,
  sourceHash,
  financialRevision,
  review,
}: {
  groupId: string;
  linkId: string;
  linkRevisionId: string;
  sourceHash: string;
  financialRevision: string;
  review: RetainedSourceReview | null;
}) {
  if (review)
    return (
      <p>
        Reviewed difference: you retained your prior private evidence on{" "}
        {review.reviewedAt}. Reason: {review.reason}. Shared and private amounts
        remain distinct.
      </p>
    );
  return (
    <details>
      <summary className="min-h-11 cursor-pointer">
        Review and retain prior private evidence
      </summary>
      <p>
        If you disagree with the changed group source, record your reason and
        retain the financial amounts you previously accepted. This records a
        reviewed difference; it posts no money and does not mark the sources as
        synchronized. A later source change needs another review.
      </p>
      <CommandForm
        url="/api/v1/sharing/reviews"
        label="Record reviewed private difference"
        build={(f) => ({
          groupId,
          linkId,
          expectedLinkRevisionId: linkRevisionId,
          expectedSourceHash: sourceHash,
          expectedFinancialRevision: financialRevision,
          clientCommandId: crypto.randomUUID(),
          approved: true,
          reason: f.get("reason"),
        })}
      >
        <Field label="Reason for retaining private evidence">
          <Input name="reason" maxLength={2000} required />
        </Field>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" required />I reviewed this exact current source
          and choose to keep my prior private amounts.
        </label>
      </CommandForm>
    </details>
  );
}
