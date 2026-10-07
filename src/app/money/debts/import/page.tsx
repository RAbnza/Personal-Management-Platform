import { DebtImportForm } from "@/components/money/debt-import-form";
import { debtWorkspace } from "../_workspace";

export default async function ImportDebtPage() {
  const { workspace } = await debtWorkspace();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        Existing debt setup
      </h1>
      <DebtImportForm currency={workspace.currency} />
    </div>
  );
}
