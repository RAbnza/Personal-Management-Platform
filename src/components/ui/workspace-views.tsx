"use client";
import { useEffect, useId, useState, type ReactNode } from "react";

/** Mounted panels retain drafts and pending command identities when browsing. */
export function WorkspaceViews({
  label,
  views,
}: {
  label: string;
  views: { label: string; content: ReactNode }[];
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const count = views.length;
  useEffect(() => {
    function revealHash() {
      let hash: string;
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(hash);
      if (!target) return;
      const index = Array.from({ length: count }, (_, i) => i).findIndex((i) =>
        document.getElementById(`${id}-${i}`)?.contains(target),
      );
      if (index >= 0) {
        setSelected(index);
        requestAnimationFrame(() =>
          target.scrollIntoView({ block: "nearest" }),
        );
      }
    }
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, [id, count]);
  return (
    <div className="min-w-0 space-y-5">
      <div
        aria-label={label}
        role="group"
        className="flex flex-wrap gap-2 rounded-card bg-surface-subtle p-2"
      >
        {views.map((view, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={selected === index}
            aria-controls={`${id}-${index}`}
            onClick={() => setSelected(index)}
            className={`min-h-11 rounded-control px-4 py-2 text-sm font-semibold transition-colors ${selected === index ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-surface"}`}
          >
            {view.label}
          </button>
        ))}
      </div>
      {views.map((view, index) => (
        <section
          key={index}
          id={`${id}-${index}`}
          aria-label={view.label}
          hidden={selected !== index}
          className="min-w-0 space-y-6"
        >
          {view.content}
        </section>
      ))}
    </div>
  );
}
