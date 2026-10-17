"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Menu({
  trigger,
  label,
  children,
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          loop
          aria-label={label}
          aria-labelledby={undefined}
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-(--z-modal-popover) min-w-48 max-w-[calc(100vw-2rem)] rounded-panel border border-input bg-popover p-1 text-popover-foreground shadow-level-2"
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function MenuItem({
  className,
  ...props
}: ComponentProps<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      data-ui-control="menu-item"
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm outline-offset-[-2px] data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:cursor-not-allowed data-disabled:text-disabled-foreground",
        className,
      )}
      {...props}
    />
  );
}
