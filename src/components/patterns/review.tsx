import type { ReactNode } from "react";
import { Notice, type FeedbackTone } from "@/components/ui/feedback";

export type SummaryRow = { key: string; label: string; value: ReactNode };
export function ReviewSummary({
  title,
  rows,
  children,
  detailKeys = [],
}: {
  title: string;
  rows: readonly SummaryRow[];
  children?: ReactNode;
  detailKeys?: readonly string[];
}) {
  return (
    <section className="rounded-panel border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-section font-semibold">{title}</h2>
      <dl className="mt-4 divide-y divide-border">
        {rows
          .filter((row) => !detailKeys.includes(row.key))
          .map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="numeric-value min-w-0 wrap-anywhere font-medium">
                {row.value}
              </dd>
            </div>
          ))}
      </dl>
      {detailKeys.length > 0 && (
        <details className="mt-3 border-t border-border">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
            More transaction details
          </summary>
          <dl>
            {rows
              .filter((row) => detailKeys.includes(row.key))
              .map((row) => (
                <div
                  key={row.key}
                  className="flex flex-wrap justify-between gap-3 py-2 text-sm"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="numeric-value min-w-0 wrap-anywhere font-medium">
                    {row.value}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      )}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export type CommandState =
  | "draft"
  | "review"
  | "submitting"
  | "confirmed"
  | "validation-failure"
  | "stale-revision"
  | "unknown-outcome"
  | "partial-completion";
const states: Record<CommandState, { title: string; tone: FeedbackTone }> = {
  draft: { title: "Draft · not saved", tone: "neutral" },
  review: { title: "Review before saving", tone: "information" },
  submitting: { title: "Saving…", tone: "information" },
  confirmed: { title: "Saved", tone: "success" },
  "validation-failure": {
    title: "Check the highlighted fields",
    tone: "danger",
  },
  "stale-revision": { title: "This record changed", tone: "warning" },
  "unknown-outcome": {
    title: "We couldn't confirm whether this saved",
    tone: "warning",
  },
  "partial-completion": { title: "Partially complete", tone: "warning" },
};
/** No command generation, validation, retry or optimistic financial logic. */
export function CommandStatus({
  state,
  children,
  action,
}: {
  state: CommandState;
  children: ReactNode;
  action?: ReactNode;
}) {
  const config = states[state];
  return (
    <Notice
      title={config.title}
      tone={config.tone}
      role={state === "validation-failure" ? "alert" : "status"}
    >
      {children}
      {action ? <div className="mt-3">{action}</div> : null}
    </Notice>
  );
}
