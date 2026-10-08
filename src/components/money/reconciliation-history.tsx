import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import type {
  ReconciliationItem,
  ReconciliationSetup,
} from "@/modules/finance/domain/reconciliation";
import { formatMoneyMinorUnits } from "@/shared/money-display";
const labels = {
  verified: "Matched",
  difference: "Difference recorded",
  needs_review: "Needs review",
  superseded: "Superseded",
};
export function ReconciliationHistory({
  setup,
  onCompare,
  onAdjust,
}: {
  setup: ReconciliationSetup;
  onCompare?: (item: ReconciliationItem) => void;
  onAdjust?: (item: ReconciliationItem) => void;
}) {
  const money = (s: string) => formatMoneyMinorUnits(setup.account.currency, s);
  return (
    <div className="space-y-6">
      <Panel
        title="Comparison history"
        description="Original observations remain unchanged. Later cutoff activity flags affected comparisons for review."
      >
        {setup.history.length === 0 ? (
          <p>No comparisons recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {setup.history.map((r) => (
              <li
                key={r.reconciliationId}
                id={`comparison-${r.reconciliationId}`}
                className="rounded-control border border-border p-4"
              >
                <h3 className="font-semibold">
                  {r.cutoffDate} · {labels[r.status]}
                </h3>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt>Observed/provider balance</dt>
                    <dd className="numeric-value">{money(r.observedMinor)}</dd>
                  </div>
                  <div>
                    <dt>Tracked balance at comparison</dt>
                    <dd className="numeric-value">
                      {money(r.calculatedMinor)}
                    </dd>
                  </div>
                  <div>
                    <dt>Original difference</dt>
                    <dd className="numeric-value">
                      {money(r.differenceMinor)}
                    </dd>
                  </div>
                </dl>
                {r.needsReview ? (
                  <p className="mt-3 text-sm text-warning">
                    Financial sources at this cutoff changed. Current tracked
                    balance: {money(r.currentCalculatedMinor)}. Compare again
                    before treating this observation as verified.
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  Recorded {r.recordedAt}. Financial version{" "}
                  {r.financialRevision}; cutoff source version{" "}
                  {r.sourceJournalCount}.
                </p>
                {r.reference ? (
                  <p className="mt-2 text-sm">
                    Statement/provider reference: {r.reference}
                  </p>
                ) : null}
                {r.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    Notes: {r.notes}
                  </p>
                ) : null}
                {r.supersedesReconciliationId ? (
                  <p className="mt-2 text-sm">
                    Supersedes comparison{" "}
                    <a
                      className="text-link underline"
                      href={`#comparison-${r.supersedesReconciliationId}`}
                    >
                      {r.supersedesReconciliationId}
                    </a>
                    .
                  </p>
                ) : null}
                {r.supersededByReconciliationId ? (
                  <p className="mt-2 text-sm">
                    Replaced by a newer comparison. Original evidence is
                    retained.
                  </p>
                ) : null}
                {r.adjustments.map((a) => (
                  <p className="mt-2 text-sm" key={a.actionId}>
                    Linked adjustment {money(a.signedAdjustmentMinor)} on{" "}
                    {a.effectiveDate}: {a.reason}
                  </p>
                ))}
                {!r.supersededByReconciliationId && onCompare ? (
                  <button
                    type="button"
                    className="mt-3 min-h-11 text-link underline"
                    onClick={() => onCompare(r)}
                  >
                    Compare again for {r.cutoffDate}
                  </button>
                ) : null}
                {onAdjust &&
                !setup.account.archived &&
                !r.needsReview &&
                !r.supersededByReconciliationId &&
                r.differenceMinor !== "0" ? (
                  <button
                    type="button"
                    className="ml-4 mt-3 min-h-11 text-link underline"
                    onClick={() => onAdjust(r)}
                  >
                    Review explicit adjustment for {r.cutoffDate}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <Link
          href={`/money/accounts/${setup.account.financialAccountId}/history`}
          className="mt-4 inline-flex min-h-11 items-center text-link underline"
        >
          Investigate account activity
        </Link>
      </Panel>
      <Panel
        title="Balance adjustment history"
        description="Disclosed cash/equity corrections are separate from income and spending."
      >
        {setup.adjustments.length === 0 ? (
          <p>No balance adjustments recorded.</p>
        ) : (
          <ol className="space-y-3">
            {setup.adjustments.map((a) => (
              <li
                key={a.actionRevisionId}
                className="rounded-control border border-border p-4"
              >
                <p className="font-semibold">
                  {a.effectiveDate}: {money(a.signedAdjustmentMinor)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  Reason: {a.reason}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {a.reconciliationId
                    ? "Linked to a recorded comparison"
                    : "Explicit standalone adjustment"}
                  . Action {a.actionId}.
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
