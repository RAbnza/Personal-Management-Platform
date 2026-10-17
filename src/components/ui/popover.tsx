"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useId, type ReactNode } from "react";
import { Button } from "./button";

export function Popover({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          aria-labelledby={titleId}
          sideOffset={8}
          collisionPadding={16}
          className="z-(--z-modal-popover) w-80 max-w-[calc(100vw-2rem)] rounded-panel border border-input bg-popover p-4 text-sm text-popover-foreground shadow-level-2"
        >
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <div className="mt-2">{children}</div>
          <PopoverPrimitive.Close asChild>
            <Button variant="ghost" className="mt-3">
              Close help
            </Button>
          </PopoverPrimitive.Close>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
