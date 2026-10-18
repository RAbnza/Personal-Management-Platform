"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronRight, ArrowLeft } from "lucide-react";
import {
  breadcrumbsFor,
  type BreadcrumbLabels,
  type BreadcrumbItem,
} from "./navigation-model";
import styles from "./shell.module.css";

type PageLocation = {
  path: string;
  labels: BreadcrumbLabels;
  parents?: BreadcrumbItem[];
};
const LocationContext = createContext<
  ((location: PageLocation) => () => void) | null
>(null);
/** Page-owned labels share the existing authorized read. No new data fetch or persistence. */
export function BreadcrumbRecords({ path, labels, parents }: PageLocation) {
  const register = useContext(LocationContext);
  const serialized = JSON.stringify({ path, labels, parents });
  useEffect(
    () => register?.(JSON.parse(serialized) as PageLocation),
    [register, serialized],
  );
  return null;
}
export function PageLocationProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const [location, setLocation] = useState<
    (PageLocation & { token: symbol }) | null
  >(null);
  const register = useCallback((value: PageLocation) => {
    const token = Symbol();
    setLocation({ ...value, token });
    return () =>
      setLocation((current) => (current?.token === token ? null : current));
  }, []);
  const items = useMemo(() => {
    const current = location?.path === path ? location : null;
    const trail = breadcrumbsFor(path, current?.labels);
    return current?.parents
      ? [...current.parents, trail[trail.length - 1]!]
      : trail;
  }, [path, location]);
  useEffect(() => {
    document.title = `${items.at(-1)?.label ?? "Home"} · Personal workspace`;
  }, [items]);
  return (
    <LocationContext.Provider value={register}>
      <Breadcrumbs items={items} />
      {children}
    </LocationContext.Provider>
  );
}
export function Breadcrumbs({ items }: { items: readonly BreadcrumbItem[] }) {
  if (items.length < 2) return null;
  const parentIndex = items.slice(0, -1).findLastIndex((item) => item.href);
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      <ol>
        {items.map((item, index) => (
          <li
            key={index}
            data-parent={index === parentIndex}
            data-current={index === items.length - 1}
          >
            {index > 0 && (
              <ChevronRight
                size={13}
                aria-hidden="true"
                className={styles.crumbSeparator}
              />
            )}
            {item.href ? (
              <Link href={item.href} title={item.label}>
                {index === parentIndex && (
                  <ArrowLeft
                    size={14}
                    aria-hidden="true"
                    className={styles.crumbBack}
                  />
                )}
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={index === items.length - 1 ? "page" : undefined}
                title={item.label}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
