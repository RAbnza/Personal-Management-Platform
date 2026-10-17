import { ScreenHeader } from "@/components/patterns/work-area";
import { DebtImportForm } from "@/components/money/debt-import-form";
import { debtWorkspace } from "../_workspace";

export default async function ImportDebtPage() {
  const { workspace } = await debtWorkspace();
  return (
    <div className="space-y-6">
      <ScreenHeader scope="Money" title="Existing debt setup" />
      <DebtImportForm currency={workspace.currency} />
    </div>
  );
}
