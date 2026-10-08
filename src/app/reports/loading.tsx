export default function ReportsLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 p-6">
      <p>Loading a consistent report snapshot…</p>
      <div
        aria-hidden="true"
        className="h-44 animate-pulse rounded-panel bg-muted motion-reduce:animate-none"
      />
      <p className="text-sm">
        Source values appear after the server read completes.
      </p>
    </div>
  );
}
