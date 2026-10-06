"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

import { AppNavigation } from "@/components/shell/app-navigation";
import { ThemeSelect } from "@/components/theme/theme-select";

export interface MobileNavigationProps {
  activePath: string;
}

export function MobileNavigation({ activePath }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={[
          "inline-flex min-h-11 items-center justify-center gap-2",
          "rounded-button border border-input bg-secondary px-3 py-2",
          "text-sm font-semibold text-secondary-foreground",
          "transition-colors duration-(--motion-duration-fast) ease-state",
          "hover:bg-accent hover:text-accent-foreground",
          "motion-reduce:transition-none",
          "lg:hidden",
        ].join(" ")}
      >
        <Menu aria-hidden="true" className="size-5" strokeWidth={1.9} />

        <span>Menu</span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-modal-backdrop) bg-(--overlay) lg:hidden" />

        <Dialog.Content
          className={[
            "fixed inset-y-0 left-0 z-(--z-modal)",
            "flex w-[min(20rem,calc(100vw-2rem))] flex-col",
            "border-r border-border bg-surface text-foreground",
            "shadow-level-3 outline-none",
            "lg:hidden",
          ].join(" ")}
        >
          <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                Navigation
              </Dialog.Title>

              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                Private personal workspace
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="Close navigation"
              className={[
                "inline-flex size-11 shrink-0 items-center justify-center",
                "rounded-button border border-transparent",
                "text-muted-foreground",
                "transition-colors duration-(--motion-duration-fast) ease-state",
                "hover:bg-accent hover:text-accent-foreground",
                "motion-reduce:transition-none",
              ].join(" ")}
            >
              <X aria-hidden="true" className="size-5" strokeWidth={1.9} />
            </Dialog.Close>
          </header>

          <nav
            aria-label="Primary"
            className="flex-1 overflow-y-auto px-3 py-4"
          >
            <AppNavigation
              activePath={activePath}
              onNavigate={() => setOpen(false)}
            />
          </nav>

          <div className="border-t border-border px-4 py-4">
            <ThemeSelect />

            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Additional modules will appear here as their application
              interfaces become available.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
