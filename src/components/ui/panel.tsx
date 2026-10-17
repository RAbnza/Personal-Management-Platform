import { useId, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { InfoTip } from "./info-tip";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  action?: ReactNode;
  descriptionAsHelp?: boolean;
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  descriptionAsHelp = false,
  ...props
}: PanelProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={
        description && !descriptionAsHelp ? descriptionId : undefined
      }
      className={cn(
        "rounded-card border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    >
      <header className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-lg font-semibold tracking-[-0.01em] text-foreground"
          >
            {title}{" "}
            {description && descriptionAsHelp && (
              <InfoTip title={title}>{description}</InfoTip>
            )}
          </h2>

          {description && !descriptionAsHelp ? (
            <p
              id={descriptionId}
              className="mt-1 max-w-[68ch] text-sm leading-6 text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {children ? <div className="p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}
