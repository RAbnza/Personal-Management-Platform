"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";

/** Radix focuses Cancel by default. Async commands should prevent Action's close. */
export function ConfirmationDialog({
  trigger,
  title,
  description,
  action,
  children,
  ...props
}: ComponentProps<typeof AlertDialog.Root> & {
  trigger: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <AlertDialog.Root {...props}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--z-modal-backdrop) bg-(--overlay)" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-modal) max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border bg-popover p-5 text-popover-foreground shadow-level-3">
          <AlertDialog.Title className="text-section font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          {children}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>{action}</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
