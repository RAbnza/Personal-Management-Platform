"use client";
import type { EffectPreview } from "@/modules/finance/services/adopt-group-effect";
import type { PrivateSharingSetup } from "@/modules/finance/services/private-sharing-setup";
import { Input } from "@/components/ui/input";
import { CommandForm, Field, selectClass } from "./forms";
import { money } from "./bill-form";
import { RetainPrivateEvidence } from "./retain-private-evidence";
export function EffectAdoption({
  preview: p,
  setup,
}: {
  preview: EffectPreview;
  setup: PrivateSharingSetup;
}) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        Review your private {p.sourceKind}
      </h1>
      <p>
        This approval changes only your private workspace. Group confirmation
        never selects an account or posts for another member.
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <dt>Group source state</dt>
        <dd>{p.state}</dd>
        <dt>Actual cash/card movement</dt>
        <dd>{money(p.cashMinor)}</dd>
        <dt>Spending refund</dt>
        <dd>{money(p.spendingMinor)}</dd>
        <dt>Recognized group position change</dt>
        <dd>{money(p.groupMinor)}</dd>
        <dt>Unresolved clearing</dt>
        <dd>{money(p.clearingMinor)}</dd>
      </dl>
      {!p.canResolve && (
        <p>
          Actual funds remain in private clearing until recipient confirmation
          and current private adoption of all related bills. Cancellation or
          reversal preserves actual funds in clearing; it does not claim a
          physical return.
        </p>
      )}
      {p.link && (
        <p>
          <a
            className="text-link underline"
            href={`/money/actions/${p.link.actionId}`}
          >
            Retained private financial evidence
          </a>{" "}
          ·{" "}
          {p.review
            ? "Reviewed difference; prior private evidence retained"
            : p.needsReview
              ? "Needs your review"
              : "Current accepted source"}
          . A new revision retains the original actual funding movement.
        </p>
      )}
      {p.retainedAmounts && (
        <p>
          This private action currently recognizes cash/card movement{" "}
          {money(p.retainedAmounts.fundingMinor)}, spending{" "}
          {money(p.retainedAmounts.spendingMinor)}, signed group position{" "}
          {money(p.retainedAmounts.groupMinor)} and clearing{" "}
          {money(p.retainedAmounts.clearingMinor)}.
        </p>
      )}
      {(!p.link || p.needsReview) && (
        <CommandForm
          url="/api/v1/sharing/effects"
          label={
            p.link ? "Approve clearing review" : "Approve private movement"
          }
          build={(f) => {
            const choice = String(f.get("funding") ?? "none"),
              [kind, selectedId] = choice.split(":");
            const funding = p.link
              ? { kind: "keep" }
              : kind === "cash"
                ? { kind, accountId: selectedId }
                : kind === "card"
                  ? {
                      kind,
                      cardId: selectedId,
                      postingDate: f.get("postingDate") || p.effectiveDate,
                    }
                  : kind === "existing"
                    ? {
                        kind,
                        actionId: selectedId,
                        expectedActionRevisionId: p.existingMovements.find(
                          (m) => m.id === selectedId,
                        )!.revisionId,
                      }
                    : { kind: "none" };
            return {
              groupId: p.groupId,
              sourceKind: p.sourceKind,
              sourceId: p.sourceId,
              clientCommandId: crypto.randomUUID(),
              expectedSourceHash: p.sourceHash,
              expectedFinancialRevision: p.financialRevision,
              approved: true,
              funding,
              categoryId: f.get("categoryId") || null,
              acknowledgeNegativeBalance: f.get("negative") === "on",
            };
          }}
        >
          {!p.link && BigInt(p.cashMinor) !== 0n && (
            <>
              <Field label="Actual private funding or existing movement">
                <select name="funding" className={selectClass} required>
                  <option value="">Choose actual movement</option>
                  <optgroup label="Record new cash movement">
                    {setup.accounts.map((a) => (
                      <option key={a.id} value={`cash:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  {p.sourceKind === "refund" && (
                    <optgroup label="Record new card refund">
                      {setup.cards.map((c) => (
                        <option key={c.id} value={`card:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Reclassify an existing movement without repeating funding">
                    {p.existingMovements.map((m) => (
                      <option key={m.id} value={`existing:${m.id}`}>
                        {m.description}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              {p.sourceKind === "refund" && (
                <Field label="Card posting date (for a card refund)">
                  <Input
                    name="postingDate"
                    type="date"
                    defaultValue={p.effectiveDate}
                  />
                </Field>
              )}
            </>
          )}
          {p.sourceKind === "refund" && (
            <Field label="Private refund category">
              <select name="categoryId" className={selectClass}>
                <option value="">Uncategorized</option>
                {setup.categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" required />I approve these exact amounts and
            confirm the actual funds shown. Confirmation reclassification
            retains funding already recorded.
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="negative" />I acknowledge a negative
            private cash balance if this new outgoing movement causes one.
          </label>
        </CommandForm>
      )}
      {p.link && p.needsReview && (
        <RetainPrivateEvidence
          groupId={p.groupId}
          linkId={p.link.id}
          linkRevisionId={p.link.revisionId}
          sourceHash={p.sourceHash}
          financialRevision={p.financialRevision}
          review={p.review}
        />
      )}
    </section>
  );
}
