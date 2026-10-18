"use client";
import { useState } from "react";
import type { AdoptionPreview } from "@/modules/finance/services/adopt-group-expense";
import type { PrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { CommandForm } from "./forms";
import { FundingFields, fundingInput, money } from "./bill-form";
import { RetainPrivateEvidence } from "./retain-private-evidence";
export function AdoptionPanel({
  preview,
  setup,
}: {
  preview: AdoptionPreview;
  setup: PrivateSharingSetup;
}) {
  const [fundingApprovalKey, setFundingApprovalKey] = useState<string | null>(
    null,
  );
  const correctionKey = [
    preview.sourceHash,
    preview.link?.linkRevisionId,
    preview.financialRevision,
    preview.review?.id,
  ].join(":");
  const correctingFunding = fundingApprovalKey === correctionKey;
  if (preview.link)
    return (
      <section className="space-y-3 rounded-card border border-border p-4">
        <h2 className="text-xl font-semibold">Your private adoption</h2>
        {preview.retainedAmounts && (
          <p>
            This private action currently recognizes cash/card movement{" "}
            {money(preview.retainedAmounts.fundingMinor)}, spending{" "}
            {money(preview.retainedAmounts.spendingMinor)}, signed group
            position {money(preview.retainedAmounts.groupMinor)} and clearing{" "}
            {money(preview.retainedAmounts.clearingMinor)}.
          </p>
        )}
        <p>
          {preview.review
            ? "Reviewed group/private difference; your prior private evidence is retained."
            : preview.needsPrivateCorrection
              ? "Needs private correction: group evidence changed after your approval. Your private ledger retains the amounts you accepted."
              : "This allocation is already adopted into your private ledger."}
        </p>
        <a
          className="text-link underline"
          href={`/money/actions/${preview.link.actionId}`}
        >
          Review your private financial evidence
        </a>
        <a
          className="inline-flex min-h-11 items-center text-link underline"
          href="/settings/files"
        >
          Manage your private supporting files
        </a>
        {preview.needsPrivateCorrection && (
          <CommandForm
            url="/api/v1/sharing/adoption"
            label="Approve reviewed private correction"
            build={(f) => ({
              clientCommandId: crypto.randomUUID(),
              groupId: preview.groupId,
              expenseId: preview.expenseId,
              expectedSourceRevisionId: preview.revisionId,
              expectedSourceHash: preview.sourceHash,
              expectedFinancialRevision: preview.financialRevision,
              approved: true,
              funding:
                f.get("fundingCorrection") === "on"
                  ? fundingInput(
                      f,
                      { ...setup, purchases: [] },
                      BigInt(preview.paidMinor) > 0n,
                    )
                  : { kind: "keep" },
              categoryId: f.get("categoryId") || null,
              acknowledgeNegativeBalance: f.get("negative") === "on",
              acknowledgeFundingCorrection: f.get("fundingCorrection") === "on",
            })}
          >
            <p>
              Current source funding {money(preview.paidMinor)} · own spending{" "}
              {money(preview.shareMinor)} · receivable{" "}
              {money(preview.receivableMinor)} · payable{" "}
              {money(preview.payableMinor)}. This creates an immutable private
              correction. Funding remains unchanged unless you explicitly
              approve correcting the original actual funding evidence below.
              Effective date: {preview.expenseDate}.
            </p>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="fundingCorrection"
                checked={correctingFunding}
                onChange={(e) =>
                  setFundingApprovalKey(e.target.checked ? correctionKey : null)
                }
              />
              I approve correcting the original actual funding to the current
              contribution and selected source. This adjusts the retained
              payment evidence; it does not claim a new transfer or a merchant
              refund.
            </label>
            <FundingFields
              setup={{ ...setup, purchases: [] }}
              paid={BigInt(preview.paidMinor) > 0n}
              showFunding={correctingFunding}
            />
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" required />I approve this exact correction
              to my private ledger.
            </label>
          </CommandForm>
        )}
        {preview.needsPrivateCorrection && (
          <RetainPrivateEvidence
            groupId={preview.groupId}
            linkId={preview.link.id}
            linkRevisionId={preview.link.linkRevisionId}
            sourceHash={preview.sourceHash}
            financialRevision={preview.financialRevision}
            review={preview.review}
          />
        )}
      </section>
    );
  return (
    <section className="space-y-4 rounded-card border border-border bg-[var(--blue-surface)] p-5">
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
