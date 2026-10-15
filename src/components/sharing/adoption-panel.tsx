"use client";
import type { AdoptionPreview } from "@/modules/finance/services/adopt-group-expense";
import type { PrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { CommandForm } from "./forms";
import { FundingFields, fundingInput, money } from "./bill-form";
export function AdoptionPanel({
  preview,
  setup,
}: {
  preview: AdoptionPreview;
  setup: PrivateSharingSetup;
}) {
  if (preview.link)
    return (
      <section className="space-y-3 rounded-card border border-border p-4">
        <h2 className="text-xl font-semibold">Your private adoption</h2>
        <p>
          {preview.needsPrivateCorrection
            ? "Needs private correction: group evidence changed after your approval. Your private ledger retains the amounts you accepted."
            : "This allocation is already adopted into your private ledger."}
        </p>
        <a
          className="text-link underline"
          href={`/money/actions/${preview.link.actionId}`}
        >
          Review your private financial evidence
        </a>
      </section>
    );
  return (
    <section className="space-y-4 rounded-card border border-border p-4">
      <h2 className="text-xl font-semibold">Adopt into your private ledger</h2>
      <p>
        This is your private approval. Other people&apos;s accounts and private
        adoption remain under their control.
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <dt>Actual funding</dt>
        <dd>{money(preview.paidMinor)}</dd>
        <dt>Your spending</dt>
        <dd>{money(preview.shareMinor)}</dd>
        <dt>Your group receivable</dt>
        <dd>{money(preview.receivableMinor)}</dd>
        <dt>Your group payable</dt>
        <dd>{money(preview.payableMinor)}</dd>
      </dl>
      <CommandForm
        url="/api/v1/sharing/adoption"
        label="Approve private adoption"
        build={(f) => ({
          clientCommandId: crypto.randomUUID(),
          groupId: preview.groupId,
          expenseId: preview.expenseId,
          expectedSourceRevisionId: preview.revisionId,
          expectedSourceHash: preview.sourceHash,
          expectedFinancialRevision: preview.financialRevision,
          approved: true,
          funding: fundingInput(f, setup, BigInt(preview.paidMinor) > 0n),
          categoryId: f.get("categoryId") || null,
          acknowledgeNegativeBalance: f.get("negative") === "on",
        })}
      >
        <FundingFields setup={setup} paid={BigInt(preview.paidMinor) > 0n} />
        <p>
          Use “Link an existing purchase” if you already recorded the funding.
          New funding creates a private purchase. Existing purchase conversion
          retains the original cash or card movement.
        </p>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" required />I approve the exact private
          accounting shown.
        </label>
      </CommandForm>
    </section>
  );
}
