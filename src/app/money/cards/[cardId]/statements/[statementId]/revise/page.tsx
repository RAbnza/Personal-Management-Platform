import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { CardStatementForm } from "@/components/money/card-statement-form";
import {
  getCardStatement,
  getStatementEntrySetup,
} from "@/modules/finance/services/read-card-statements";
import {
  statementContext,
  statementOffset,
  statementPageError,
} from "../../_context";
export default async function ReviseStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string; statementId: string }>;
  searchParams: Promise<{ candidateOffset?: string }>;
}) {
  const scope = await statementContext(params),
    offset = statementOffset((await searchParams).candidateOffset);
  let data, setup;
  try {
    data = await getCardStatement({
      ...scope,
      statementId: scope.statementId!,
    });
    setup = await getStatementEntrySetup({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      offset,
    });
  } catch (e) {
    statementPageError(e);
    return (
      <p role="alert">
        Statement correction setup could not be loaded. Retry this page.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <Link
        href={`/money/cards/${scope.cardId}/statements/${scope.statementId}`}
        className="text-link underline"
      >
        Statement history
      </Link>
      <ScreenHeader scope="Money" title="Correct statement evidence" />
      <p>
        Revision {data.snapshot.version} will remain preserved. Review provider
        changes and supply a reason for the next revision.
      </p>
      {data.reconciliation.changedLinkedCount > 0 && (
        <p role="status">
          Some linked purchases were corrected. Retained links preserve earlier
          evidence; select the current purchase only if the provider confirms
          the corrected membership, date and amount.
        </p>
      )}
      {setup.hasMore && (
        <Link
          href={`?candidateOffset=${offset + 100}`}
          className="text-link underline"
        >
          Load older purchase choices before editing statement
        </Link>
      )}
      <CardStatementForm
        cardId={scope.cardId}
        currency={data.card.currency}
        candidates={setup.items}
        snapshot={data.snapshot}
      />
    </div>
  );
}
