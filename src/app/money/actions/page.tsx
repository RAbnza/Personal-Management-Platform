import Link from "next/link";
import { listFinancialActions } from "@/modules/finance/services/list-financial-actions";
import { debtWorkspace } from "../debts/_workspace";
export default async function FinancialActionsPage() {
  const { user, workspace } = await debtWorkspace();
  let items;
  try {
    items = await listFinancialActions({
      userId: user.id,
      workspaceId: workspace.id,
    });
  } catch {
    return (
      <p role="alert">
        Financial activity could not be loaded. Retry this page.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Financial activity</h1>
      <p>
        Latest 100 logical actions. Corrections appear as revisions of their
        original action. Account history retains every signed ledger entry.
      </p>
      <ol className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.actionId} className="py-3">
            <Link
              className="text-link underline"
              href={`/money/actions/${i.actionId}`}
            >
              {i.description}
            </Link>
            <p>
              {i.actionKind.replaceAll("_", " ")} · {i.effectiveDate} · Revision{" "}
              {i.revisionNo}
              {i.changeKind === "void" ? " · Reversed" : ""}
            </p>
          </li>
        ))}
      </ol>
      {items.length === 0 && <p>No financial actions yet.</p>}
    </div>
  );
}
