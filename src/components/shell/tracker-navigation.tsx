"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
/** Uses the existing minimal private bootstrap; never caches across identities. */
export function TrackerNavigation({
  activePath,
  onNavigate,
}: {
  activePath: string;
  onNavigate?: (() => void) | undefined;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const r = await fetch("/api/v1/me", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (live)
          setVisible(
            d.modules?.some(
              (m: { moduleKey: string; enabled: boolean }) =>
                m.moduleKey === "trackers" && m.enabled,
            ) ?? false,
          );
      } catch {
        /* Existing navigation stays usable while private bootstrap is unavailable. */
      }
    };
    void read();
    window.addEventListener("pmp-module-preferences-changed", read);
    return () => {
      live = false;
      window.removeEventListener("pmp-module-preferences-changed", read);
    };
  }, [activePath]);
  if (!visible) return null;
  return (
    <li>
      <Link
        href="/trackers"
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-current={activePath.startsWith("/trackers") ? "page" : undefined}
        className="relative flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ListChecks aria-hidden="true" className="size-5 shrink-0" />
        <span>Trackers</span>
      </Link>
    </li>
  );
}
