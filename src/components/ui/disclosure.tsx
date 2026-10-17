import type { ReactNode } from "react";

export function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-panel border border-border bg-surface p-4">
      <summary
        data-ui-control="disclosure"
        className="min-h-11 cursor-pointer content-center font-medium"
      >
        {title}
      </summary>
      <div className="mt-3 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}
