import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Geometry and appearance only. Destinations and capability checks belong to
 * the caller; M1 uses this solely in development navigation prototypes. */
export function NavigationCapsule({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <nav
      {...props}
      className={cn(
        "flex items-stretch gap-1 rounded-[2rem] border border-navigation-border bg-navigation p-1.5 text-navigation-foreground shadow-level-2",
        className,
      )}
    />
  );
}

export const capsuleItem =
  "flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-[1.5rem] border-transparent bg-transparent px-4 py-2 text-sm font-medium text-navigation-foreground transition-colors hover:bg-navigation-active hover:text-navigation-active-foreground aria-[current=page]:bg-navigation-active aria-[current=page]:text-navigation-active-foreground aria-[current=true]:bg-navigation-active aria-[current=true]:text-navigation-active-foreground focus-visible:outline-navigation-active motion-reduce:transition-none";

export function CapsuleLink({
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={cn(capsuleItem, className)} />;
}
