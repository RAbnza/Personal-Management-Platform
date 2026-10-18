import Link from "next/link";
import {
  isDestinationCurrent,
  localDestinations,
  type Destination,
} from "./navigation-model";
import styles from "./shell.module.css";

export function LocalNavigation({ path }: { path: string }) {
  const isMoney = path.startsWith("/money/");
  const items = isMoney
    ? localDestinations("Money")
    : path.startsWith("/settings")
      ? localDestinations("Settings")
      : [];
  if (!items.length) return null;
  const plans = localDestinations("Plans");
  const link = ({ href, label }: Destination) => (
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
        <details
          key={path}
          open={
            plans.some(({ href }) => isDestinationCurrent(path, href)) ||
            undefined
          }
        >
          <summary>Plans</summary>
          <div>{plans.map(link)}</div>
        </details>
      )}
    </nav>
  );
}
