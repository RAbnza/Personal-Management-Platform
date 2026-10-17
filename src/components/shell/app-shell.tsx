"use client";

import { useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, LockKeyhole } from "lucide-react";
import { SessionNoticeListener } from "@/components/auth/session-notice-listener";
import type { WorkspaceThemeName } from "@/components/theme/workspace-theme-select";
import { WorkspaceNavigation } from "./workspace-navigation";
import { LocalNavigation } from "./local-navigation";
import type { NavigationModule } from "./navigation-model";
import styles from "./shell.module.css";
import {
  MoneyWorkspace,
  isMoneyTask,
} from "@/components/money/money-workspace";

export interface AppShellProps {
  children: ReactNode;
  pageTitle: string;
  activePath: string;
  userName: string;
  userEmail: string;
  workspaceTheme: WorkspaceThemeName;
  workspacePreferenceVersion: number;
  gettingStartedDismissed: boolean;
  modules?: readonly NavigationModule[];
  task?: boolean;
}

export function AppShell({
  children,
  pageTitle,
  activePath,
  modules,
  task = false,
  ...identity
}: AppShellProps) {
  const mainContentId = `main-content-${useId()}`;
  const path = usePathname() ?? activePath;
  const focusedTask = task || isMoneyTask(path);
  return (
    <div className={`${styles.shell} workspace-shell`} data-task={focusedTask}>
      <SessionNoticeListener />
      <nav aria-label="Skip navigation" className="contents">
        <a
          href={`#${mainContentId}`}
          className="fixed top-4 left-4 z-(--z-notice) -translate-y-24 rounded-button border border-primary-border bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-level-2 transition-transform focus:translate-y-0 motion-reduce:transition-none"
        >
          Skip to main content
        </a>
      </nav>
      <header className={styles.frame}>
        <div className={styles.identity}>
          <span className="rounded-panel bg-accent p-2.5 text-accent-foreground">
            <LayoutGrid className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Personal workspace</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockKeyhole className="size-3" aria-hidden="true" />
              {path.startsWith("/sharing")
                ? "Shared group context"
                : "Private workspace"}
            </p>
          </div>
        </div>
        <WorkspaceNavigation
          key={`${identity.userEmail}:${modules?.map((m) => `${m.moduleKey}:${m.enabled}`).join(",") ?? "loading"}`}
          {...identity}
          activePath={path}
          task={focusedTask}
          {...(modules ? { initialModules: modules } : {})}
        />
      </header>
      <main
        id={mainContentId}
        tabIndex={-1}
        aria-label={pageTitle}
        className={styles.main}
      >
        {!focusedTask && <LocalNavigation path={path} />}
        {path.startsWith("/money/") && !path.startsWith("/money/forecasts") ? (
          <MoneyWorkspace path={path}>{children}</MoneyWorkspace>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
