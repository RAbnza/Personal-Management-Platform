import Link from "next/link";
import { isDestinationCurrent } from "./navigation-model";
import styles from "./shell.module.css";

const money = [
  ["/money/actions", "Activity"],
  ["/money/accounts", "Accounts"],
  ["/money/debts", "Debts"],
  ["/money/cards", "Cards"],
] as const;
const plans = [
  ["/money/recurring", "Recurring"],
  ["/money/budgets", "Budgets"],
  ["/money/goals", "Savings goals"],
  ["/money/forecasts", "Forecast"],
] as const;
const settings = [
  ["/settings", "Profile and preferences"],
  ["/settings/sessions", "Security"],
  ["/settings/notifications", "Notifications"],
  ["/settings/files", "Files"],
  ["/settings/portability", "Data"],
  ["/settings/lifecycle", "Account lifecycle"],
] as const;

export function LocalNavigation({ path }: { path: string }) {
  const isMoney = path.startsWith("/money");
  const items = isMoney
    ? money
    : path.startsWith("/settings")
      ? settings
      : null;
  if (!items) return null;
  const link = ([href, label]: readonly [string, string]) => (
    <Link
      key={href}
      href={href}
      aria-current={
        (
          href === "/settings"
            ? path === href
            : isDestinationCurrent(path, href)
        )
          ? "page"
          : undefined
      }
    >
      {label}
    </Link>
  );
  return (
    <nav
      className={styles.localNav}
      aria-label={isMoney ? "Money" : "Settings"}
    >
      {items.map(link)}
      {isMoney && (
        <details>
          <summary
            className={
              plans.some(([href]) => path.startsWith(href))
                ? "font-bold text-accent-foreground"
                : ""
            }
          >
            Plans
          </summary>
          <div className="flex flex-wrap gap-1">{plans.map(link)}</div>
        </details>
      )}
    </nav>
  );
}
