import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/feedback";

export type RecordColumn<T> = {
  key: string;
  label: string;
  cell: (record: T) => ReactNode;
  numeric?: boolean;
};

/** Presentation only: no client sorting, filtering or implicit selection. */
export function RecordTable<T>({
  label,
  records,
  columns,
  rowKey,
  selectedKey,
  empty,
}: {
  label: string;
  records: readonly T[];
  columns: readonly RecordColumn<T>[];
  rowKey: (record: T) => string;
  selectedKey?: string;
  empty: ReactNode;
}) {
  if (!records.length) return empty;
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-panel border border-border bg-surface"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-surface-subtle text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 font-medium",
                  column.numeric && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {records.map((record) => (
            <tr
              key={rowKey(record)}
              className={cn(
                "align-top",
                selectedKey === rowKey(record) && "bg-accent font-semibold",
              )}
              aria-current={selectedKey === rowKey(record) ? "true" : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-2",
                    column.numeric && "numeric-value text-right",
                  )}
                >
                  {column.cell(record)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type CompactRecord = {
  key: string;
  title: ReactNode;
  value?: ReactNode;
  metadata: ReactNode;
  status?: ReactNode;
  action: ReactNode;
};
export function CompactRecordList({
  label,
  records,
  empty,
}: {
  label: string;
  records: readonly CompactRecord[];
  empty?: ReactNode;
}) {
  if (!records.length)
    return (
      empty ?? (
        <EmptyState title="No records yet">
          Records will appear here when available.
        </EmptyState>
      )
    );
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border rounded-panel border border-border bg-surface"
    >
      {records.map((record) => (
        <li key={record.key} className="space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 font-medium wrap-anywhere">
              {record.title}
            </div>
            {record.value ? (
              <div className="numeric-value font-semibold wrap-anywhere">
                {record.value}
              </div>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">{record.metadata}</div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {record.status}
            {record.action}
          </div>
        </li>
      ))}
    </ul>
  );
}
