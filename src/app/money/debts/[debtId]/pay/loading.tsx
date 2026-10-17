import { ScreenHeader } from "@/components/patterns/work-area";
export default function PaymentLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <ScreenHeader scope="Money" title="Loading debt payment entry…" />
      <p className="text-muted-foreground">
        Reading current debt, account balances and installment remaining
        amounts.
      </p>
    </div>
  );
}
