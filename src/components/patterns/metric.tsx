import type { ReactNode } from "react";
import { Notice } from "@/components/ui/feedback";

export function Metric({
  label,
  value,
  context,
  source,
}: {
  label: string;
  value: string | null;
  context: string;
  source?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="numeric-value mt-2 text-focal font-bold wrap-anywhere">
        {value ?? "Unknown"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{context}</p>
      {source ? <div className="mt-2 text-sm text-link">{source}</div> : null}
    </div>
  );
}
export function CoverageNotice({
  title = "Coverage",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Notice title={title} tone="warning">
      {children}
    </Notice>
  );
}
