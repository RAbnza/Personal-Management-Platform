import { ScreenHeader } from "@/components/patterns/work-area";
import Link from "next/link";
import { listCardInstallmentPlans } from "@/modules/finance/services/read-card-installments";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { statementOffset } from "../statements/_context";
import { installmentContext, installmentPageError } from "./_context";
export default async function InstallmentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  const scope = await installmentContext(params),
    q = await searchParams,
    offset = statementOffset(q.offset);
  let data;
  try {
    data = await listCardInstallmentPlans({
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      cardId: scope.cardId,
      offset,
    });
  } catch (e) {
    installmentPageError(e);
    return (
      <p role="alert">
        Installment evidence could not be loaded. Retry this page.
      </p>
    );
  }
  const base = `/money/cards/${scope.cardId}/installments`;
  return (
    <div className="space-y-6 break-words">
      <Link
        className="text-link underline"
        href={`/money/cards/${scope.cardId}`}
      >
        {data.card.name}
      </Link>
      <ScreenHeader scope="Money" title="Provider installment plans" />
      <p>
        Plans describe expected obligations. The original purchase recognizes
        spending once; only actual recorded payments, interest, fees and refunds
        change financial balances.
      </p>
      <Link
        className="inline-flex min-h-11 text-link underline"
        href={`${base}/new`}
      >
        Record provider installment plan
      </Link>
      <ul className="space-y-4">
        {data.plans.map((p) => (
          <li key={p.planId} className="rounded-md border border-border p-4">
            <Link className="text-link underline" href={`${base}/${p.planId}`}>
              {p.description}
            </Link>
            <p>
              Revision {p.version} —{" "}
              {p.lifecycle === "cancelled"
                ? "Provider cancelled"
                : p.eligible
                  ? "Active provider evidence"
                  : "Reconciliation required; projections suspended"}
            </p>
            <p>
              {p.installmentCount} installments; financed principal{" "}
              {formatMoneyMinorUnits(data.card.currency, p.principalMinor)}.
              First known due {p.firstDueDate ?? "Unknown"}; unknown dates{" "}
              {p.unknownDateCount}.
            </p>
          </li>
        ))}
      </ul>
      {data.plans.length === 0 && (
        <p>No provider installment plan is recorded.</p>
      )}
      {data.hasMore && (
        <Link
          className="inline-flex min-h-11 text-link underline"
          href={`?offset=${offset + 25}`}
        >
          More recorded plans
        </Link>
      )}
    </div>
  );
}
