"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Controlled state and submission policy belong to the caller. */
export function DialogContent({
  title,
  description,
  children,
  className,
  presentation = "dialog",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description: string;
  presentation?: "dialog" | "sheet";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-modal-backdrop) bg-(--overlay)" />
      <DialogPrimitive.Content
        {...props}
        className={cn(
          "fixed z-(--z-modal) flex max-h-[90dvh] flex-col overflow-y-auto border border-border bg-popover p-5 text-popover-foreground shadow-level-3",
          presentation === "sheet"
            ? "inset-x-0 bottom-0 rounded-t-dialog sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[28rem] sm:max-w-full sm:max-h-dvh sm:rounded-none"
            : "top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-dialog",
          className,
        )}
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-section font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton label="Close" variant="ghost">
              <X className="size-5" />
            </IconButton>
          </DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetContent(
  props: Omit<ComponentProps<typeof DialogContent>, "presentation">,
) {
  return <DialogContent {...props} presentation="sheet" />;
}
