export default function CalendarLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-5 p-6"
    >
      <p className="font-semibold">Loading Agenda and in-app reminder state…</p>
      <div aria-hidden="true" className="space-y-4">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-32 rounded-card border border-border bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
