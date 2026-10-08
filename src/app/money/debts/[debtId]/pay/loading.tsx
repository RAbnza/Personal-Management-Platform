export default function PaymentLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <h1 className="text-2xl font-semibold">Loading debt payment entry…</h1>
      <p className="text-muted-foreground">
        Reading current debt, account balances and installment remaining
        amounts.
      </p>
    </div>
  );
}
