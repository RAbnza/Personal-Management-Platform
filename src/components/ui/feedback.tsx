import {
  AlertCircle,
  CheckCircle2,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FeedbackTone =
  "neutral" | "information" | "success" | "warning" | "danger";
const tones: Record<FeedbackTone, string> = {
  neutral: "bg-neutral-surface text-neutral",
  information: "bg-information-surface text-information",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
};
const icons = {
  neutral: Info,
  information: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: FeedbackTone;
}) {
  const Icon = icons[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

export function Notice({
  title,
  children,
  tone = "information",
  role,
}: {
  title: string;
  children: ReactNode;
  tone?: FeedbackTone;
  role?: "alert" | "status";
}) {
  const Icon = icons[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-panel border border-current/30 p-4 text-sm",
        tones[tone],
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-1 leading-6">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-panel border border-dashed border-input p-6 text-center">
      <p className="font-medium">{title}</p>
      <div className="mx-auto max-w-prose text-sm text-muted-foreground">
        {children}
      </div>
      {action}
    </div>
  );
}

export function InlineError({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Notice title="Something needs attention" tone="danger" role="alert">
      {children}
      {action ? <div className="mt-3">{action}</div> : null}
    </Notice>
  );
}

export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} aria-busy="true">
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 motion-safe:animate-spin"
        />
        {label}
      </p>
      {children ? (
        <div aria-hidden="true" className="mt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
