import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import { getCardStatement } from "@/modules/finance/services/read-card-statements";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "../_context";
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string; statementId: string }>;
  searchParams: Promise<{ revisionId?: string; offset?: string }>;
}) {
  const scope = await statementContext(params),
    query = await searchParams,
    historyOffset = statementOffset(query.offset);
  if (query.revisionId && !z.uuid().safeParse(query.revisionId).success)
    notFound();
  let data;
  try {
    data = await getCardStatement({
      ...scope,
      statementId: scope.statementId!,
      revisionId: query.revisionId,
      historyOffset,
    });
  } catch (e) {
    statementPageError(e);
    return (
      <p role="alert">
        Statement evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const s = data.snapshot,
    r = data.reconciliation,
    base = `/money/cards/${scope.cardId}/statements`,
    money = (n: string) => formatMoneyMinorUnits(data.card.currency, n);
  return (
    <div className="space-y-6 break-words">
      <Link href={base} className="text-link underline">
        Statements for {data.card.name}
      </Link>
      <h1 className="text-2xl font-semibold">Statement {s.statementDate}</h1>
      <p>
        Revision {s.version} ·{" "}
        {data.isCurrent
          ? "Current verified evidence"
          : "Preserved historical evidence"}
      </p>
      <Panel
        title="Provider snapshot"
        description="Historical values remain immutable. Corrections create a new verified revision."
      >
        <dl className="space-y-2">
          <div>
            <dt>Billing cycle</dt>
            <dd>
              {s.cycleStart} to {s.cycleEnd}
            </dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{s.dueDate}</dd>
          </div>
          <div>
            <dt>Historical statement balance</dt>
            <dd>{money(s.balanceMinor)}</dd>
          </div>
          <div>
            <dt>Minimum due</dt>
            <dd>{money(s.minimumDueMinor)}</dd>
          </div>
          <div>
            <dt>Provider opening balance</dt>
            <dd>
              {s.openingBalanceMinor === null
                ? "Unknown"
                : money(s.openingBalanceMinor)}
            </dd>
          </div>
          <div>
            <dt>Provider reference</dt>
            <dd>{s.providerReference ?? "Not supplied"}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>
              {s.verificationSource} · {s.verifiedDate}
            </dd>
          </div>
          <div>
            <dt>Recorded at</dt>
            <dd>{s.createdAt}</dd>
          </div>
        </dl>
        {s.reason && <p className="mt-3">Correction reason: {s.reason}</p>}
      </Panel>
      <Panel
        title="Statement reconciliation"
        description="Provider evidence and recognized activity are compared without automatic financial adjustments."
      >
        <p>Recorded remaining due: {money(r.recordedRemainingDueMinor)}</p>
        <p>
          Effective recorded allocations: {money(r.effectiveAllocatedMinor)}.
          Unrecorded provider payments or credits are not assumed.
        </p>
        <p>
          Superseded unresolved allocations:{" "}
          {money(r.unresolvedAllocationMinor)}. Provider credit evidence:{" "}
          {money(r.providerCreditMinor)}. Excess allocated credit:{" "}
          {money(r.excessCreditMinor)}.
        </p>
        <Link
          href={`${base}/${s.statementId}/allocations${data.isCurrent ? "" : `?revisionId=${s.revisionId}`}`}
          className="inline-flex min-h-11 text-link underline"
        >
          Confirm allocations and review reversal history
        </Link>
        <p>Known provider lines: {money(r.knownProviderLinesMinor)}</p>
        <p>
          Unexplained provider difference:{" "}
          {r.unexplainedDifferenceMinor === null
            ? "Unknown until the provider opening balance and all line amounts are supplied"
            : money(r.unexplainedDifferenceMinor)}
        </p>
        <p>
          Linked card activity: {r.linkedCount} · Unlinked provider lines:{" "}
          {r.unlinkedProviderCount} · Incomplete provider lines:{" "}
          {r.incompleteProviderCount} · Linked activity corrected since
          association: {r.changedLinkedCount}
        </p>
        <p>
          Unlinked recognized card activity within the recorded cycle:{" "}
          {data.unlinkedRecognizedCount}
          {data.candidatesHaveMore
            ? " (showing matches from the first 100 cycle choices)"
            : ""}
          . Cycle dates suggest candidates only; membership requires provider
          confirmation.
        </p>
        <ul>
          {data.unlinkedRecognized.map((c) => (
            <li key={c.actionRevisionId}>
              <Link
                href={`/money/actions/${c.actionId}`}
                className="text-link underline"
              >
                {c.description}
              </Link>{" "}
              · {c.postingDate} · {money(c.amountMinor)}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title="Preserved provider lines"
        description="Links retain the exact recognized card activity revision and provider posting date."
      >
        <ol className="divide-y divide-border">
          {s.entries.map((e, i) => {
            const link = data.associations.find((a) => a.lineNo === i + 1);
            return (
              <li key={i} className="space-y-1 py-3">
                <p>
                  {i + 1}. {e.description}
                </p>
                <p>
                  Posted {e.postingDate ?? "Unknown"} · Amount{" "}
                  {e.amountMinor === null ? "Unknown" : money(e.amountMinor)}
                </p>
                {e.providerReference && <p>Reference: {e.providerReference}</p>}
                {link ? (
                  <>
                    <Link
                      href={`/money/actions/${link.actionId}`}
                      className="text-link underline"
                    >
                      Linked card activity
                    </Link>
                    <p>Preserved revision: {link.actionRevisionId}</p>
                    {link.changed && (
                      <p className="text-danger">
                        Recognized activity has changed. This statement link
                        remains preserved and unresolved until reviewed against
                        provider evidence.
                      </p>
                    )}
                  </>
                ) : (
                  <p>
                    Unresolved provider line · No recognized activity linked
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {!s.entries.length && (
          <p>No provider lines supplied. Reconciliation remains incomplete.</p>
        )}
      </Panel>
      {data.isCurrent && (
        <Link
          href={`${base}/${s.statementId}/revise`}
          className="inline-flex min-h-11 items-center text-link underline"
        >
          Correct statement evidence
        </Link>
      )}
      <Panel
        title="Revision history"
        description="Verification sources, timestamps and correction reasons are retained."
      >
        <ol className="space-y-3">
          {data.history.map((h) => (
            <li key={h.revisionId}>
              <Link
                href={`${base}/${s.statementId}?revisionId=${h.revisionId}`}
                className="text-link underline"
              >
                Revision {h.version}
              </Link>
              <p>
                {h.verificationSource} · Verified {h.verifiedDate} · Recorded{" "}
                {h.createdAt}
              </p>
              {h.reason && <p>Reason: {h.reason}</p>}
            </li>
          ))}
        </ol>
        {data.historyHasMore && (
          <Link
            href={`?offset=${historyOffset + 25}`}
            className="text-link underline"
          >
            Older revisions
          </Link>
        )}
      </Panel>
    </div>
  );
}
