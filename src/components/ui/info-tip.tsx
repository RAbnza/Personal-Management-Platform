import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover } from "./popover";

/** Keyboard- and touch-accessible supporting detail, never consequential alerts. */
export function InfoTip({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover
      title={title}
      trigger={
        <button
          type="button"
          aria-label={`About ${title}`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="space-y-2 leading-6">{children}</div>
    </Popover>
  );
}
