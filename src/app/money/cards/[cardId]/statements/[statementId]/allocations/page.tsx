import { BreadcrumbRecords } from "@/components/shell/breadcrumbs";
import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CardAllocationForm } from "@/components/money/card-command-form";
import { getCardCommandSetup } from "@/modules/finance/services/read-card-command-setup";
import { getCardStatement } from "@/modules/finance/services/read-card-statements";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "../../_context";
export default async function AllocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string; statementId: string }>;
  searchParams: Promise<{
    offset?: string;
    allocationOffset?: string;
    revisionId?: string;
  }>;
}) {
  const scope = await statementContext(params),
    q = await searchParams,
    offset = statementOffset(q.offset),
    allocationOffset = statementOffset(q.allocationOffset);
  if (q.revisionId && !z.uuid().safeParse(q.revisionId).success) notFound();
  let setup, statement;
  try {
    [setup, statement] = await Promise.all([
      getCardCommandSetup({
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        cardId: scope.cardId,
        offset,
      }),
      getCardStatement({
        ...scope,
        statementId: scope.statementId!,
        revisionId: q.revisionId,
        allocationOffset,
      }),
    ]);
  } catch (e) {
    statementPageError(e);
    return (
      <p role="alert">
        Allocation evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const base = `/money/cards/${scope.cardId}/statements/${scope.statementId}`,
    money = (n: string) => formatMoneyMinorUnits(setup.card.currency, n),
    r = statement.reconciliation;
  return (
    <div className="space-y-6 break-words">
      <Link href={base} className="action-link">
        Statement {statement.snapshot.statementDate}
      </Link>
      <BreadcrumbRecords
        path={`/money/cards/${scope.cardId}/statements/${scope.statementId}/allocations`}
        labels={{
          [`/money/cards/${scope.cardId}`]: statement.card.name,
          [`/money/cards/${scope.cardId}/statements/${scope.statementId}`]: `Statement ${statement.snapshot.statementDate}`,
        }}
      />
      <ScreenHeader scope="Money" title="Statement allocations" />
      <p>
        Historical statement balance {money(statement.snapshot.balanceMinor)};
        remaining recorded due {money(r.recordedRemainingDueMinor)}. Confirmed
        allocations {money(r.effectiveAllocatedMinor)}. Superseded unresolved
        allocations {money(r.unresolvedAllocationMinor)}.
      </p>
      <p>
        Unapplied payments and refunds remain available evidence, without an
        assumed provider allocation order. Superseded statement/source revisions
        require fresh confirmation.
      </p>
      <CardAllocationForm setup={setup} statement={statement} />
      {setup.creditSources.hasMore && (
        <Link
          href={`?offset=${offset + 100}&allocationOffset=${allocationOffset}${q.revisionId ? `&revisionId=${q.revisionId}` : ""}`}
          className="action-link"
        >
          Older payment and credit choices
        </Link>
      )}
      {statement.allocations.hasMore && (
        <Link
          href={`?offset=${offset}&allocationOffset=${allocationOffset + 100}${q.revisionId ? `&revisionId=${q.revisionId}` : ""}`}
          className="action-link"
        >
          Older allocation evidence
        </Link>
      )}
    </div>
  );
}
