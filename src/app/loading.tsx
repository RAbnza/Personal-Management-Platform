export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-5 p-6"
    >
      <p className="font-semibold">Loading your Dashboard source records…</p>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-32 rounded-card border border-border bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
