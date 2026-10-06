import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppNavigation } from "@/components/shell/app-navigation";
import { MobileNavigation } from "@/components/shell/mobile-navigation";
import {
  WorkspaceThemeSelect,
  type WorkspaceThemeName,
} from "@/components/theme/workspace-theme-select";

export interface AppShellProps {
  children: ReactNode;

  pageTitle: string;
  activePath: string;

  userName: string;
  userEmail: string;

  workspaceTheme: WorkspaceThemeName;
  workspacePreferenceVersion: number;
  gettingStartedDismissed: boolean;
}

export function AppShell({
  children,
  pageTitle,
  activePath,
  userName,
  userEmail,
  workspaceTheme,
  workspacePreferenceVersion,
  gettingStartedDismissed,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className={[
          "fixed left-4 top-4 z-(--z-notice)",
          "-translate-y-24 rounded-button border border-primary-border",
          "bg-primary px-4 py-2.5 text-sm font-semibold",
          "text-primary-foreground shadow-level-2",
          "transition-transform duration-(--motion-duration-fast)",
          "focus:translate-y-0",
          "motion-reduce:transition-none",
        ].join(" ")}
      >
        Skip to main content
      </a>

      <aside className="hidden min-h-screen border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="flex min-h-16 items-center border-b border-border px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Personal workspace
            </p>

            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={1.9}
              />

              <span>Private</span>
            </div>
          </div>
        </div>

        <nav aria-label="Primary" className="flex-1 px-3 py-4">
          <AppNavigation activePath={activePath} />
        </nav>

        <div className="border-t border-border px-5 py-4">
          <div className="mb-5 min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {userName}
            </p>

            <p className="mt-0.5 break-all text-xs leading-5 text-muted-foreground">
              {userEmail}
            </p>
          </div>

          <WorkspaceThemeSelect
            theme={workspaceTheme}
            version={workspacePreferenceVersion}
            gettingStartedDismissed={gettingStartedDismissed}
          />

          <SignOutButton className="mt-4" />

          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.9}
            />

            <p>
              This is your private personal workspace. Shared capabilities
              remain explicitly scoped when introduced.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header
          className={[
            "sticky top-0 z-(--z-sticky)",
            "flex min-h-16 items-center gap-3",
            "border-b border-border bg-surface",
            "px-4 sm:px-6",
          ].join(" ")}
        >
          <MobileNavigation
            activePath={activePath}
            userName={userName}
            userEmail={userEmail}
            workspaceTheme={workspaceTheme}
            workspacePreferenceVersion={workspacePreferenceVersion}
            gettingStartedDismissed={gettingStartedDismissed}
          />

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {pageTitle}
            </p>

            <p className="hidden text-xs text-muted-foreground sm:block">
              Private personal workspace
            </p>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-(--layout-content-max) px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
