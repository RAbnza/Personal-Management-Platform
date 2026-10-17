import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function WorkArea({
  children,
  className,
  variant = "list",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "list" | "record" | "report" | "editor";
}) {
  return (
    <div
      {...props}
      className={cn(
        "mx-auto w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:py-8 2xl:px-8",
        variant === "editor"
          ? "max-w-[1100px]"
          : "max-w-(--layout-content-max)",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ScreenHeader({
  title,
  scope,
  description,
  action,
  navigation,
}: {
  title: string;
  scope: string;
  description?: string;
  action?: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm text-muted-foreground">{scope}</p>
          <h1 className="text-page font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {navigation}
    </header>
  );
}

/** The caller chooses one detail presentation; mobile detail is a canonical route. */
export function DetailLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 items-start gap-6",
        detail &&
          "min-[1280px]:grid-cols-[minmax(600px,1fr)_minmax(340px,400px)]",
      )}
    >
      <div className="min-w-0">{children}</div>
      {detail ? (
        <aside aria-label="Selected record" className="min-w-0">
          {detail}
        </aside>
      ) : null}
    </div>
  );
}
