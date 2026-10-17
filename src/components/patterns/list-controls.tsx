import type { FormHTMLAttributes, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

type PageLinks = {
  firstHref?: string;
  previousHref?: string;
  nextHref?: string;
};
export type CursorPage = PageLinks & { kind: "cursor"; count: number };
export type OffsetPage = PageLinks & {
  kind: "offset";
  offset: number;
  count: number;
  total?: number;
};
export type ServerPage = CursorPage | OffsetPage;

/** Preserve opaque source cursors. No speculative Previous stack or page count. */
export function cursorPage(
  source: { nextCursor: string | null | undefined; count: number },
  hrefForCursor: (cursor: string) => string,
  links: Omit<PageLinks, "nextHref"> = {},
): CursorPage {
  return {
    kind: "cursor",
    count: source.count,
    ...links,
    ...(source.nextCursor
      ? { nextHref: hrefForCursor(source.nextCursor) }
      : {}),
  };
}

/** Only expose a next offset when the source explicitly reports more records. */
export function offsetPage(
  source: {
    offset: number;
    limit: number;
    count: number;
    hasMore: boolean;
    total?: number;
  },
  hrefForOffset: (offset: number) => string,
): OffsetPage {
  return {
    kind: "offset",
    offset: source.offset,
    count: source.count,
    ...(source.total !== undefined ? { total: source.total } : {}),
    ...(source.offset > 0
      ? {
          firstHref: hrefForOffset(0),
          previousHref: hrefForOffset(
            Math.max(0, source.offset - source.limit),
          ),
        }
      : {}),
    ...(source.hasMore
      ? { nextHref: hrefForOffset(source.offset + source.limit) }
      : {}),
  };
}

export function PageControls({
  page,
  label = "Record pages",
}: {
  page: ServerPage;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <p className="text-sm text-muted-foreground">
        {page.kind === "offset" && page.count > 0
          ? `${page.offset + 1}–${page.offset + page.count}${page.total !== undefined ? ` of ${page.total}` : ""}`
          : `${page.count} records shown`}
      </p>
      <div className="flex flex-wrap gap-2">
        {page.firstHref ? (
          <a
            href={page.firstHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            First
          </a>
        ) : null}
        {page.previousHref ? (
          <a
            href={page.previousHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            Previous
          </a>
        ) : null}
        {page.nextHref ? (
          <a
            href={page.nextHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            Next records
          </a>
        ) : null}
      </div>
    </nav>
  );
}

export function FilterBar({
  children,
  summary,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  summary: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      aria-label="Filter records"
      {...props}
      className="space-y-3 rounded-panel border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <p className="text-sm text-muted-foreground">{summary}</p>
    </form>
  );
}
