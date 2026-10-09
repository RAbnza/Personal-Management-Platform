import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { FinancialActionUnavailableError } from "@/modules/finance/domain/financial-correction";
import { FinancialActionReviewForm } from "@/components/money/financial-action-review-form";
import { Panel } from "@/components/ui/panel";
import { getFinancialActionDetail } from "@/modules/finance/services/correct-financial-action";
import { listFinancialAccounts } from "@/modules/finance/services/list-financial-accounts";
import { listCategories } from "@/modules/core/services/list-categories";
import { formatMoneyMinorUnits } from "@/shared/money-display";
import { debtWorkspace } from "../../debts/_workspace";
export default async function FinancialActionPage({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  const { user, workspace } = await debtWorkspace(),
    id = z.uuid().safeParse((await params).actionId);
  if (!id.success) notFound();
  let detail, accounts, categories;
  try {
    [detail, accounts, categories] = await Promise.all([
      getFinancialActionDetail({
        userId: user.id,
        workspaceId: workspace.id,
        actionId: id.data,
      }),
      listFinancialAccounts({
        userId: user.id,
        workspaceId: workspace.id,
        includeArchived: true,
      }),
      listCategories({
        userId: user.id,
        workspaceId: workspace.id,
        includeArchived: true,
      }),
    ]);
  } catch (error) {
    if (error instanceof FinancialActionUnavailableError) notFound();
    return (
      <Panel
        title="Financial evidence unavailable"
        description="Current evidence could not be loaded safely."
      >
        <Link
          href={`/money/actions/${id.data}`}
          className="text-link underline"
        >
          Retry loading evidence
        </Link>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <Link href="/money/actions" className="text-link underline">
        Financial activity
      </Link>
      <h1 className="text-2xl font-semibold">{detail.current.description}</h1>
      <Panel
        title="Current logical action"
        description="One business action with its current revision and complete correction history."
      >
        <p>
          {detail.current.actionKind.replaceAll("_", " ")} · Revision{" "}
          {detail.current.revisionNo} ·{" "}
          {detail.current.changeKind === "void" ? "Reversed" : "Current"} ·
          Effective {detail.current.effectiveDate}
        </p>
        <ul>
          {detail.cashEffects.map((e, i) => (
            <li key={i}>
              {String(e.accountName)}:{" "}
              {formatMoneyMinorUnits(workspace.currency, String(e.signedMinor))}{" "}
              effective {String(e.effectiveDate)}
            </li>
          ))}
        </ul>
      </Panel>
      {detail.current.changeKind !== "void" && (
        <FinancialActionReviewForm
          detail={detail}
          accounts={accounts.items}
          categories={categories.items}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: workspace.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())}
        />
      )}
      <Panel
        title="Preserved revision history"
        description="Effective dates determine financial periods. Recorded times show when evidence was saved."
      >
        <ol className="space-y-4">
          {detail.history.map((h, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <p>
                Revision {String(h.revisionNo)} · {String(h.changeKind)} ·
                Effective {String(h.effectiveDate)}
              </p>
              <p>Recorded {String(h.recordedAt)}</p>
              {h.reason != null && <p>Reason: {String(h.reason)}</p>}
              {h.evidence != null &&
                typeof h.evidence === "object" &&
                "description" in h.evidence && (
                  <p>{String(h.evidence.description)}</p>
                )}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
