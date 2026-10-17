import type { ReactNode } from "react";
import styles from "./money-workspace.module.css";

export function isMoneyTask(path: string) {
  return /\/money\/(transactions|transfers)$|\/(borrow|import|pay|settle|revise-schedule|reconcile)$|\/(statements|installments)\/(new|[^/]+\/revise)$|\/commands\/new$/.test(
    path,
  );
}

/** Presentation only: queries, command state and review authority stay in adapters. */
export function MoneyWorkspace({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.workspace} data-money-task={isMoneyTask(path)}>
      {children}
    </div>
  );
}

export function MoneyColumns({ children }: { children: ReactNode }) {
  return <div className={styles.columns}>{children}</div>;
}

export function MoneyCreation({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className={styles.creation} open={open}>
      <summary>{title}</summary>
      <div className="min-w-0 pt-5">{children}</div>
    </details>
  );
}
